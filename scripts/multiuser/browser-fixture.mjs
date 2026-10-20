import http from 'node:http';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Neo4jStore} from '../../neo4j-store.mjs';
import {MultiuserStore} from './store.mjs';
import {FileArtifacts} from './artifacts.mjs';
import {Computations} from './computations.mjs';
import {Authentication} from './auth.mjs';
import {createMultiuserServer} from './http.mjs';
import {fixture} from './fixtures.mjs';
import {identity,token,equalSecret} from './core.mjs';
import {validateFixtureReuse,ensureFixtureViewer} from './browser-fixture-identity.mjs';
import {fixtureAssetRoot} from './browser-fixture-assets.mjs';

if(process.env.BIBLIOMAP_TEST_DISPOSABLE!=='1'||!process.env.BIBLIOMAP_TEST_URI||process.env.BIBLIOMAP_TEST_URI===process.env.NEO4J_URI||process.env.OIDC_CLIENT_SECRET)throw Error('This fixture is restricted to an explicit disposable test database, without institutional credentials.');
const assetRoot=await fixtureAssetRoot(process.env.BIBLIOMAP_TEST_ASSET_ROOT,process.env.BIBLIOMAP_TEST_DISPOSABLE);
const legacy=Neo4jStore.fromEnvironment({NEO4J_URI:process.env.BIBLIOMAP_TEST_URI,NEO4J_USERNAME:'neo4j',NEO4J_PASSWORD:process.env.BIBLIOMAP_TEST_PASSWORD,NEO4J_DATABASE:'neo4j'}),store=new MultiuserStore(legacy);await store.init();
const files=new FileArtifacts(path.resolve('.trials/multiuser-browser/artifacts'));await files.init(path.resolve('public'));
let issuer='https://test-institution.invalid/'+randomUUID(),users={},projects={};const evidence={};
const reuseAnchor=process.env.BIBLIOMAP_TEST_REUSE_PROJECT,reuseIds=process.env.BIBLIOMAP_TEST_REUSE_PROJECTS?.split(',');
if(reuseAnchor||reuseIds){
 if(reuseAnchor&&!/^[0-9a-f-]{36}$/.test(reuseAnchor)||reuseIds&&(reuseIds.length!==2||reuseIds.some(id=>!/^[0-9a-f-]{36}$/.test(id))))throw Error('Provide valid synthetic fixture project identifiers.');
 const projectIds=reuseIds||await store.tx(false,async transaction=>{
  const first=await transaction.run('MATCH (project:BMProject {id:$id})<-[:IN_PROJECT]-(:BMMembership {role:"owner"})<-[:HAS_MEMBERSHIP]-(user:BMUser {enabled:true}) WHERE project.deleted_at IS NULL RETURN user',{id:reuseAnchor});
  if(first.records.length!==1||!/^https:\/\/test-institution\.invalid\/[0-9a-f-]{36}$/.test(first.records[0].get('user').properties.issuer||''))throw Error('The fixture anchor must have one enabled synthetic owner.');
  const existingIssuer=first.records[0].get('user').properties.issuer,result=await transaction.run('MATCH (user:BMUser {issuer:$issuer,enabled:true})-[:HAS_MEMBERSHIP]->(:BMMembership {role:"owner"})-[:IN_PROJECT]->(project:BMProject) WHERE user.subject IN ["one","two"] AND project.deleted_at IS NULL RETURN user.subject AS subject,project.id AS id',{issuer:existingIssuer});
  if(result.records.length!==2||new Set(result.records.map(record=>record.get('subject'))).size!==2)throw Error('Each synthetic user must own one unambiguous fixture project.');
  return ['one','two'].map(name=>result.records.find(record=>record.get('subject')===name).get('id'));
 });
 const records=await store.tx(false,async transaction=>{const output=[];for(const id of projectIds){const result=await transaction.run('MATCH (project:BMProject {id:$id})<-[:IN_PROJECT]-(:BMMembership {role:"owner"})<-[:HAS_MEMBERSHIP]-(user:BMUser {enabled:true}) RETURN project,collect(user) AS owners',{id});if(result.records.length!==1)throw Error('Fixture project not found.');output.push({project:result.records[0].get('project').properties,owners:result.records[0].get('owners').map(user=>user.properties)});}return output;});
 ({issuer,users,projects}=validateFixtureReuse(records));
 for(const name of ['one','two']){const workspace=await store.workspace(users[name].id,projects[name].id);if(!workspace.resultId)throw Error('The reused fixture has no saved workspace.');const result=await store.result(users[name].id,projects[name].id,workspace.resultId);await files.get(result.artifact.checksum);}
}else{
const snapshot=fixture({richMetadata:true}),suffix=randomUUID();for(const work of snapshot.works){work.id+='-'+suffix;work.referenced_works=work.referenced_works.map(id=>id+'-'+suffix);}for(const work of snapshot.metadata)work.id+='-'+suffix;
const blob=await files.put(snapshot),artifactId=await store.tx(true,transaction=>store.registerArtifact(transaction,{...blob,scope:'public',kind:'evidence'}));
for(const name of ['one','two']){
 const user={id:identity(issuer,name),issuer,subject:name,name:'Test Researcher '+name,email:name+'@test.invalid',enabled:true,admin:false};users[name]=user;
 await store.tx(true,transaction=>transaction.run('CREATE (item:BMUser) SET item=$user',{user}));projects[name]=await store.createProject(user.id,'Research project '+name);evidence[name]=await store.attachEvidence(user.id,projects[name].id,artifactId,{query:'Synthetic leadership evidence',retrieved:10,evidenceDate:'2026-10-17T12:00:00Z'});
}
}
users.viewer=await ensureFixtureViewer(store,issuer,users.one,projects.one);
const computations=new Computations(store,files,{pollMs:100}).start(),config={origin:'http://127.0.0.1:18086',configured:true,secure:false,issuer},auth=new Authentication(store,config),secure=createMultiuserServer({store,files,computations,config,authentication:auth,assetRoot}),key=token();
for(const name of reuseAnchor||reuseIds?[]:['one','two']){
 const request=await computations.analysis(users[name].id,projects[name].id,evidence[name].id,{threshold:2,support:2,resolution:.02});let result;
 while(!result?.resultId){result=await computations.status(users[name].id,request.id);if(result.status==='failed')throw Error(result.message);await new Promise(resolve=>setTimeout(resolve,100));}
 await store.saveWorkspace(users[name].id,projects[name].id,0,{resultId:result.resultId,evidenceId:evidence[name].id});
}
const server=http.createServer(async(request,response)=>{
 const url=new URL(request.url,config.origin);
 if(url.pathname==='/fixture/login'&&equalSecret(url.searchParams.get('key'),key)&&users[url.searchParams.get('user')]){
  const session=await store.newSession(users[url.searchParams.get('user')].id);response.writeHead(302,{'Set-Cookie':auth.cookie('bm_session',session.secret,43200),Location:'/conservative-atlas/index.html','Cache-Control':'no-store'});response.end();return;
 }
 secure.emit('request',request,response);
});
server.listen(18086,'127.0.0.1',()=>console.log(JSON.stringify({first:config.origin+'/fixture/login?user=one&key='+key,second:config.origin+'/fixture/login?user=two&key='+key,third:config.origin+'/fixture/login?user=viewer&key='+key,projects})));
async function close(){server.close();await computations.close();await legacy.close();process.exit();}process.once('SIGINT',close);process.once('SIGTERM',close);

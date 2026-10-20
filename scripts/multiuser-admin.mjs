import path from 'node:path';
import {Neo4jStore} from '../neo4j-store.mjs';
import {MultiuserStore} from './multiuser/store.mjs';
import {FileArtifacts} from './multiuser/artifacts.mjs';
import {migrate,cleanup} from './multiuser/maintenance.mjs';
import {identity} from './multiuser/core.mjs';

const command=process.argv[2],execute=process.argv.includes('--execute');
if(!['migrate','cleanup','report'].includes(command))throw Error('Usage: node --env-file=.env.local scripts/multiuser-admin.mjs migrate|cleanup|report [--execute]');
const legacy=Neo4jStore.fromEnvironment(),store=new MultiuserStore(legacy),files=new FileArtifacts(process.env.BIBLIOMAP_ARTIFACT_ROOT||path.resolve('.local-artifacts'));
try{
 await store.init();await files.init(path.resolve('public'));
 const owner={issuer:process.env.BIBLIOMAP_OWNER_ISSUER,subject:process.env.BIBLIOMAP_OWNER_SUBJECT,email:process.env.BIBLIOMAP_OWNER_EMAIL,name:process.env.BIBLIOMAP_OWNER_NAME};
 let result;
 if(command==='migrate')result=await migrate(store,files,owner,{execute});
 else{
  const admin=await store.user(identity(owner.issuer||'',owner.subject||''));if(!admin?.admin)throw Error('Configure the migrated administrator identity before running maintenance.');
  if(command==='cleanup')result=await cleanup(store,files,{execute});
  else result=await store.tx(false,async transaction=>{const reuse=(await transaction.run('MATCH (item:BMCalculation) RETURN item.stage AS stage,sum(coalesce(item.cacheHits,0)) AS cacheHits,sum(coalesce(item.joinedRequests,0)) AS joinedRequests,count(item) AS configurations')).records.map(record=>record.toObject()),jobs=(await transaction.run('MATCH (item:BMJob) RETURN item.stage AS stage,item.state AS state,count(item) AS runs')).records.map(record=>record.toObject());return {reuse,jobs};});
 }
 console.log(JSON.stringify(result,null,2));
}finally{await legacy.close();}

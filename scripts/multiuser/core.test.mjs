import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {canonical,digest,calculation,analysisSettings,topologyInputs,textInputs,scopeFor,equalSecret} from './core.mjs';
import {FileArtifacts} from './artifacts.mjs';
import {configuration} from './auth.mjs';

test('canonical inputs normalize defaults, order and irrelevant display preferences',()=>{
 assert.equal(canonical({right:2,left:1}),canonical({left:1,right:2}));assert.equal(canonical(-0),'0');assert.throws(()=>canonical(NaN));assert.throws(()=>canonical(new Set()));
 const original=analysisSettings({threshold:'10',members:['b','a','a'],nodeScale:99}),equivalent=analysisSettings({members:['a','b']});assert.deepEqual(original,equivalent);
 const first=calculation('network','public',original),second=calculation('network','public',equivalent);assert.equal(first.id,second.id);
 assert.deepEqual(analysisSettings({order:2,maximumOrder:3}),analysisSettings({order:2,maximumOrder:100}));
 assert.notEqual(first.id,calculation('network','project:00000000-0000-0000-0000-000000000001',original).id);
 assert.notEqual(first.id,calculation('network','public',{...original,support:6}).id);assert.notEqual(first.id,calculation('network','public',original,{},[],'next-engine').id);
 const works=[{id:'b',referenced_works:['x','x','z'],display_name:'Before'},{id:'a',referenced_works:[]}],changed=structuredClone(works);changed[0].display_name='After';changed.reverse();
 assert.deepEqual(topologyInputs(works),topologyInputs(changed));assert.notDeepEqual(textInputs(works),textInputs(changed));assert.equal(scopeFor('id',true),'public');assert.equal(scopeFor('id',false),'project:id');
 assert.equal(equalSecret('same','same'),true);assert.equal(equalSecret('same','other'),false);assert.throws(()=>analysisSettings({algorithm:'untrusted'}));assert.throws(()=>analysisSettings({method:'coupling',networkModel:'higher-order'}));
});
test('artifact storage is checksummed, content-addressed and outside the web root',async()=>{
 const folder=await mkdtemp(path.join(os.tmpdir(),'bibliomap-artifacts-')),files=new FileArtifacts(path.join(folder,'storage'));
 try{await files.init(folder);assert.fail('Nested web artifacts accepted.');}catch(problem){assert.match(problem.message,/outside/);}
 try{await files.init(path.join(process.cwd(),'public'));const one=await files.put({b:2,a:1}),two=await files.put({a:1,b:2});assert.equal(one.checksum,two.checksum);assert.deepEqual(await files.get(one.checksum),{a:1,b:2});assert.throws(()=>files.location('../private'));await writeFile(files.location(one.checksum),'{}');await assert.rejects(files.get(one.checksum),/integrity/);}finally{assert(path.resolve(folder).startsWith(path.resolve(os.tmpdir())+path.sep));await rm(folder,{recursive:true,force:true});}
});
test('institutional configuration has no anonymous fallback or callback wildcards',()=>{
 assert.equal(configuration({}).configured,false);assert.throws(()=>configuration({BIBLIOMAP_PUBLIC_URL:'https://example.org/path'}));assert.throws(()=>configuration({BIBLIOMAP_PUBLIC_URL:'http://example.org'}));
 const configured=configuration({BIBLIOMAP_PUBLIC_URL:'https://example.org',OIDC_ISSUER:'https://identity.example.org',OIDC_CLIENT_ID:'registered',OIDC_CLIENT_SECRET:'secret',BIBLIOMAP_SERVICE_TOKEN:'a'.repeat(32)});assert.equal(configured.configured,true);
});

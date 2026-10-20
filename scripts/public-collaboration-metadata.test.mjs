import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {scienceDigest} from './scientific-manifest.mjs';
import {readPublicCollaborationMetadata} from './public-collaboration-metadata.mjs';
import {preparedCollaborationEvidence} from './collaboration-networks.mjs';
const works=()=>[{id:'https://openalex.org/W1',title:'Public title',publication_year:2020,publication_date:null,authors_count:1,authorships:[{author:{id:'https://openalex.org/A1',display_name:'Public author'},institutions:[{id:'https://openalex.org/I1',display_name:'Public institution',country_code:'US',lineage:['https://openalex.org/I1']}],countries:['US']}]}];
test('public supplemental endpoint validates exact corpus/IDs/titles/hash and rejects top/nested/private fields',async()=>{
 const folder=await mkdtemp(path.join(os.tmpdir(),'bibliomap-public-')),file=path.join(folder,'metadata.json'),evidence={sourceCorpusId:'public-only',articles:works()};
 try{const value={publicCorpus:true,sourceCorpusId:'public-only',preparedAt:new Date().toISOString(),retrievedAt:null,extractionVersion:'public-authorship-allowlist-v1',sourceFileChecksum:'0'.repeat(64),works:works()};value.checksum=await scienceDigest(value.works);await writeFile(file,JSON.stringify(value));assert.equal((await readPublicCollaborationMetadata(file,evidence,'public-only')).works.length,1);await assert.rejects(readPublicCollaborationMetadata(file,evidence,'private-project'),/No supplemental/);await assert.rejects(preparedCollaborationEvidence(evidence.articles,value,'public-only',true,true),/Private/);
 for(const change of [v=>{v.query='Private query';},v=>{v.works[0].id='W9';},v=>{v.works[0].title='Different';},v=>{v.works[0].authorships[0].raw_affiliation_strings=['Private'];},v=>{v.works[0].authorships[0].countries={US:true};},v=>{v.works[0].authorships[0].institutions[0].lineage=[{id:'I1'}];}]){const copy=structuredClone(value);change(copy);copy.checksum=await scienceDigest(copy.works);await writeFile(file,JSON.stringify(copy));await assert.rejects(readPublicCollaborationMetadata(file,evidence,'public-only'));}
 }finally{await rm(folder,{recursive:true,force:true});}
});

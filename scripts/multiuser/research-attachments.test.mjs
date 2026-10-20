import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareAttachments} from './research-attachments.mjs';
import {digest} from './core.mjs';

test('explicit native attachment freezes public graph/settings/universes and no private payload',async()=>{
 const binding={userId:'owner',projectId:'project'},id='a'.repeat(64),checksum='b'.repeat(64),calls=[];
 const integration={store:{evidence:async(...args)=>{calls.push(args);return {artifact:{checksum:'c'.repeat(64)}};}},result:async(actual,resultId)=>{assert.equal(actual,binding);assert.equal(resultId,id);return {id,checksum,backend:'bibliomap',payload:{evidenceChecksum:'c'.repeat(64),settings:{preset:'explicit-fixture'},prepared:{works:[{id:'W1'},{id:'W2'}]},graph:{nodes:[{id:'W1'},{id:'W2'}],links:[],canvasKind:'coupling'},privateReviewer:'DO_NOT_COPY',providerPrompt:'DO_NOT_COPY'}};}};
 const [value]=await prepareAttachments(integration,binding,[{resultId:id,relationship:'same_evidence'}],'evidence');assert.equal(value.parent.evidence_id,'evidence');assert.equal(value.parent.result_checksum,checksum);assert.equal(value.relationship,'same_evidence');assert.equal(calls.length,1);assert.ok(!JSON.stringify(value).includes('DO_NOT_COPY'));
 for(const doc of value.documents)assert.equal(doc.sha256,digest(Buffer.from(doc.text)));
 assert.deepEqual(JSON.parse(value.documents.find(doc=>doc.name==='source-universe.json').text).prepared_source_ids,['W1','W2']);
 integration.store.evidence=async()=>({artifact:{checksum:'d'.repeat(64)}});
 await assert.rejects(()=>prepareAttachments(integration,binding,[{resultId:id,relationship:'same_evidence'}],'different'),/not bound/);
 assert.equal((await prepareAttachments(integration,binding,[{resultId:id,relationship:'explicit_comparison'}],'different'))[0].relationship,'explicit_comparison');
 await assert.rejects(()=>prepareAttachments(integration,binding,[{resultId:id,relationship:'same_evidence',path:'untrusted'}],'evidence'),/Choose distinct/);
});

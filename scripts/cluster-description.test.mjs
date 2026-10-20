import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareDescription, validateDescription, verifiedDescription, excerptCatalog, resolveExcerpts, descriptionRequest, descriptionMessages, descriptionRepairMessage} from './cluster-description-core.mjs';

const packet = {documents: [{id:'a',role:'member',title:'Adaptive leadership in teams',abstract:''},{id:'b',role:'member',title:'Shared leadership in teams',abstract:''},{id:'c',role:'neighbor',title:'Organizational learning methods',abstract:''}]};
const evidence = [{id:'a',field:'title',quote:'leadership in teams'},{id:'b',field:'title',quote:'leadership in teams'}];
const result = () => ({heading:'Leadership in teams',status:'shared-theme',summary:{text:'These titles concern leadership in teams.',evidence:structuredClone(evidence)},concepts:[],exceptions:[],contrast:null});

test('accepts literal evidence but makes no semantic-confidence claim',()=>{assert.equal(validateDescription(result(),packet).heading,'Leadership in teams');});
test('rejects invented quotations, identifiers and fields',()=>{
 for(const change of [{quote:'made-up quotation'},{id:'unknown'},{field:'fulltext'}]){
  const value=result();Object.assign(value.summary.evidence[0],change);assert.throws(()=>validateDescription(value,packet));
 }
});
test('repeated citations and neighbor evidence cannot establish member commonality',()=>{
 const value=result();value.summary.evidence[1]={...value.summary.evidence[0]};assert.throws(()=>validateDescription(value,packet));
 value.summary.evidence[1]={id:'c',field:'title',quote:'Organizational learning'};assert.throws(()=>validateDescription(value,packet));
});
test('contrasts require both member and neighbor evidence',()=>{
 const value=result();value.contrast={text:'A comparison.',evidence:[evidence[0]]};assert.throws(()=>validateDescription(value,packet));
 value.contrast.evidence.push({id:'c',field:'title',quote:'Organizational learning'});assert(validateDescription(value,packet).contrast);
});
test('duplicate titles do not count as independent support',()=>{
 const duplicate = structuredClone(packet); duplicate.documents[1].title = duplicate.documents[0].title;
 assert.throws(()=>validateDescription(result(),duplicate));
});
test('fixed excerpt keys resolve only to original text and reject invented keys',()=>{
 const catalog=excerptCatalog(packet), value=result();
 value.summary.evidence=[catalog[0].key,catalog[1].key];
 const resolved=resolveExcerpts(value,packet);assert.equal(resolved.summary.evidence[0].quote,packet.documents[0].title);
 assert.equal(validateDescription(resolved,packet).summary.evidence.length,2);
 value.summary.evidence=['invented'];assert.throws(()=>resolveExcerpts(value,packet));
});
test('optional unsupported concepts are omitted, not relabeled as shared evidence',()=>{
 const value=result();value.concepts=[{text:'Unsupported topic',evidence:[evidence[0]]}];
 const checked=verifiedDescription(value,packet);assert.equal(checked.concepts.length,0);assert.equal(checked.evidenceWarnings.length,1);
 value.summary.evidence=[evidence[0]];assert.throws(()=>verifiedDescription(value,packet));
});
test('a rejected broad summary can fall back only to a verified narrower concept',()=>{
 const value=result();value.summary.evidence=[evidence[0]];value.concepts=[{text:'team leadership',evidence}];
 const checked=verifiedDescription(value,packet);assert.equal(checked.status,'limited-evidence');assert.equal(checked.heading,'team leadership');assert(checked.evidenceWarnings[0].includes('broader'));
});
test('membership requests ignore display filters and are canonical',()=>{
 const graph={nodes:[{id:'b',cluster:2},{id:'a',cluster:1},{id:'u',cluster:0}],extensionFilter:{keys:[]}};
 assert.deepEqual(descriptionRequest(graph,1,'corpus').nodes,[{id:'a',cluster:'1'},{id:'b',cluster:'2'}]);
});
test('selection samples central and diverse members and keeps foundations separate',()=>{
 const nodes=Array.from({length:18},(_,index)=>({id:String(index),cluster:index<15?'1':'2'}));
 const documents=Object.fromEntries(nodes.map((node,index)=>[node.id,{title:'Article '+index,abstract:'text',embedding:Buffer.from([100,index*3]).toString('base64')}]));
 const themes={'1':{heading:'Baseline',keywords:[]},'2':{total:3,keywords:[],representatives:[{id:'15'}]}};
 const data={dimensions:2,documents};
 const prepared=prepareDescription({kind:'coupling',cluster:'1',nodes},data,themes,Object.fromEntries(nodes.map(node=>[node.id,['r','r']])));
 assert.equal(prepared.coverage.abstractSample,12);assert.equal(prepared.coverage.sampled,15);assert.equal(prepared.coverage.members,15);assert.equal(prepared.documents.filter(doc=>doc.role==='neighbor').length,1);assert.equal(prepared.foundations[0].count,15);
 assert(descriptionMessages(prepared)[0].content.includes('untrusted data'));
});

test('title evidence can support a theme when all abstracts are missing', () => {
 const value = result();
 assert.equal(verifiedDescription(value, packet).status, 'shared-theme');
 const input = JSON.parse(descriptionMessages({...packet, coverage: {}})[1].content);
 assert.equal(input.memberTitleEvidence.length, 2);
 assert(input.memberTitleEvidence.every(excerpt => excerpt.role === 'member' && excerpt.field === 'title'));
 assert(input.memberTitleEvidence.some(excerpt => excerpt.id === 'b'));
});

test('repair identifies repeated work citations and offers distinct member titles', () => {
 const expanded = structuredClone(packet); expanded.documents[0].abstract = 'Detailed leadership discussion. '.repeat(20);
 const catalog = excerptCatalog(expanded), keys = catalog.filter(excerpt => excerpt.id === 'a').slice(0, 3).map(excerpt => excerpt.key);
 const repair = descriptionRepairMessage(JSON.stringify({summary: {evidence: keys}}), expanded, new Error('Shared claims need two distinct member articles with different titles'));
 assert(repair.includes('cites 1 distinct member works: a'));
 assert(repair.includes('Shared leadership in teams'));
 assert(repair.includes('title excerpt keys'));
});

test('title overview is bounded and includes works outside the abstract sample', () => {
 const nodes = Array.from({length: 70}, (_,position) => ({id: String(position), cluster: '1'}));
 const documents = Object.fromEntries(nodes.map((member, position) => [member.id, {title: 'Distinct topic ' + position, abstract: 'Abstract ' + position, embedding: Buffer.from([100, position]).toString('base64')}]));
 const prepared = prepareDescription({kind:'cocitation', cluster:'1', nodes}, {dimensions:2, documents}, {'1': {keywords:[], total:70, heading:'Topics'}});
 assert.equal(prepared.documents.length, 48);
 assert.equal(prepared.coverage.sampled, 48);
 assert.equal(prepared.documents.filter(document => document.abstract).length, 12);
 assert.equal(new Set(prepared.documents.map(document => document.id)).size, 48);
});

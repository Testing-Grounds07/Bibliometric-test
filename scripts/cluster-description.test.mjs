import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareDescription, validateDescription, verifiedDescription, excerptCatalog, resolveExcerpts, descriptionRequest, descriptionMessages, descriptionRepairMessage,DESCRIPTION_VERSION,KEYWORD_VERSION,descriptionResultMatches,supportedTopicChoices,groundedSchema} from './cluster-description-core.mjs';

const packet = {documents: [{id:'a',role:'member',title:'Adaptive leadership in teams',abstract:''},{id:'b',role:'member',title:'Shared leadership in teams',abstract:''},{id:'c',role:'neighbor',title:'Organizational learning methods',abstract:''}]};
const evidence = [{id:'a',field:'title',quote:'leadership in teams'},{id:'b',field:'title',quote:'leadership in teams'}];
const result = () => ({heading:'Leadership in teams',status:'shared-theme',summary:{text:'The sampled texts focus on leadership in teams.',evidence:structuredClone(evidence)},concepts:[],exceptions:[],contrast:null});

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
 const value=result();value.summary.evidence=[evidence[0]];value.concepts=[{text:'leadership in teams',evidence}];
 const checked=verifiedDescription(value,packet);assert.equal(checked.status,'limited-evidence');assert.equal(checked.heading,'leadership in teams');assert(checked.evidenceWarnings[0].includes('broader'));
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


test('naming identity invalidates old prompt and keyword results without changing scope',()=>{
 const graph={nodes:[{id:'b',cluster:2},{id:'a',cluster:1},{id:'isolated',cluster:0}]},request=descriptionRequest(graph,1,'exact-corpus'),current={version:DESCRIPTION_VERSION,keywordVersion:KEYWORD_VERSION};
 assert.deepEqual(request.nodes,[{id:'a',cluster:'1'},{id:'b',cluster:'2'}]);assert(descriptionResultMatches(request,current));
 for(const value of [{...current,version:'grounded-clusters-9'},{...current,keywordVersion:'old'},{}])assert.equal(descriptionResultMatches(request,value),false);
 assert.notEqual(JSON.stringify(request),JSON.stringify({...request,version:'grounded-clusters-9'}));
});

test('bounded naming packet carries descriptive sibling counts and literal negation without inferring absence',()=>{
 const documents={};const nodes=[];for(let i=0;i<20;i++){const id=String(i).padStart(2,'0');nodes.push({id,cluster:'1'});documents[id]={title:'Harbor pumps '+i,abstract:'No improvement in pump output was observed.',embedding:Buffer.from([100,0]).toString('base64')};}
 for(let i=2;i<=15;i++){const id='other'+i;nodes.push({id,cluster:String(i)});documents[id]={title:'Forest sensors '+i,abstract:'',embedding:Buffer.from([100,0]).toString('base64')};}
 const themes={'1':{total:20,withText:20,keywords:[{text:'pump output',sources:[{id:'19'}],clusterWithText:20,outsideSupport:0,outsideWithText:14}],representatives:[]}};
 for(let i=2;i<=15;i++)themes[i]={total:1,withText:1,keywords:[],representatives:[{id:'other'+i}]};
 const prepared=prepareDescription({kind:'coupling',cluster:'1',nodes},{dimensions:2,documents},themes),messages=descriptionMessages(prepared);
 assert.equal(prepared.coverage.abstractSample,12);assert(prepared.documents.find(d=>d.id==='19').abstract,'explicit keyword-supporting source receives an abstract slot');assert.equal(prepared.siblingKeywordContext.length,12);assert.equal(prepared.siblingContextCoverage.available,14);assert.equal(prepared.keywords[0].outsideWithText,14);assert.match(JSON.stringify(messages),/No improvement/);assert.match(messages[0].content,/not proof/);assert.match(messages[0].content,/Do not force unique names/);assert.match(messages[0].content,/Tiny clusters/);assert.equal(prepared.documents.filter(d=>d.role==='member').length,20);
});

test('empty headings and foreign-context quotations are rejected; literal checks do not certify topic semantics',()=>{
 assert.throws(()=>validateDescription({...result(),heading:'  '},packet));const value=result();value.summary.evidence[0]={id:'a',field:'title',quote:'Organizational learning'};assert.throws(()=>validateDescription(value,packet));
 const repeated=result();assert.equal(validateDescription(repeated,packet).heading,validateDescription(repeated,packet).heading,'equal supported headings are allowed, not forced apart');
});


test('unsupported sectors and inferred concepts fail even when all quotation bytes are valid',()=>{
 const wrong=result();wrong.summary.text='The sampled texts focus on leadership in education, healthcare and public governance.';assert.throws(()=>validateDescription(wrong,packet),/absent from its cited excerpts/);
 const badHeading=result();badHeading.heading='Leadership in healthcare';assert.throws(()=>validateDescription(badHeading,packet),/absent/);
 const concept=result();concept.concepts=[{text:'organizational change',evidence}];const checked=verifiedDescription(concept,packet);assert.equal(checked.concepts.length,0);assert.match(checked.evidenceWarnings[0],/omitted/);
 const supported=result();supported.concepts=[{text:'leadership in teams',evidence}];assert.equal(verifiedDescription(supported,packet).concepts.length,1);
 const misleading=result();misleading.summary.text='The sampled texts focus on leadership in teams.';misleading.concepts=[{text:'teams leadership',evidence}];assert.equal(verifiedDescription(misleading,packet).concepts.length,0,'reordered inferred phrase is not accepted as verbatim');
});


test('constructive topic choices bind exact phrases to distinct member excerpt keys before generation',()=>{
 const input={...packet,keywords:[{phrase:'leadership in teams'},{phrase:'organizational change'},{phrase:'Organizational learning'}],sharedVocabulary:[{text:'leadership in teams'}]};
 const choices=supportedTopicChoices(input);assert.equal(choices.length,1);assert.equal(choices[0].phrase,'leadership in teams');assert.equal(choices[0].supportingSampleMembers,2);assert.equal(choices[0].evidence.length,2);const catalog=new Map(excerptCatalog(input).map(x=>[x.key,x]));assert.equal(new Set(choices[0].evidence.map(key=>catalog.get(key).id)).size,2);
 const schema=groundedSchema(input);assert.equal(schema.properties.heading.enum,undefined,'heading may be a natural lexical-grounded noun phrase');assert.deepEqual(schema.properties.summary.required,['evidence']);assert.equal(schema.properties.summary.properties.text,undefined,'summary prose is not model generated');assert.deepEqual(schema.properties.summary.properties.evidence.items.enum,excerptCatalog(input).filter(x=>x.role==='member').map(x=>x.key));assert.equal(schema.properties.summary.properties.evidence.uniqueItems,true);
 const user=JSON.parse(descriptionMessages(input)[1].content);assert.deepEqual(user.supportedTopicChoices,choices);assert.match(descriptionRepairMessage('{}',input,new Error('bad')),/FULL original source/);
 const duplicate=structuredClone(input);duplicate.documents[1].title=duplicate.documents[0].title;assert.equal(supportedTopicChoices(duplicate).length,0,'same-title duplicates do not manufacture two-source commonality');
});


test('current inference accepts full-catalog member citations and host sentence, but not generated summary prose',()=>{
 const input={...packet,version:DESCRIPTION_VERSION,keywords:[{phrase:'leadership in teams'}]},choice=supportedTopicChoices(input)[0],wire={...result(),summary:{evidence:choice.evidence}};
 const resolved=resolveExcerpts(wire,input);assert.equal(resolved.summary.text,'The sampled texts focus on Leadership in teams.');assert.equal(verifiedDescription(resolved,input).summary.text,resolved.summary.text);
 assert.throws(()=>resolveExcerpts({...wire,summary:{...wire.summary,text:'An invented sector list'}},input),/summary evidence only/);assert.throws(()=>resolveExcerpts({...wire,summary:{...wire.summary,topic:'healthcare'}},input),/summary evidence only/);const neighbor=excerptCatalog(input).find(x=>x.role==='neighbor').key;assert.throws(()=>verifiedDescription(resolveExcerpts({...wire,summary:{evidence:[choice.evidence[0],neighbor]}},input),input),/distinct member/);
 const abstractInput={...input,documents:[{...input.documents[0],abstract:'Leadership in teams is discussed.'},{...input.documents[1],abstract:'Shared leadership in teams.'}]},abstractKeys=excerptCatalog(abstractInput).filter(x=>x.field==='abstract').map(x=>x.key);assert.equal(verifiedDescription(resolveExcerpts({...wire,summary:{evidence:abstractKeys}},abstractInput),abstractInput).heading,wire.heading,'advisory title choices do not prohibit matching abstract citations');
});

test('single-cited-source heading details qualify shared status without erasing the proposal or claiming semantic mixture',()=>{
 const input={documents:[{id:'a',role:'member',title:'Climate adaptation in coastal communities',abstract:''},{id:'b',role:'member',title:'Climate adaptation in mountain regions',abstract:''}]},value={heading:'Climate adaptation in coastal communities',status:'shared-theme',summary:{text:'The sampled texts focus on climate adaptation in coastal communities.',evidence:input.documents.map(x=>({id:x.id,field:'title',quote:x.title}))},concepts:[],exceptions:[],contrast:null},checked=verifiedDescription(value,input);
 assert.equal(checked.status,'limited-evidence');assert.equal(checked.generatedStatus,'shared-theme');assert.equal(checked.heading,value.heading);assert.deepEqual(checked.headingEvidenceQualification.singleSourceTerms,['coastal','communities']);assert.match(checked.evidenceWarnings[0],/mechanical check/);assert.match(checked.headingEvidenceQualification.scope,/Not semantic entailment/);
 const variants={documents:[{id:'a',role:'member',title:'Pump engineer practice',abstract:''},{id:'b',role:'member',title:'Pump engineering practice',abstract:''}]},v={...value,heading:'Pump engineering practice',summary:{text:'The sampled texts focus on pump engineering practice.',evidence:variants.documents.map(x=>({id:x.id,field:'title',quote:x.title}))}},q=verifiedDescription(v,variants);assert.equal(q.status,'limited-evidence');assert.equal(q.heading,v.heading,'word variants never erase the proposed heading');assert.deepEqual(q.headingEvidenceQualification.singleSourceTerms,['engineering']);
});


test('neutral framing words are allowed without exempting unsupported sectors or effects',()=>{
 const input={documents:[{id:'a',role:'member',title:'Leadership in crisis',abstract:''},{id:'b',role:'member',title:'Crisis leadership research',abstract:''}]},value={heading:'Leadership in crisis contexts',status:'shared-theme',summary:{text:'The sampled texts focus on leadership in crisis contexts.',evidence:input.documents.map(x=>({id:x.id,field:'title',quote:x.title}))},concepts:[],exceptions:[],contrast:null};
 assert.equal(verifiedDescription(value,input).status,'shared-theme');
 for(const detail of ['healthcare','effectiveness','social innovation']){const wrong={...value,heading:'Leadership in '+detail,summary:{...value.summary,text:'The sampled texts focus on leadership in '+detail+'.'}};assert.throws(()=>validateDescription(wrong,input),/absent/);}
});

test('repair stays bounded with 48 long titles while the full original catalog remains available',()=>{
 const input={documents:Array.from({length:48},(_,i)=>({id:'member'+i,role:'member',title:'Title '+i+' '+('long original source wording '.repeat(80))+' original-end-'+i,abstract:''})),keywords:[],sharedVocabulary:[]},repair=descriptionRepairMessage('{}',input,new Error('x'.repeat(2000))),json=repair.slice(repair.indexOf('title excerpt keys: ')+20).replace(/\.$/u,''),examples=JSON.parse(json);
 assert.equal(examples.length,4);assert.equal(new Set(examples.map(x=>x.id)).size,4);assert(examples.every(x=>x.quote.length<=220));assert(repair.length<4000);assert.match(repair,/FULL original source.*unchanged/);assert(descriptionMessages(input)[1].content.includes('original-end-47'),'repair bounds do not remove any original member text');
});


test('limited fallback prefers an already verified cluster keyword concept over model order and retains its witness',()=>{
 const input={documents:[{id:'a',role:'member',title:'Water systems and harbor pumps',abstract:''},{id:'b',role:'member',title:'Harbor pumps in water systems',abstract:''}],keywords:[{phrase:'harbor pumps'}]},proof=input.documents.map(x=>({id:x.id,field:'title',quote:x.title})),value={heading:'Water systems improve safety',status:'shared-theme',summary:{text:'The sampled texts focus on water systems improving safety.',evidence:proof},concepts:[{text:'water systems',evidence:proof},{text:'harbor pumps',evidence:proof},{text:'effects',evidence:proof}],exceptions:[],contrast:null},before=JSON.stringify(value),checked=verifiedDescription(value,input);
 assert.equal(checked.status,'limited-evidence');assert.equal(checked.heading,'harbor pumps');assert.equal(checked.generatedHeading,value.heading);assert.equal(checked.generatedStatus,'shared-theme');assert.equal(checked.fallbackSelection.originalConceptIndex,1);assert.equal(checked.fallbackSelection.keywordRank,0);assert.equal(JSON.stringify(value),before);assert(!checked.concepts.some(x=>x.text==='effects'));
});

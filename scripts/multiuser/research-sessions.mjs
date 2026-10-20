// Tenant checks remain in the protected institutional boundary on EVERY call.
import {randomUUID} from 'node:crypto';
import {canonical,digest,error} from './core.mjs';
import {evidenceExchange,zipContents,normalizedId} from './research-contracts.mjs';
import {runEngine} from './research-runner.mjs';
import {prepareAttachments} from './research-attachments.mjs';
const one=result=>result.records[0]?.get('item')?.properties;
const canonicalWorkId=value=>{const match=typeof value==='string'&&/^(?:https?:\/\/openalex\.org\/)?(W[0-9]+)$/i.exec(value.trim());return match?match[1].toUpperCase():null;};
const VERSION='bnr.bibliomap-research-session.v1';
const mutation=new Set(['session_create','session_advance','session_cancel','session_pause','session_resume','session_retry','session_budget_extend','source_import_begin','source_import_chunk','source_import_extract','snapshot_catalog','snapshot_search','snapshot_freeze']);
const allowed=new Set([...mutation,'session_status','session_report','source_page','specialist_page','attachment_page']);
const strict=(value,keys)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))throw error('Unsupported research session arguments.',422);};

function archivedSpecialists(contents,ids){
 return ids.map(id=>{const raw=contents.get('specialists/'+id+'/appraisal.json');if(!raw)throw error('Bound specialist original chart is absent.',502);const chart=JSON.parse(raw);return {specialist_id:id,status:chart.status,error:chart.error??null,appraisal_sha256:digest(raw),source_ids:chart.bindings.map(b=>b.source_id),literal_bound_source_appraisals:chart.appraisals?.length||0,scope:'Completed inference does not imply accepted chart; literal acceptance is not semantic/human approval'};});
}

// Independent replay of original engine ledger: failed proposals still cost tokens.
export function replaySessionState(manifest,events){
 const state={state:'ready',phase:'lead',study_id:manifest.study_id??null,steps:0,tokens:0,input_tokens:0,output_tokens:0,cached_input_tokens:0,last_error:null,source_ids:manifest.source_ids||[],specialist_ids:[],provided_selection_id:manifest.provided_selection_id??null,study_id_hint:'study-'+(manifest.session_id||'research-fixture').replace(/^research-/,'' )},children=new Set(),launched=new Set(),unknown=new Set(),pending=new Set(),charged=new Set();let lastParent=null,parentAttempts=0,humanPaused=null;
 if(manifest.attachment_ids?.length)state.attachment_ids=manifest.attachment_ids;
 const valid=u=>u&&typeof u==='object'&&!Array.isArray(u)&&Object.hasOwn(u,'input_tokens')&&Object.hasOwn(u,'output_tokens')&&Object.values(u).every(v=>Number.isSafeInteger(v)&&v>=0)&&(u.cached_input_tokens||0)<=u.input_tokens;
 const add=u=>{for(const key of ['input_tokens','output_tokens','cached_input_tokens'])state[key]+=u[key]||0;state.tokens+=u.input_tokens+u.output_tokens;};
 for(const [index,event]of events.entries()){
  if(event.kind==='human_control'){
   const spent={tokens:state.tokens,input_tokens:state.input_tokens,output_tokens:state.output_tokens,cached_input_tokens:state.cached_input_tokens,steps:Math.max(state.steps,parentAttempts+new Set([...children,...launched]).size)};
   if(!['pause','resume','retry'].includes(event.action)||!event.spent_at_control||canonical(event.spent_at_control)!==canonical(spent)||!event.state_patch||canonical(event.state_patch)!=='{}'||typeof event.reason!=='string'||event.reason.trim().length<1||event.reason.trim().length>2000)throw error('Human control changes counters/phase/scientific state.',502);
   if(['resume','retry'].includes(event.action)&&(pending.size||unknown.size||[...launched].some(id=>!children.has(id))||['completed_qualified','budget_exhausted'].includes(state.state)))throw error('Human control bypasses unknown usage or terminal state.',502);
   if(event.action==='pause')humanPaused=true;else if(event.action==='resume'){if(!humanPaused)throw error('Resume requires a prior pause.',502);humanPaused=false;}else{
    const prior=events.slice(0,index),failure=prior.findLast(e=>e.kind==='provider_failure');
    if(humanPaused||!failure||event.failure_event_ref!==failure.event_sha256||!['known','not_started'].includes(failure.provider_accounting?.status)||!['provider_contract','provider_error','timeout','native_launch_error','unavailable'].includes(failure.error?.code)||prior.slice(failure.index+1).some(e=>e.kind==='provider_attempt'||e.kind==='human_control'&&e.action==='retry'))throw error('Retry must authorize one next step after its latest known failure.',502);
   }
  }
  if(event.kind==='budget_revision'){
   const old={max_tokens:state.max_tokens??manifest.max_tokens,max_steps:state.max_steps??manifest.max_steps},next=event.new_budget,spent={tokens:state.tokens,input_tokens:state.input_tokens,output_tokens:state.output_tokens,cached_input_tokens:state.cached_input_tokens,steps:Math.max(state.steps,parentAttempts+new Set([...children,...launched]).size)};
   if(!['ready','budget_exhausted'].includes(state.state)||!event.previous_budget||canonical(event.previous_budget)!==canonical(old)||!next||Object.keys(next).length!==2||!['max_tokens','max_steps'].every(key=>Number.isSafeInteger(old[key])&&Number.isSafeInteger(next[key])&&next[key]>=old[key])||canonical(next)===canonical(old)||next.max_tokens<=spent.tokens||next.max_steps<=spent.steps||!event.spent_at_revision||canonical(event.spent_at_revision)!==canonical(spent)||!event.state_patch||canonical(event.state_patch)!==canonical({state:'ready'})||typeof event.reason!=='string'||event.reason.trim().length<1||event.reason.trim().length>2000||unknown.size||pending.size||[...launched].some(id=>!children.has(id)))throw error('Budget revision changes original ceilings/known usage improperly.',502);
   Object.assign(state,next);
  }
  Object.assign(state,event.state_patch||{});
  if(event.kind==='provider_attempt'){lastParent=event.task_id;pending.add(lastParent);parentAttempts++;}
  const key=event.task_id||lastParent||('legacy-event-'+index);
  if(event.provider){const usage=event.provider.usage;if(!valid(usage))pending.add(key);else{pending.delete(key);if(!charged.has(key)){charged.add(key);state.steps++;add(usage);}}}
  const accounting=event.provider_accounting;
  if(accounting&&['known','not_started'].includes(accounting.status)){if(!valid(accounting.usage))pending.add(key);else{pending.delete(key);if(!charged.has(key)){charged.add(key);add(accounting.usage);}}}
  if(event.kind==='nested_provider_attempt')launched.add(event.specialist_id);
  const child=event.child_provider;if(child&&!children.has(child.specialist_id)){children.add(child.specialist_id);state.steps++;if(!valid(child.usage))unknown.add(child.specialist_id);else add(child.usage);}
 }
 state.steps=Math.max(state.steps,events.filter(e=>e.kind==='provider_attempt').length+new Set([...children,...launched]).size);
 if(unknown.size||[...launched].some(id=>!children.has(id))){state.state='budget_accounting_required';state.last_error='unknown_specialist_usage';}
 if(pending.size){state.state='budget_accounting_required';state.pending_parent_attempt_ids=[...pending].sort();state.accounting_error='unknown_parent_usage';}
 if(humanPaused!==null){state.control_paused=humanPaused;if(humanPaused&&['ready','awaiting_clarification'].includes(state.state))state.state='paused';}
 return state;
}

function archivedEvents(contents,prefix){
 const items=[...contents].filter(([name])=>name.startsWith(prefix+'event-')&&name.endsWith('.json')).sort(([a],[b])=>a.localeCompare(b));let previous=null;
 return items.map(([name,raw],index)=>{
  const text=raw.toString('utf8'),event=JSON.parse(text),line=/^  "event_sha256": "([a-f0-9]{64})",\n/gm,matches=[...text.matchAll(line)];
  // Hash the exact retained Python serialization with only its top-level seal
  // removed. Do not equate JS number/canonical JSON codecs with Python's.
  if(name!==prefix+'event-'+String(index).padStart(5,'0')+'.json'||event.index!==index||event.previous_sha256!==previous||matches.length!==1||matches[0][1]!==event.event_sha256||digest(Buffer.from(text.replace(line,''),'utf8'))!==event.event_sha256)throw error('Original session event ordering/hash chain differs.',502);
  previous=event.event_sha256;return event;
 });
}

export function checkSessionResult(result,binding){
 const input=binding.request||binding,wire=binding.transport_request_json;
 if(!result||result.schema_version!==VERSION||result.operation!==input.operation||canonical(result.scope)!==canonical(input.scope))throw error('Research result does not bind operation/scope.',502);
 if(typeof wire!=='string'||canonical(JSON.parse(wire))!==canonical(input)||result.transport_request_sha256!==digest(Buffer.from(wire,'utf8')))throw error('Research result does not bind exact submitted transport bytes.',502);
 if(mutation.has(input.operation)&&(result.execution_id!==input.execution_id||!/^([a-f0-9]{64})$/.test(result.request_sha256||'')))throw error('Research mutation identity differs.',502);
 if(input.operation.startsWith('session_')&&input.arguments.session_id&&result.result?.session_id!==input.arguments.session_id)throw error('Session control returned another session identity.',502);
 const archive=result.exact_research_archive;
 if(['session_create','session_advance','session_resume','session_retry','session_budget_extend','source_import_extract','snapshot_catalog','snapshot_search','snapshot_freeze'].includes(input.operation)){
  if(!archive||archive.format!=='zip'||typeof archive.data_base64!=='string'||!Array.isArray(archive.files))throw error('Research result lacks exact durable evidence archive.',502);
  const raw=Buffer.from(archive.data_base64,'base64');if(raw.length!==archive.bytes||digest(raw)!==archive.sha256||raw.length>20*1024*1024)throw error('Research archive byte identity differs.',502);
  const contents=zipContents(raw,20*1024*1024),names=new Set();let total=0;
  for(const entry of archive.files){if(names.has(entry.name)||!contents.has(entry.name))throw error('Research archive manifest is incomplete/repeated.',502);names.add(entry.name);const bytes=contents.get(entry.name);total+=bytes.length;if(bytes.length!==entry.bytes||digest(bytes)!==entry.sha256)throw error('Research archived bytes differ.',502);}
  if(names.size!==contents.size||total!==archive.decoded_bytes||total>128*1024*1024)throw error('Research archive has unmanifested/oversized bytes.',502);
  const receipt='bridge-receipts/'+input.execution_id+'/',requestBytes=contents.get(receipt+'request.json'),observed=contents.get(receipt+'observation.json');
  if(!requestBytes||digest(requestBytes)!==result.request_sha256||canonical(JSON.parse(requestBytes))!==canonical(input)||!observed||canonical(JSON.parse(observed))!==canonical(result.result))throw error('Displayed research result/request differs from original archived observation.',502);
  const status=result.result;
  if(input.operation.startsWith('snapshot_')){
   const summary=catalog=>{const ready=catalog.entries.filter(entry=>entry.status==='available_stat_matched');return {...Object.fromEntries(['id','snapshot_id','entity','manifest_sha256','declared_rows','declared_bytes','all_entities_declared_files','all_entities_declared_bytes','source_assurance'].map(key=>[key,catalog[key]])),inventory_files:catalog.entries.length,available_files:ready.length,available_declared_rows:ready.reduce((n,e)=>n+e.declared_rows,0),available_bytes:ready.reduce((n,e)=>n+e.observed_bytes,0),unavailable:catalog.entries.filter(entry=>entry.status!=='available_stat_matched').map(({file_id,status})=>({file_id,status}))};};
   const sealed=(prefix,name)=>{const seal=JSON.parse(contents.get(prefix+'integrity.json')||'null');if(!seal?.files?.some(file=>file.name===name))throw error('Frozen snapshot resource is unsealed.',502);for(const item of seal.files){const raw=contents.get(prefix+item.name);if(!raw||digest(raw)!==item.sha256)throw error('Frozen snapshot resource bytes differ.',502);}return JSON.parse(contents.get(prefix+name));};
   if(input.operation==='snapshot_catalog'){
    const prefix='catalogs/'+status.id+'/',raw=contents.get(prefix+'catalog.json'),seal=JSON.parse(contents.get(prefix+'integrity.json')||'null'),catalog=raw&&JSON.parse(raw);if(!raw||seal?.sha256!==digest(raw)||catalog.snapshot_id!==input.arguments.snapshot_id||catalog.id!==status.id||canonical(summary(catalog))!==canonical(status))throw error('Configured catalog differs from admitted snapshot.',502);
   }else if(input.operation==='snapshot_search'){
    const prefix='searches/'+status.id+'/',actual=sealed(prefix,'result.json'),admitted=sealed(prefix,'request.json'),query={...input.arguments.query};if(query.ids)query.ids=[...new Set(query.ids.map(normalizedId))].sort();
    if(canonical(actual)!==canonical(status)||status.identity.catalog_id!==input.arguments.catalog_id||canonical(status.identity.query)!==canonical(query)||(input.arguments.continuation??null)!==(admitted.continuation??null))throw error('Search differs from admitted catalog/query/continuation.',502);
    for(const [key,value]of Object.entries(input.arguments.limits||{}))if(status.limits[key]!==value)throw error('Executed search limit differs.',502);
    const catalog=JSON.parse(contents.get('catalogs/'+input.arguments.catalog_id+'/catalog.json')),scope=catalog.entries.filter(entry=>!input.arguments.scope_file_ids||input.arguments.scope_file_ids.includes(entry.file_id)).map(entry=>entry.file_id);if(canonical(scope)!==canonical(status.identity.scope_file_ids))throw error('Executed search scope differs.',502);
   }else{
    const prefix='selections/'+status.selection_id+'/',selection=sealed(prefix,'selection.json'),rows=contents.get(prefix+'raw-records.json');if(!rows||digest(rows)!==status.records_sha256||digest(rows)!==selection.raw_records_sha256||digest(rows)!==status.raw_records_sha256||status.records_json!==rows.toString('utf8')||canonical(selection)!==canonical(status.selection_manifest)||selection.id!==status.selection_id||selection.search_id!==input.arguments.search_id||selection.include_previous!==(input.arguments.include_previous??false)||canonical(status.parent_evidence??null)!==canonical(input.arguments.parent_evidence??null)||selection.raw_record_count!==JSON.parse(rows).length||status.raw_record_count!==selection.raw_record_count)throw error('Frozen full physical records/lineage differ from the admitted selection.',502);
    const catalog=JSON.parse(contents.get('catalogs/'+selection.catalog_id+'/catalog.json'));if(canonical(summary(catalog))!==canonical(status.catalog_scope))throw error('Frozen acquisition catalog scope differs.',502);
    const revisions=[],seen=new Set();let current=sealed('searches/'+input.arguments.search_id+'/','result.json');while(true){if(seen.has(current.id))throw error('Snapshot continuation chain cycles.',502);seen.add(current.id);revisions.push(current);if(!input.arguments.include_previous||!current.previous_search)break;current=sealed('searches/'+current.previous_search+'/','result.json');}revisions.reverse();const matches=[];for(const revision of revisions){if(canonical(revision.identity)!==canonical(revisions[0].identity))throw error('Frozen continuation query/scope differs.',502);for(const match of sealed('searches/'+revision.id+'/','matches.json'))matches.push({...match,index:matches.length,source_search_id:revision.id,source_match_index:match.index});}const selected=input.arguments.indices?[...input.arguments.indices].sort((a,b)=>a-b).map(index=>matches[index]):matches;
    if(canonical(selected)!==canonical(selection.locators)||canonical(revisions.map(item=>item.id))!==canonical(selection.source_search_ids))throw error('Frozen physical locators differ from the admitted full selection/chain.',502);
    const final=revisions.at(-1),finalRaw=contents.get('searches/'+final.id+'/result.json'),expected={search_result_sha256:digest(finalRaw),catalog_id:final.identity.catalog_id,manifest_sha256:catalog.manifest_sha256,query:final.identity.query,scope_file_ids:final.identity.scope_file_ids,search_limits:final.limits,search_coverage:final.coverage,search_cumulative_coverage:final.cumulative_coverage,search_terminal_reason:final.terminal_reason,search_complete_available_scope:final.complete_available_scope,search_continuation:final.continuation,source_search_revisions:revisions.map(revision=>({search_id:revision.id,result_sha256:digest(contents.get('searches/'+revision.id+'/result.json')),retained_matches:revision.coverage.matched_rows}))};
    for(const [key,value]of Object.entries(expected))if(canonical(selection[key])!==canonical(value))throw error('Frozen materialization metadata differs from actual final/chain search: '+key,502);
    if(status.search_terminal_reason!==final.terminal_reason||status.search_complete_available_scope!==final.complete_available_scope||canonical(status.source_search_ids)!==canonical(selection.source_search_ids))throw error('Displayed frozen acquisition coverage differs from actual retained search.',502);
    const sourceFiles=[...new Set(selected.map(row=>row.file_id))].sort().map(id=>catalog.entries.find(entry=>entry.file_id===id));if(canonical(sourceFiles)!==canonical(selection.source_files))throw error('Frozen source file identities differ from actual catalog/locators.',502);
    const {parent_evidence,...admitted}=input.arguments,operator=JSON.parse(contents.get('operator-config.json')),effective={...admitted,limits:{...(admitted.limits||{}),max_output_bytes:Math.min(admitted.limits?.max_output_bytes??operator.limits?.max_output_bytes??20000000,2097152)}};
    if(canonical(sealed(prefix,'request.json'))!==canonical(effective))throw error('Materialization executed different bounds/selectors.',502);
    const physical=JSON.parse(rows);for(let i=0;i<physical.length;i++){const record=physical[i],locator=selected[i],title=record.title||record.display_name||'';if(record.id!==locator.id||canonical(record.publication_year??null)!==canonical(locator.publication_year)||canonical(record.type??null)!==canonical(locator.type)||Array.from(title).slice(0,2000).join('')!==locator.title)throw error('Frozen row does not agree with its physical matched metadata.',502);}
   }
  }
  if(['session_advance','session_budget_extend'].includes(input.operation)&&status.session_id!==input.arguments.session_id)throw error('Advance/control returned another session identity.',502);
  if(input.operation==='source_import_extract'){
   const raw=contents.get('sources/'+status.source_id+'/source.json'),manifest=raw&&JSON.parse(raw),upload=contents.get('source-uploads/'+input.arguments.upload_id+'/upload.json');
   if(!manifest||!upload||manifest.work_id!==canonicalWorkId(input.arguments.work_id)||manifest.provider_id!==input.arguments.provider_id||manifest.kind!==input.arguments.kind)throw error('Imported source identity differs from requested work/provider/kind.',502);
   const meta=JSON.parse(upload);if(canonicalWorkId(meta.request.work_id)!==canonicalWorkId(input.arguments.work_id)||meta.request.provider_id!==input.arguments.provider_id||meta.request.kind!==input.arguments.kind)throw error('Source upload identity differs.',502);
   if(manifest.raw_complete&&(manifest.raw_complete_sha256!==meta.request.content_sha256||manifest.raw_retained_bytes!==meta.request.content_bytes))throw error('Completed import original bytes differ from upload.',502);
  }
  if(['session_create','session_advance','session_resume','session_retry','session_budget_extend'].includes(input.operation)){
   const prefix='sessions/'+status.session_id+'/',manifestBytes=contents.get(prefix+'session.json'),identity=contents.get(prefix+'identity.json');
   if(!manifestBytes||!identity||digest(manifestBytes)!==JSON.parse(identity).sha256)throw error('Session identity seal differs.',502);
   const manifest=JSON.parse(manifestBytes),configBytes=contents.get('operator-config.json');
   if(!configBytes||digest(configBytes)!==manifest.config_sha256||manifest.session_id!==status.session_id)throw error('Session operator configuration/identity differs.',502);
   const attachmentBindings=[];for(const id of manifest.attachment_ids||[]){const raw=contents.get('attachments/'+id+'/attachment.json'),seal=contents.get('attachments/'+id+'/identity.json');if(!raw||!seal||digest(raw)!==JSON.parse(seal).sha256)throw error('Bound attachment identity differs.',502);const value=JSON.parse(raw);for(const doc of value.documents)if(digest(Buffer.from(doc.text,'utf8'))!==doc.sha256)throw error('Attached scientific document bytes differ.',502);attachmentBindings.push({attachment_id:id,manifest_sha256:digest(raw)});}
   if(attachmentBindings.length&&canonical(manifest.initial_material_binding?.attachments)!==canonical(attachmentBindings))throw error('Initial result attachment review binding differs.',502);
   if(input.operation==='session_create'){
    const args=input.arguments,config=JSON.parse(configBytes),expected={question:args.question,context:args.context||'',max_steps:args.max_steps??config.research_provider.max_session_steps??30,max_tokens:args.max_tokens??config.research_provider.max_session_tokens??200000,source_ids:args.source_ids||[],required_reviewer_checks:args.required_reviewer_checks||[],require_literature_specialist:args.require_literature_specialist||false};
    for(const [key,value]of Object.entries(expected))if(canonical(manifest[key])!==canonical(value))throw error('Session creation input changed: '+key,502);
    if(args.parent_research&&canonical(args.parent_research)!==canonical(manifest.parent_research))throw error('Explicit parent-linked restart binding changed.',502);
    const selection=JSON.parse(contents.get('selections/'+manifest.provided_selection_id+'/selection.json')||'null'),rows=contents.get('selections/'+manifest.provided_selection_id+'/raw-records.json');
    if(!selection||!rows||digest(rows)!==selection.raw_records_sha256||canonical(selection.parent)!==canonical(args.exchange.parent)||canonical(JSON.parse(rows))!==canonical(JSON.parse(args.exchange.records_json))||selection.parent_wire_records_sha256!==args.exchange.records_sha256)throw error('Initial supplied selection differs from exact authorized evidence.',502);
    const attached=manifest.attachment_ids||[];if(attached.length!==(args.attachments||[]).length)throw error('Explicit attachment inventory differs.',502);
    for(const [index,id]of attached.entries()){const raw=contents.get('attachments/'+id+'/attachment.json'),seal=contents.get('attachments/'+id+'/identity.json');if(!raw||!seal||digest(raw)!==JSON.parse(seal).sha256||canonical(JSON.parse(raw))!==canonical(args.attachments[index]))throw error('Attached public scientific result differs from admitted bytes.',502);}
    if(status.state!=='ready')throw error('New session has an impossible initial state.',502);
   }else{
    const events=archivedEvents(contents,prefix);
    const state=replaySessionState(manifest,events);
    for(const event of events)if(attachmentBindings.length&&event.review_binding&&canonical(event.review_binding.materials?.attachments||null)!==canonical(attachmentBindings))throw error('Candidate/reviewer attachment binding differs from frozen scientific inputs.',502);
    const budgetKeys=['max_tokens','max_steps','initial_budget','budget_history'];if(budgetKeys.some(key=>Object.hasOwn(status,key))&&!budgetKeys.every(key=>Object.hasOwn(status,key)))throw error('Budget display metadata must be a complete derived group.',502);
    for(const key of ['max_tokens','max_steps'])if(Object.hasOwn(status,key)&&status[key]!==(state[key]??manifest[key]))throw error('Displayed execution ceiling differs from budget ledger.',502);
    const history=events.filter(e=>e.kind==='budget_revision').map(e=>Object.fromEntries(['previous_budget','new_budget','spent_at_revision','reason','authority','created_at','event_sha256'].map(key=>[key,e[key]])));
    if(Object.hasOwn(status,'budget_history')&&canonical(status.budget_history)!==canonical(history)||Object.hasOwn(status,'initial_budget')&&canonical(status.initial_budget)!==canonical({max_tokens:manifest.max_tokens,max_steps:manifest.max_steps}))throw error('Displayed budget history/original limits differ.',502);
    const config=JSON.parse(configBytes);for(const event of events.filter(e=>e.kind==='budget_revision'))if(event.new_budget.max_tokens>(config.research_provider.max_session_tokens??200000)||event.new_budget.max_steps>(config.research_provider.max_session_steps??30))throw error('Budget revision exceeds frozen operator ceilings.',502);
    if(input.operation==='session_budget_extend'){const event=events.at(-1),args=input.arguments;if(event?.kind!=='budget_revision'||event.new_budget.max_tokens!==args.max_tokens||event.new_budget.max_steps!==args.max_steps||event.reason!==args.reason.trim()||canonical(event.authority?.scope)!==canonical(input.scope))throw error('Budget revision does not bind explicit submitted control.',502);}
    for(const event of events.filter(event=>event.kind==='human_control'&&event.action==='pause')){const path=prefix+event.pause_intent_path,raw=contents.get(path);if(!raw||digest(raw)!==event.pause_intent_sha256)throw error('Original human pause intent is missing/changed.',502);const intent=JSON.parse(raw);if(intent.session_manifest_sha256!==digest(manifestBytes)||intent.reason!==event.reason||canonical(intent.authority)!==canonical(event.authority))throw error('Pause intent does not bind session/reason/authority.',502);}
    if(['session_resume','session_retry'].includes(input.operation)){const event=events.at(-1),args=input.arguments;if(event?.kind!=='human_control'||event.action!==input.operation.replace('session_','')||event.reason!==args.reason||canonical(event.authority?.scope)!==canonical(input.scope)||event.action==='retry'&&event.failure_event_ref!==args.failure_event_ref)throw error('Human control differs from the submitted request/owner.',502);}
    for(const [key,value]of Object.entries(state))if(!(key==='study_id_hint'&&!Object.hasOwn(status,key))&&canonical(status[key])!==canonical(value))throw error('Displayed session state differs from original ledger: '+key,502);
    if(['specialist_statuses','literal_bound_source_appraisals','rejected_specialist_assignments'].some(k=>Object.hasOwn(status,k))){
     if(!['specialist_statuses','literal_bound_source_appraisals','rejected_specialist_assignments'].every(k=>Object.hasOwn(status,k)))throw error('Appraisal display metadata must be supplied as a complete derived group.',502);
     const derived=archivedSpecialists(contents,status.specialist_ids||[]);
     if(canonical(status.specialist_statuses)!==canonical(derived)||status.literal_bound_source_appraisals!==derived.reduce((n,s)=>n+s.literal_bound_source_appraisals,0)||status.rejected_specialist_assignments!==derived.filter(s=>s.status==='failed').length)throw error('Displayed appraisal acceptance differs from exact archived charts.',502);
    }
    if(status.state==='completed_qualified'){
     const report=JSON.parse(contents.get('tasks/'+status.final_report_task_id+'/research-report.json')||'null'),candidate=events.find(e=>e.event_sha256===status.accepted_candidate_event_ref)?.candidate_answer;
     if(!report||report.session_id!==status.session_id||canonical(report.accepted_answer)!==canonical(status.accepted_answer)||canonical(candidate)!==canonical(status.accepted_answer))throw error('Accepted report/candidate differs from archived ledger.',502);
    }
   }
  }
 }
 return result;
}

export class ResearchSessions{
 constructor(integration){this.integration=integration;this.store=integration.store;this.files=integration.files;}
 async init(){for(const label of ['BMResearchSession','BMResearchSource','BMResearchFinding'])await this.store.driver.executeQuery(`CREATE CONSTRAINT ${label.toLowerCase()}_id IF NOT EXISTS FOR (item:${label}) REQUIRE item.id IS UNIQUE`,{},{database:this.store.database});}
 async record(binding,id,write=false){return this.store.tx(false,async tx=>{await this.integration.auth.authorize(binding,binding.projectId,write,tx);const item=one(await tx.run('MATCH (item:BMResearchSession {id:$id,projectId:$projectId}) RETURN item',{id,projectId:binding.projectId}));if(!item||write&&item.userId!==binding.userId)throw error('Research session not found for this principal.',404);return item;});}
 async list(binding){await this.integration.auth.authorize(binding,binding.projectId);return this.store.tx(false,async tx=>{await this.store.gate(binding.userId,binding.projectId,'viewer',tx);const result=await tx.run('MATCH (item:BMResearchSession {projectId:$projectId}) RETURN item ORDER BY item.createdAt DESC LIMIT 100',{projectId:binding.projectId});const findings=await tx.run('MATCH (item:BMResearchFinding {projectId:$projectId}) RETURN item ORDER BY item.createdAt DESC LIMIT 100',{projectId:binding.projectId});return {findings:findings.records.map(row=>row.get('item').properties),sessions:result.records.map(row=>{const item=row.get('item').properties;return {id:item.id,question:item.question,state:item.state,createdAt:item.createdAt,evidenceId:item.evidenceId,lastResultId:item.lastResultId||null};}),limit:100,coverage:'Latest100 project sessions; no hidden inference or automatic advance'};});}
 async submit(binding,operation,input){
  if(!allowed.has(operation)||!mutation.has(operation))throw error('Unsupported research mutation.',422);
  if(!this.integration.runner?.researchConfig)throw error('Project researcher is not configured by the operator.',503);
  await this.integration.auth.authorize(binding,binding.projectId,true);strict(input,['idempotencyKey','sessionId','arguments','evidenceId']);
  if(typeof input.idempotencyKey!=='string'||input.idempotencyKey.length<1||input.idempotencyKey.length>200)throw error('An explicit bounded idempotency key is required.',422);
  let sessionId=input.sessionId,record,args=input.arguments||{},scope={project_id:binding.projectId,user_id:binding.userId};
  const key=digest([binding.userId,binding.projectId,operation,input.idempotencyKey]);
  const execution_id=`${key.slice(0,8)}-${key.slice(8,12)}-${key.slice(12,16)}-${key.slice(16,20)}-${key.slice(20,32)}`;
  if(operation==='session_create'){
   strict(args,['question','context','max_steps','max_tokens','source_ids','require_literature_specialist','required_reviewer_checks','result_attachments','restart_from_session']);
   const reference=await this.store.evidence(binding.userId,binding.projectId,input.evidenceId),snapshot=await this.files.get(reference.artifact.checksum);
   let parent_research;const {result_attachments,restart_from_session,...creation}=args;if(restart_from_session!==undefined){if(typeof restart_from_session!=='string'||!/^([a-f0-9-]{36})$/.test(restart_from_session))throw error('Restart must name an authorized retained project session.',422);const prior=await this.record(binding,restart_from_session),retained=await this.archive(binding,prior.lastJobId);parent_research={app_session_id:prior.id,engine_session_id:prior.engineSessionId,archive_checksum:retained.checksum,state:retained.payload.exchange.result.state,source_ids:retained.payload.exchange.result.source_ids||[],policy:'Explicit new session/current execution profile; old sources must be reimported or reselected. No usage/candidate/review relocation or automatic resumption.'};}
   const attachments=await prepareAttachments(this.integration,binding,result_attachments||[],input.evidenceId);
   args={...creation,...(parent_research?{parent_research}:{}),...(attachments.length?{attachments}:{}),exchange:evidenceExchange(reference,snapshot,{})};sessionId=execution_id;
   await this.store.tx(true,async tx=>{await this.store.lock(tx,'project:'+binding.projectId);await this.integration.auth.authorize(binding,binding.projectId,true,tx);const old=one(await tx.run('MATCH (item:BMResearchSession {id:$id}) RETURN item',{id:sessionId}));const requestHash=digest(args);if(old&&old.requestHash!==requestHash)throw error('Research creation key already binds a different question/evidence.',409);if(!old)await tx.run('CREATE (item:BMResearchSession) SET item=$item',{item:{id:sessionId,projectId:binding.projectId,userId:binding.userId,evidenceId:input.evidenceId,question:args.question,requestHash,executionProfileHash:this.integration.runner.executionProfileHash,state:'queued',createdAt:Date.now()}});});
  }else if(operation.startsWith('session_')){
   record=await this.record(binding,sessionId,true);if(!record.executionProfileHash||record.executionProfileHash!==this.integration.runner.executionProfileHash)throw error('Execution namespace/configuration is not the frozen session profile. Retained evidence remains readable. Deliberately create a parent-linked fresh session with current runtime and explicitly reimport/reselect sources; old ledgers are never remapped.',409);if(!record.engineSessionId)throw error('Session creation has not completed.',409);args={...args,session_id:record.engineSessionId};
   if(operation==='session_budget_extend'){strict(args,['session_id','max_tokens','max_steps','reason']);if(!Number.isSafeInteger(args.max_tokens)||!Number.isSafeInteger(args.max_steps)||typeof args.reason!=='string'||!args.reason.trim()||args.reason.length>2000)throw error('Explicit integer ceilings and a human-owned reason are required.',422);}
   if(['session_pause','session_resume','session_retry'].includes(operation)){strict(args,['session_id','reason',...(operation==='session_retry'?['failure_event_ref']:[])]);if(typeof args.reason!=='string'||!args.reason.trim()||args.reason.length>2000||operation==='session_retry'&&!/^[a-f0-9]{64}$/.test(args.failure_event_ref||''))throw error('Human control requires an explicit bounded reason and exact failure reference for retry.',422);}
   if(operation==='session_pause'){
    const request={operation,execution_id,scope,arguments:args},output=await runEngine(this.integration.runner,request,undefined,async()=>{},()=>this.integration.auth.authorize(binding,binding.projectId,true));checkSessionResult(output,{request,transport_request_json:JSON.stringify(request)});
    if(!['pause_after_current_step_requested','pause_already_requested'].includes(output.result.control_status))throw error('Worker did not acknowledge durable pause intent.',502);
    await this.store.tx(true,async tx=>{await this.integration.auth.authorize(binding,binding.projectId,true,tx);await tx.run('MATCH (item:BMResearchSession {id:$id,projectId:$projectId,userId:$userId}) SET item.pauseRequested=true,item.pauseReason=$reason,item.pauseRequestedAt=$now',{id:sessionId,projectId:binding.projectId,userId:binding.userId,reason:args.reason,now:Date.now()});});
    return {status:'pause_after_current_step_requested',sessionId,research:output.result};
   }
   if(operation==='session_cancel'){const request={operation,execution_id,scope,arguments:args},output=await runEngine(this.integration.runner,request,undefined,async()=>{},()=>this.integration.auth.authorize(binding,binding.projectId,true));checkSessionResult(output,{request,transport_request_json:JSON.stringify(request)});await this.store.tx(true,async tx=>{await this.integration.auth.authorize(binding,binding.projectId,true,tx);await tx.run('MATCH (item:BMResearchSession {id:$id,projectId:$projectId,userId:$userId}) SET item.state="cancelled",item.cancelledAt=$now',{id:sessionId,projectId:binding.projectId,userId:binding.userId,now:Date.now()});});return {status:'cancel_requested',sessionId,research:output.result};}
  }
  const request={operation,execution_id,scope,arguments:args};
  const payload={operation:'research-session',execution_id,request,authorization:binding,sessionId:sessionId||null,engine_identity:this.integration.runner.identity};
  const blob=await this.files.put(payload),artifactId=await this.store.tx(true,tx=>this.store.registerArtifact(tx,{...blob,scope:'project:'+binding.projectId,kind:'research-session-input'}));
  const job=await this.integration.auth.submit(binding,'session:'+operation+':'+input.idempotencyKey,payload,{id:artifactId});return this.integration.status(binding,job.id);
 }
 async archive(binding,jobId){
  await this.integration.auth.authorize(binding,binding.projectId);
  const job=await this.store.tx(false,async tx=>{await this.store.gate(binding.userId,binding.projectId,'viewer',tx);const row=await tx.run('MATCH (project:BMProject {id:$projectId})-[:HAS_RESEARCH_RUN]->(item:BMJob {id:$jobId}) RETURN item',{projectId:binding.projectId,jobId});return one(row);});
  if(!job?.artifactId||job.state!=='succeeded')throw error('No published original research archive.',404);
  const artifact=await this.store.artifact(job.artifactId),payload=await this.files.get(artifact.checksum);checkSessionResult(payload.exchange,payload.input_binding);
  return {payload,checksum:artifact.checksum,contents:zipContents(Buffer.from(payload.exchange.exact_research_archive.data_base64,'base64'),20*1024*1024)};
 }
 async read(binding,operation,id,args={}){
  if(!allowed.has(operation)||mutation.has(operation))throw error('Unsupported research read.',422);
  await this.integration.auth.authorize(binding,binding.projectId);
  if(operation==='attachment_page'){
   const record=await this.record(binding,id),archived=await this.archive(binding,record.lastJobId),engineId=archived.payload.exchange.result.session_id,manifest=JSON.parse(archived.contents.get('sessions/'+engineId+'/session.json'));
   if(!(manifest.attachment_ids||[]).includes(args.attachment_id))throw error('Public result attachment is not bound to this project session.',404);
   const raw=archived.contents.get('attachments/'+args.attachment_id+'/attachment.json'),item=JSON.parse(raw),doc=item.documents.find(doc=>doc.name===args.document);
   if(!doc)throw error('Attached public scientific document absent.',404);
   return this.page(Buffer.from(doc.text,'utf8'),args.offset??0,args.max_bytes??16000,{attachment_id:args.attachment_id,manifest_sha256:digest(raw),document:doc.name,relationship:item.relationship,scope:doc.scope,archive_checksum:archived.checksum});
  }
  if(operation.startsWith('session_')){
   const record=await this.record(binding,id);if(!record.engineSessionId||!record.lastJobId)throw error('Research creation is still pending.',409);
   const archived=await this.archive(binding,record.lastJobId),value=archived.payload.exchange.result;
   if(operation==='session_status'){
    const prefix='sessions/'+value.session_id+'/',manifest=JSON.parse(archived.contents.get(prefix+'session.json')),specialists=archivedSpecialists(archived.contents,value.specialist_ids||[]),events=archivedEvents(archived.contents,prefix),failure=events.findLast(e=>e.kind==='provider_failure'),superseded=failure&&events.slice(failure.index+1).some(e=>e.kind==='provider_attempt'),retryAuthorized=failure&&events.slice(failure.index+1).some(e=>e.kind==='human_control'&&e.action==='retry'&&e.failure_event_ref===failure.event_sha256);
    const control={pause_requested:!!record.pauseRequested,pause_reason:record.pauseReason||null,retry_required:!!failure&&!superseded&&!retryAuthorized,latest_provider_failure:failure?{event_sha256:failure.event_sha256,error:failure.error,accounting_status:failure.provider_accounting?.status,retryable:!superseded&&['known','not_started'].includes(failure.provider_accounting?.status)&&['provider_contract','provider_error','timeout','native_launch_error','unavailable'].includes(failure.error?.code)}:null};
    const attachment_index=(manifest.attachment_ids||[]).map(id=>{const raw=archived.contents.get('attachments/'+id+'/attachment.json'),value=JSON.parse(raw);return {attachment_id:id,manifest_sha256:digest(raw),parent:value.parent,relationship:value.relationship,selection:value.selection,documents:value.documents.map(({text,...metadata})=>({...metadata,bytes:Buffer.byteLength(text)}))};});
    return {question:manifest.question,context:manifest.context,phase:'lead',steps:0,tokens:0,input_tokens:0,output_tokens:0,cached_input_tokens:0,source_ids:manifest.source_ids||[],specialist_ids:[],provided_selection_id:manifest.provided_selection_id,parent_research:manifest.parent_research||null,execution_profile_status:record.executionProfileHash&&record.executionProfileHash===this.integration.runner?.executionProfileHash?'Current bound execution profile':'Retained archive only or legacy/unavailable execution profile; use an explicit parent-linked fresh session to restart; old source IDs require reimport/reselection',...value,...control,attachment_ids:manifest.attachment_ids||[],attachment_index,specialist_statuses:specialists,literal_bound_source_appraisals:specialists.reduce((n,s)=>n+s.literal_bound_source_appraisals,0),rejected_specialist_assignments:specialists.filter(s=>s.status==='failed').length,max_steps:value.max_steps??manifest.max_steps,max_tokens:value.max_tokens??manifest.max_tokens,initial_budget:value.initial_budget??{max_tokens:manifest.max_tokens,max_steps:manifest.max_steps},budget_history:value.budget_history??[],required_reviewer_checks:manifest.required_reviewer_checks||[],require_literature_specialist:manifest.require_literature_specialist||false,...(record.pauseRequested&&record.state!=='cancelled'?{control_status:'Pause requested after the current bounded step; prior archived scientific state is unchanged'}:{}),...(record.state==='cancelled'?{state:'cancelled',cancellation_status:'Current explicit cancellation; prior archived step retained unchanged'}:{}),app_session_id:id,status_scope:'Last durably published step; an active subscription is polled separately',archive_checksum:archived.checksum};
   }
   if(operation==='session_report'){
    const format=args.format||'accessible',names={json:'research-report.json',md:'research-report.md',accessible:'accessible-report.md',technical:'technical-report.md'};
    if(value.state!=='completed_qualified'||!names[format])throw error('No qualified report in this format.',404);
    const raw=archived.contents.get('tasks/'+value.final_report_task_id+'/'+names[format]);if(!raw)throw error('Original report missing from protected archive.',409);
    return this.page(raw,args.offset??0,args.max_bytes??16000,{session_id:id,name:names[format],archive_checksum:archived.checksum});
   }
  }
  if(operation==='source_page'){
   const sourceId=args.source_id,reference=await this.store.tx(false,async tx=>{await this.store.gate(binding.userId,binding.projectId,'viewer',tx);return one(await tx.run('MATCH (item:BMResearchSource {projectId:$projectId,sourceId:$sourceId}) RETURN item',{projectId:binding.projectId,sourceId}));});
   if(!reference)throw error('Source not found in this project.',404);const archived=await this.archive(binding,reference.jobId),prefix='sources/'+sourceId+'/',raw=archived.contents.get(prefix+'source.json');
   if(!raw)throw error('Source original manifest missing.',409);const manifest=JSON.parse(raw),extraction=JSON.parse(archived.contents.get(prefix+'extraction.json')||'{"segments":[]}'),offset=args.offset??0,limit=args.limit??3;
   if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>5)throw error('Source pages require nonnegative offset and1..5segments.',422);
   delete manifest.parser_process;
   return {manifest,manifest_sha256:digest(raw),offset,total:extraction.segments.length,segments:extraction.segments.slice(offset,offset+limit),next_offset:offset+limit<extraction.segments.length?offset+limit:null,archive_checksum:archived.checksum};
  }
  if(operation==='specialist_page'){
   const record=await this.record(binding,id),archived=await this.archive(binding,record.lastJobId),state=archived.payload.exchange.result;
   if(!(state.specialist_ids||[]).includes(args.specialist_id))throw error('Specialist is not bound to this project session.',404);
   const prefix='specialists/'+args.specialist_id+'/',raw=archived.contents.get(prefix+'appraisal.json'),chart=raw&&JSON.parse(raw);
   if(args.excerpt_ids!==undefined){
    const ids=args.excerpt_ids;
    if(args.source_id!=null||args.fields!=null||!Array.isArray(ids)||ids.length<1||ids.length>16||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'))throw error('Select1..16 exact excerpt IDs alone; do not mix field modes.',422);
    if(!chart||chart.status==='failed')throw error('Rejected specialist attempt has no accepted chart excerpts.',409);
    const mapRaw=archived.contents.get(prefix+'excerpt-unit-map.json');if(!mapRaw)throw error('Original excerpt map missing.',409);
    const units=JSON.parse(mapRaw),bindings=new Map(chart.bindings.map(b=>[b.source_id,b]));if(ids.some(id=>!Object.hasOwn(units,id)))throw error('Excerpt ID absent from this assignment.',404);
    let result={specialist_id:args.specialist_id,appraisal_sha256:digest(raw),excerpt_map_sha256:digest(mapRaw),requested_excerpt_ids:ids,excerpts:[],remaining_excerpt_ids:ids,scope:'Exact retained source spans, not semantic entailment or whole-paper appraisal; no unrequested excerpt selected',maximum_utf8_bytes:16000};
    for(const id of ids){
     const unit=units[id],binding=bindings.get(unit.source_id);if(!binding?.selected_segment_ids.includes(unit.segment_id))throw error('Excerpt outside assigned source segments.',502);
     const sourcePrefix='sources/'+unit.source_id+'/',sourceRaw=archived.contents.get(sourcePrefix+'source.json'),textRaw=archived.contents.get(sourcePrefix+'extraction.json');
     if(!sourceRaw||!textRaw||digest(sourceRaw)!==binding.manifest_sha256||digest(textRaw)!==binding.extraction_sha256)throw error('Original excerpt source binding changed.',502);
     const manifest=JSON.parse(sourceRaw),segment=JSON.parse(textRaw).segments.find(s=>s.id===unit.segment_id),characters=segment&&Array.from(segment.text);
     if(!characters||!Number.isInteger(unit.start)||!Number.isInteger(unit.end)||unit.start<0||unit.end<=unit.start||unit.end>characters.length)throw error('Excerpt source span invalid.',502);
     const quote=characters.slice(unit.start,unit.end).join('');if(digest(Buffer.from(quote,'utf8'))!==unit.text_sha256)throw error('Original excerpt span hash changed.',502);
     const entry={...unit,excerpt_id:id,work_id:manifest.work_id,locator:segment.locator??null,quote},candidate={...result,excerpts:[...result.excerpts,entry],remaining_excerpt_ids:ids.slice(result.excerpts.length+1)};
     if(Buffer.byteLength(JSON.stringify(candidate),'utf8')>16000){if(!result.excerpts.length)throw error('One complete excerpt exceeds the bounded response.',413);break;}
     result=candidate;
    }
    return result;
   }
   const item=chart?.appraisals.find(a=>a.source_id===args.source_id);
   if(!item||!Array.isArray(args.fields)||args.fields.length<1||args.fields.length>5||new Set(args.fields).size!==args.fields.length||args.fields.some(name=>typeof name!=='string'||!Object.hasOwn(item.fields,name)))throw error('Select1..5 exact fields from a bound source chart.',422);
   return {specialist_id:args.specialist_id,appraisal_sha256:digest(raw),source_id:args.source_id,fields:Object.fromEntries(args.fields.map(name=>[name,item.fields[name]])),status:chart.status,semantic_entailment:chart.semantic_entailment,provider_thread_id:chart.provider_provenance.thread_id};
  }
  throw error('Unknown bound research read.',422);
 }
 page(raw,offset,maxBytes,metadata={}){
  if(!Number.isInteger(offset)||offset<0||offset>raw.length||!Number.isInteger(maxBytes)||maxBytes<1||maxBytes>32000||offset<raw.length&&(raw[offset]&0xc0)===0x80)throw error('Invalid UTF8 report byte page.',422);
  let end=Math.min(raw.length,offset+maxBytes);while(end>offset&&end<raw.length&&(raw[end]&0xc0)===0x80)end--;if(end===offset&&offset<raw.length)throw error('Byte cap cannot hold the next UTF8character.',413);
  const bytes=raw.subarray(offset,end);return {...metadata,sha256:digest(raw),offset,next_offset:end<raw.length?end:null,total_bytes:raw.length,text:bytes.toString('utf8'),data_base64:bytes.toString('base64'),chunk_sha256:digest(bytes)};
 }
 async saveFinding(binding,id,input){
  strict(input,['name','findings']);if(typeof input.name!=='string'||!input.name.trim()||input.name.length>200||typeof input.findings!=='string'||input.findings.length>30000)throw error('Bounded name and findings are required.',422);
  const record=await this.record(binding,id,true);if(record.state!=='completed_qualified')throw error('Only a qualified completed research session can be saved as a finding.',409);
  await this.archive(binding,record.lastJobId);const finding={id:randomUUID(),projectId:binding.projectId,sessionId:id,name:input.name,findings:input.findings,jobId:record.lastJobId,createdAt:Date.now()};
  await this.store.tx(true,async tx=>{await this.integration.auth.authorize(binding,binding.projectId,true,tx);await tx.run('MATCH (project:BMProject {id:$projectId}),(job:BMJob {id:$jobId}) CREATE (item:BMResearchFinding) SET item=$item CREATE (project)-[:HAS_RESEARCH_FINDING]->(item) CREATE (item)-[:USES_RUN]->(job)',{projectId:binding.projectId,jobId:record.lastJobId,item:finding});});return finding;
 }
 async finding(binding,id){
  const finding=await this.store.tx(false,async tx=>{await this.integration.auth.authorize(binding,binding.projectId,false,tx);return one(await tx.run('MATCH (item:BMResearchFinding {id:$id,projectId:$projectId}) RETURN item',{id,projectId:binding.projectId}));});if(!finding)throw error('Research finding not found.',404);
  const archived=await this.archive(binding,finding.jobId);return {...finding,research:archived.payload.exchange.result,archive_checksum:archived.checksum};
 }

 async run(job,input,signal){
  const authorize=()=>this.integration.auth.authorize(input.authorization,input.authorization.projectId,true);await authorize();
  await this.store.checkpoint(job,{execution_id:input.execution_id,session_id:input.sessionId,state:'mapped_before_launch'});
  const output=await runEngine(this.integration.runner,input.request,signal,value=>this.store.checkpoint(job,value),authorize);
  // Bind Python's canonical request bytes explicitly; never compare codecs by assumption.
  const binding={request:input.request,transport_request_json:JSON.stringify(input.request)};
  checkSessionResult(output,binding);
  return {operation:'research-session',sessionId:input.sessionId,exchange:output,input_binding:binding,authorization:input.authorization,engine_identity:input.engine_identity};
 }
 async publication(job,payload,tx){
  checkSessionResult(payload.exchange,payload.input_binding);
  await tx.run('MATCH (project:BMProject {id:$projectId}),(job:BMJob {id:$jobId}) MERGE (project)-[:HAS_RESEARCH_RUN]->(job)',{projectId:payload.authorization.projectId,jobId:job.id});
  if(payload.input_binding.request.operation.startsWith('snapshot_')){await this.integration.snapshots.publication(job,payload,tx);return;}
  const status=payload.exchange.result,sourceIds=[...(status.source_ids||[]),...(status.source_id?[status.source_id]:[])];
  if(sourceIds.length)await tx.run('UNWIND $sourceIds AS sourceId MERGE (item:BMResearchSource {id:$projectId+":"+sourceId}) SET item.projectId=$projectId,item.sourceId=sourceId,item.userId=$userId,item.jobId=$jobId',{sourceIds,projectId:payload.authorization.projectId,userId:payload.authorization.userId,jobId:job.id});
  if(payload.sessionId){const value=payload.exchange.result;await tx.run('MATCH (item:BMResearchSession {id:$id,projectId:$projectId}) SET item.engineSessionId=$engineId,item.state=CASE WHEN item.cancelledAt IS NOT NULL THEN "cancelled" ELSE $state END,item.lastJobId=$jobId,item.updatedAt=$now,item.pauseRequested=CASE WHEN $resumed THEN false ELSE coalesce(item.pauseRequested,false) OR $pauseRequested END',{id:payload.sessionId,projectId:payload.authorization.projectId,engineId:value.session_id,state:value.state||'ready',jobId:job.id,now:Date.now(),pauseRequested:!!value.control_paused,resumed:payload.input_binding.request.operation==='session_resume'});}
 }
}

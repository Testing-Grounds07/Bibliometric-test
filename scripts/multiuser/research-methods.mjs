// One protected project owner/job path for ordinary UI and delegated MCP graph methods.
import {canonical,digest,error} from './core.mjs';
import {wire} from './research-contracts.mjs';
import {frozenGraph,methodInput,graphPreflight,checkMethodResult,METHOD_GROUPS} from './research-method-contracts.mjs';
import {runEngine} from './research-runner.mjs';
const uuidFrom=value=>{const h=digest(value);return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;};

export class ResearchMethods{
 constructor(integration){this.integration=integration;this.store=integration.store;this.files=integration.files;}
 async capabilities(binding){await this.integration.auth.authorize(binding,binding.projectId);const runtime=this.integration.runner?await runEngine(this.integration.runner,{operation:'method_capabilities'},undefined,async()=>{},()=>this.integration.auth.authorize(binding,binding.projectId)):null;return {schema_version:'bibliomap.graph-methods.v1',groups:METHOD_GROUPS,maximum_operations:50000000,maximum_nodes:2000,maximum_edges:50000,model_presets:runtime?.semantic_presets||{},runtime_available:!!runtime,runtime,scope:'Exact protected parent graph. Cost preflight is conservative; unavailable dependencies/models fail explicitly, no alternate method or sampled node universe.'};}
 async prepared(binding,input){
  const settings=methodInput(input),parent=await this.integration.result(binding,settings.parentResultId);
  if(!['bibliomap','independent-bnr'].includes(parent.backend))throw error('Choose an original frozen native/engine graph; diagnostic/layer-display results are not silently reinterpreted as a new graph.',422);
  const frozen=frozenGraph(parent.payload||{exchange:parent.exchange},{result_id:settings.parentResultId,result_checksum:parent.checksum});
  let comparison;
  if(settings.comparisonResultId){const other=await this.integration.result(binding,settings.comparisonResultId);if(!['bibliomap','independent-bnr'].includes(other.backend))throw error('Choose an original frozen later observation graph.',422);comparison=frozenGraph(other.payload||{exchange:other.exchange},{result_id:settings.comparisonResultId,result_checksum:other.checksum});}
  return {settings,frozen,comparison,parent};
 }
 async preflight(binding,input){await this.integration.auth.authorize(binding,binding.projectId);const {settings,frozen}=await this.prepared(binding,input);return {...graphPreflight(frozen.graph,settings),parent:frozen.origin,groups:METHOD_GROUPS[settings.group],requires_all_source_records:['multiplex','temporal'].includes(settings.group),source_records_available:frozen.sourceRows.length,source_record_scope:'Actual prepared source rows only; not reselected from an evidence preset',ignored_settings:false};}
 async submit(binding,input){
  if(!this.integration.runner)throw error('Independent method engine is not configured.',503);await this.integration.auth.authorize(binding,binding.projectId,true);
  const {settings,frozen,comparison}=await this.prepared(binding,input),preview=graphPreflight(frozen.graph,settings);if(preview.exceeds_known_bound)throw error('Explicit graph-work preflight exceeds selected operations; choose a valid metric batch/bound, never a sampled graph.',422);
  const {idempotencyKey,...effective}=settings;
  const exchange={schema_version:'bnr.bibliomap-method-input.v1',codec:'utf8-json-wire-v1',parent:{...frozen.origin,parent_result_id:settings.parentResultId,parent_result_checksum:frozen.origin.parent?.result_checksum||null,...(comparison?{comparison_result_id:settings.comparisonResultId,comparison_result_checksum:comparison.origin.parent?.result_checksum}: {})},...wire('graph',frozen.graph),...(['multiplex','temporal'].includes(settings.group)?wire('source_records',frozen.sourceRows):{}),...(comparison?wire('comparison_graph',comparison.graph):{})};
  const request={operation:'method',execution_id:uuidFrom([binding.userId,binding.projectId,'method',idempotencyKey]),exchange,settings:effective};
  const payload={operation:'research-method',execution_id:request.execution_id,request,authorization:binding,engine_identity:this.integration.runner.identity,parentResultId:settings.parentResultId};
  const blob=await this.files.put(payload),artifactId=await this.store.tx(true,tx=>this.store.registerArtifact(tx,{...blob,scope:'project:'+binding.projectId,kind:'research-method-input'}));
  const response=await this.integration.auth.submit(binding,'method:'+idempotencyKey,payload,{id:artifactId});return this.integration.status(binding,response.id);
 }
 async run(job,input,signal){
  const authorize=()=>this.integration.auth.authorize(input.authorization,input.authorization.projectId,true);await authorize();
  await this.store.checkpoint(job,{execution_id:input.execution_id,state:'mapped_before_method_launch'});
  const output=await runEngine(this.integration.runner,input.request,signal,value=>this.store.checkpoint(job,value),authorize);
  const binding={request:input.request,engine_identity:input.engine_identity};checkMethodResult(output,binding);
  return {operation:'research-method',exchange:output,input_binding:binding,authorization:input.authorization,parentResultId:input.parentResultId};
 }
 async page(binding,id,section='summary',offset=0,limit=25,run=0,layer=null,algorithm=null){
  if(!['summary','metrics','ranking','family','layers','membership','individual_membership'].includes(section)||!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100||!Number.isSafeInteger(run)||run<0||layer!==null&&(!Number.isSafeInteger(layer)||layer<0))throw error('Choose a bounded typed method-result page.',422);
  const result=await this.integration.result(binding,id);if(result.backend!=='independent-bnr-methods')throw error('Not a protected method result.',422);
  const {value}=checkMethodResult(result.exchange,result.input_binding);
  if(section==='summary'){
   const {metrics,ranking,null_samples,results,joint_fit,individual_layers,source_scope,...summary}=value;
   const scope=source_scope&&Object.fromEntries(Object.entries(source_scope).filter(([key])=>!['source_ids','window_source_ids','source_text_coverage','identity_mapping'].includes(key)));
   const compactFit=fit=>{if(!fit)return undefined;const {runs,coupling_edges,layer_ids,metrics,...rest}=fit;return {...rest,run_count:runs?.length??0,coupling_edge_count:coupling_edges?.length??0,runs:(runs||[]).map(({membership,slice_memberships,...metadata})=>metadata)};};
   const algorithmMetrics=results&&Object.fromEntries(Object.entries(results).map(([name,result])=>{const {precision_recall,...stats}=result.metrics;return [name,{...stats,precision_recall_groups:precision_recall.length}];}));
   const reply={id,checksum:result.checksum,counts:result.exchange.summary,summary,source_scope:scope,...(algorithmMetrics?{algorithm_metrics:algorithmMetrics}:{}),...(joint_fit?{joint_fit:compactFit(joint_fit),individual_layers:individual_layers.map(compactFit)}:{}),large_fields_available:{metrics:!!metrics,ranking:!!ranking,family:!!(value.family||value.counts),layers:!!value.layers,null_samples:!!null_samples,results:!!results,source_coverage:!!source_scope,memberships:!!joint_fit},exact_result_artifact:result.exchange.result_artifact,scope:'Full original result/report/precision-recall groups available through bounded artifact reads; omitted large fields are not sampled. Membership pages/display name the explicit requested run and slice.'};
   if(Buffer.byteLength(JSON.stringify(reply),'utf8')>180000)throw error('Complete summary exceeds bounded response; use exact artifact byte pages.',413);return reply;
  }
  let values;
  if(section==='metrics'&&!Object.hasOwn(value,'metrics')||section==='family'&&!Object.hasOwn(value,'family')&&!Object.hasOwn(value,'counts')||section==='layers'&&!Object.hasOwn(value,'layers')||section==='ranking'&&!Object.hasOwn(value,'ranking')&&!Object.hasOwn(value,'results'))throw error('The selected exact result does not contain this section. Use its summary or original artifacts; no empty substitute is returned.',422);
  if(['membership','individual_membership'].includes(section)){
   const fit=section==='individual_membership'?value.individual_layers?.[layer??0]:value.joint_fit;
   if(!fit?.runs?.[run])throw error('Requested exact run/layer is absent.',404);
   const selected=fit.runs[run],membership=selected.slice_memberships?(layer===null?null:selected.slice_memberships[layer]):selected.membership;
   if(!membership)throw error('Temporal membership requires an explicit slice index.',422);
   values=Object.entries(membership).sort(([a],[b])=>a.localeCompare(b)).map(([id,community])=>({id,community}));
  }else if(section==='ranking'&&value.results){if(typeof algorithm!=='string'||!Object.hasOwn(value.results,algorithm))throw error('Choose one exact executed algorithm for ranking: '+Object.keys(value.results).join(', '),422);values=value.results[algorithm].ranking;}
  else if(section==='family'){const family=value.family||value.counts||{};values=Array.isArray(family)?family:Object.entries(family).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([name,row])=>typeof row==='object'&&row!==null?{...row,class:name}:{class:name,count:row});}
  else values=section==='metrics'?Object.entries(value.metrics||{}).map(([id,metrics])=>({id,...metrics})):section==='ranking'?value.ranking||[]:value.layers||[];
  if(section==='ranking'&&value.ranking&&algorithm!==null&&algorithm!==value.algorithm)throw error('Ranking algorithm differs from the exact executed single-score result.',422);
  const page={id,checksum:result.checksum,section,run,layer,algorithm,offset,total:values.length,values:values.slice(offset,offset+limit),next_offset:offset+limit<values.length?offset+limit:null};
  if(Buffer.byteLength(JSON.stringify(page),'utf8')>180000)throw error('Complete selected entries exceed page byte cap; reduce limit.',413);return page;
 }
 artifacts(payload){const checked=checkMethodResult(payload.exchange,payload.input_binding),values=[];for(const job of payload.exchange.jobs){const record=JSON.parse(checked.entries.get('jobs/'+job.id+'/result.json'));for(const artifact of record.artifacts)if(!artifact.path.includes('/runtime-source/')&&/\.(json|md|csv)$/.test(artifact.path))values.push({stage:job.stage,name:artifact.path.split('/').at(-1),path:artifact.path,sha256:artifact.sha256,bytes:checked.entries.get(artifact.path).length});}return {checked,values};}
}

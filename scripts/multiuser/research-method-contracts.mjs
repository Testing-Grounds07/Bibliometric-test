// Reviewed R5/R12 methods consume exact frozen graphs, not a reselected preset.
import {canonical,digest,error} from './core.mjs';
import {unwire,zipContents,verifyExecutedSources} from './research-contracts.mjs';

export const METHOD_GROUPS={
 structural:{title:'Structural measures and raw rich club',entrypoint:'diagnostics.structural_metrics',meaning:'Graph-relative degree, constraint, harmonic/eigenvector and raw density; no causality or enrichment inference.'},
 multiplex:{title:'Shared-node citation and text layers',entrypoint:'run_analysis.shared_node_multiplex',meaning:'Real source-work semantic layer plus the selected citation graph; exact same typed node identities, no implicit intersection.'},
 temporal:{title:'Joint publication-cohort slices',entrypoint:'run_analysis.temporal_slices',meaning:'Same-ID coupling only in adjacent explicit slices; current-snapshot publication cohorts are not historical citation snapshots.'},
 core_periphery:{title:'Custom ideal-pattern core/periphery',entrypoint:'diagnostics.core_periphery',meaning:'Custom binary ideal-pattern squared error; distinct from k-core, degree confounded, no significance claim.'},
 motifs:{title:'Triad census and motif null evaluation',entrypoint:'diagnostics.triad_census/motif_evaluation',meaning:'Explicit binary topology and complete tested family; degree-preserving null requires substantive justification; swap mixing unassessed.'},
 links:{title:'Link scores and conditional chronology evaluation',entrypoint:'diagnostics.link_scores/temporal_link_evaluation',meaning:'Scores are not probabilities. Future-link evaluation requires compatible frozen graphs and explicit availability evidence; caller chronology is not independently verified.'}
};

const selectedId=value=>typeof value==='object'&&value!==null?String(value.id):String(value);
const id=value=>{const result=selectedId(value);if(!result||result==='undefined'||result==='null'||result.length>1024)throw error('Graph node identity is absent or too long.',422);return result;};
export function frozenGraph(payload,parent){
 let graph,sourceRows=[],origin;
 if(payload.exchange?.schema_version==='bnr.bibliomap-exchange.v1'){
  graph=unwire(payload.exchange,'graph');graph={...graph,representation:graph.representation??'weighted_pairwise'};const archive=zipContents(Buffer.from(payload.exchange.exact_study_archive.data_base64,'base64')),build=payload.exchange.jobs.find(job=>job.stage==='build_corpus');if(build){const corpus=JSON.parse(archive.get('jobs/'+build.id+'/corpus.json'));sourceRows=corpus.map(row=>row.source_metadata);}origin={backend:'independent-bnr',parent,definition:graph.spec,archive_sha256:payload.exchange.exact_study_archive.sha256};
 }else{
  const original=payload.graph;if(!original||!Array.isArray(original.nodes)||!Array.isArray(original.links))throw error('Selected result has no frozen simple graph.',422);
  if(original.networkModel==='hypergraph'||original.representation==='hypergraph'||original.representation==='incidence')throw error('These methods require an explicit pairwise parent. A declared hypergraph is not silently flattened into its canvas projection.',422);
  const directed=original.directed===true||!!original.historiography;
  const kind=original.canvasKind==='coupling'||original.semantic&&original.entityKind==='source'?'eligible_source_works':({author:'authors',institution:'institutions',country:'countries',term:'literal_terms',topic:'provider_topics'}[original.entityKind]||(original.method==='cocitation'||original.historiography?'cited_works':'unknown_entities'));
  const nodes=original.nodes.map(node=>({id:id(node.id)})),edges=original.links.map(edge=>({source:id(edge.source),target:id(edge.target),weight:edge.strength??edge.weight,support:edge.shared??edge.support??null}));
  const construction=original.construction||null;
  graph={schema_version:'bnr.graph.v1',representation:'weighted_pairwise',node_universe:kind,directed,nodes,edges,isolates:[],spec:{method:'imported_frozen_graph',node_entity_kind:kind,directed,construction,edge_definition:original.metric||null,thresholds:{minimumShared:payload.settings?.minimumShared??null,minimumCosine:payload.settings?.minimumCosine??null,threshold:payload.settings?.threshold??null,support:payload.settings?.support??null}}};
  sourceRows=payload.prepared?.works||[];origin={backend:'bibliomap',parent,definition:graph.spec,original_settings:payload.settings||null,source_scope:'Actual frozen graph; topology methods do not independently reconstruct its bibliographic projection or repeat corpus preparation'};
 }
 validateFrozenGraph(graph);
 const incident=new Set(graph.edges.flatMap(edge=>[edge.source,edge.target]));graph={...graph,isolates:graph.nodes.filter(node=>!incident.has(node.id)).map(node=>node.id)};
 return {graph,sourceRows,origin,graph_json:canonical(graph),graph_sha256:digest(canonical(graph)),node_universe_sha256:digest(graph.nodes.map(node=>node.id).sort())};
}

export function validateFrozenGraph(graph){
 if(!graph||graph.representation!=='weighted_pairwise'||typeof graph.directed!=='boolean'||typeof graph.node_universe!=='string'||!Array.isArray(graph.nodes)||!Array.isArray(graph.edges)||graph.nodes.length>2000||graph.edges.length>50000)throw error('Method bridge needs a typed simple pairwise graph within2000nodes/50000edges.',422);
 const nodes=new Set(),pairs=new Set();for(const node of graph.nodes){const key=id(node.id);if(key!==node.id||nodes.has(key))throw error('Repeated or non-string graph identity.',422);nodes.add(key);}
 for(const edge of graph.edges){if(!nodes.has(edge.source)||!nodes.has(edge.target)||edge.source===edge.target||typeof edge.weight!=='number'||!Number.isFinite(edge.weight)||edge.weight<=0)throw error('Graph edge endpoint/weight is invalid; no guessed binary weight.',422);const key=canonical(graph.directed?[edge.source,edge.target]:[edge.source,edge.target].sort());if(pairs.has(key))throw error('Repeated simple edge.',422);pairs.add(key);}
 return graph;
}

export function methodInput(input){
 const fields=['parentResultId','comparisonResultId','idempotencyKey','group','operation','request','maxOperations','semanticPresetId','semanticMinWeight','windows','network','resolutions','layerWeights','omega','seeds','iterations'];
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!fields.includes(key))||!Object.hasOwn(METHOD_GROUPS,input.group))throw error('Choose an available typed method group.',422);
 if(typeof input.parentResultId!=='string'||!/^[a-f0-9]{64}$/.test(input.parentResultId)||typeof input.idempotencyKey!=='string'||!input.idempotencyKey.length||input.idempotencyKey.length>200)throw error('An exact protected parent result ID and explicit request key are required.',422);
 if(!Number.isInteger(input.maxOperations)||input.maxOperations<1||input.maxOperations>50000000)throw error('Choose an explicit operation bound1..50000000; exceeding it does not sample the graph.',422);
 if(!input.request||typeof input.request!=='object'||Array.isArray(input.request))throw error('Typed method settings are required.',422);
 if(Object.hasOwn(input.request,'operation'))throw error('Nested operation cannot override the selected fixed method.',422);
 if(input.operation==='structural_metrics'){
  const metrics=input.request.metrics||[];
  if(!Array.isArray(metrics)||!metrics.length||new Set(metrics).size!==metrics.length||metrics.some(metric=>!['degree','k_core','constraint','rich_club','eigenvector','pagerank','harmonic','betweenness'].includes(metric)))throw error('Choose distinct supported structural metrics.',422);
  if(Object.hasOwn(input.request,'pagerank')&&!metrics.includes('pagerank'))throw error('PageRank settings require the pagerank metric; unused settings are rejected.',422);
  if(Object.hasOwn(input.request,'eigenvector')&&!metrics.includes('eigenvector'))throw error('Eigenvector settings require the eigenvector metric; unused settings are rejected.',422);
  if(Object.hasOwn(input.request,'path_distance')&&!metrics.some(metric=>['harmonic','betweenness'].includes(metric)))throw error('Path distance is used only by harmonic or betweenness; unused settings are rejected.',422);
 }
 if(input.group==='temporal'&&Object.keys(input.request).length)throw error('Publication slices do not consume nested request fields; choose explicit network/windows/joint settings.',422);
 const choices={structural:['structural_metrics'],core_periphery:['core_periphery'],motifs:['triad_census','motif_evaluation'],links:['link_scores','temporal_link_evaluation'],multiplex:['shared_node_multiplex'],temporal:['temporal_slices']};
 if(!choices[input.group].includes(input.operation))throw error('Method operation does not match its selected group.',422);
 const common=new Set(['parentResultId','idempotencyKey','group','operation','request','maxOperations']);
 const extra=input.group==='multiplex'?['semanticPresetId','semanticMinWeight','resolutions','layerWeights','seeds','iterations']:input.group==='temporal'?['windows','network','resolutions','omega','seeds','iterations']:input.operation==='temporal_link_evaluation'?['comparisonResultId']:[];
 for(const key of Object.keys(input))if(!common.has(key)&&!extra.includes(key))throw error('Setting is not used by this selected method: '+key,422);
 if(input.group==='multiplex'&&(typeof input.semanticPresetId!=='string'||typeof input.semanticMinWeight!=='number'||!Number.isFinite(input.semanticMinWeight)||input.semanticMinWeight<=0||input.semanticMinWeight>=1))throw error('Choose a configured semantic model preset and explicit positive cosine threshold(0,1).',422);
 if(['multiplex','temporal'].includes(input.group)){
  if(!Array.isArray(input.seeds)||input.seeds.length<1||input.seeds.length>10||input.seeds.some(seed=>!Number.isInteger(seed)||seed<0||seed>=2**31)||!Number.isInteger(input.iterations)||input.iterations<1||input.iterations>100)throw error('Joint methods need1..10 integer seeds and1..100 fixed iterations.',422);
  if(input.group==='temporal'&&(!Array.isArray(input.windows)||input.windows.length<2||input.windows.length>20||input.windows.some(window=>!Array.isArray(window)||window.length!==2||window.some(year=>!Number.isInteger(year))||window[0]>window[1])||input.windows.some((window,index)=>index>0&&window[0]<input.windows[index-1][0])))throw error('Choose2..20 ordered inclusive publication-year windows.',422);
  const count=input.group==='multiplex'?2:input.windows.length;
  if(!Array.isArray(input.resolutions)||input.resolutions.length!==count||input.resolutions.some(value=>typeof value!=='number'||!Number.isFinite(value)||value<0))throw error('Choose one finite nonnegative resolution per layer.',422);
  if(input.group==='multiplex'&&(!Array.isArray(input.layerWeights)||input.layerWeights.length!==2||input.layerWeights.some(value=>typeof value!=='number'||!Number.isFinite(value)||value<=0)))throw error('Choose two finite positive layer weights.',422);
  if(input.group==='temporal'&&(typeof input.omega!=='number'||!Number.isFinite(input.omega)||input.omega<0))throw error('Choose explicit finite nonnegative same-ID coupling.',422);
 }
 if(input.operation==='temporal_link_evaluation'&&(typeof input.comparisonResultId!=='string'||!/^[a-f0-9]{64}$/.test(input.comparisonResultId)))throw error('Choose the explicit later frozen result for conditional evaluation.',422);
 return JSON.parse(canonical(input));
}

export function graphPreflight(graph,input){
 const n=graph.nodes.length,m=graph.edges.length;
 let operations=input.operation==='structural_metrics'?n*Math.max(1,n+m)*(input.request.metrics?.length||0):['triad_census','motif_evaluation'].includes(input.operation)?n*(n-1)*(n-2)/6:input.operation==='link_scores'?n*(n-1)/2*Math.max(1,n):input.operation==='temporal_link_evaluation'?n*(n-1)/2*Math.max(1,n)*(input.request.algorithms?.length||1):null;
 return {nodes:n,edges:m,isolates:graph.isolates.length,minimum_known_operations:operations,selected_max_operations:input.maxOperations,policy:'Conservative engine method-specific preflight remains authoritative; this preview is not a runtime promise or scientific threshold',exceeds_known_bound:operations!==null&&operations>input.maxOperations};
}

function availableAbstract(row){
 if(typeof row.abstract==='string')return row.abstract;
 let inverted=row.abstract_inverted_index;if(typeof inverted==='string'){if(Buffer.byteLength(inverted,'utf8')>1000000)return '';try{inverted=JSON.parse(inverted);}catch{return '';}}
 if(!inverted||typeof inverted!=='object'||Array.isArray(inverted))return '';
 const words=new Map();for(const [word,positions]of Object.entries(inverted)){if(!Array.isArray(positions))return '';for(const position of positions){if(!Number.isInteger(position)||position<0||position>=100000||words.has(position))return '';words.set(position,word);}}
 if(!words.size)return '';const maximum=Math.max(...words.keys());if(words.size!==maximum+1)return '';return Array.from({length:maximum+1},(_,index)=>words.get(index)).join(' ');
}

export function checkMethodResult(result,input){
 const request=input.request;
 if(result?.schema_version!=='bnr.bibliomap-method-result.v1'||result.execution_id!==request.execution_id||canonical(result.parent)!==canonical(request.exchange.parent)||result.input_graph_wire_sha256!==request.exchange.graph_sha256||canonical(unwire(result,'settings'))!==canonical(request.settings))throw error('Derived method identity/settings/parent binding failed.',409);
 const archive=result.exact_method_archive,raw=archive&&Buffer.from(archive.data_base64||'','base64');
 if(!archive||archive.format!=='zip'||raw.length!==archive.bytes||digest(raw)!==archive.sha256||!Array.isArray(archive.files))throw error('Original method archive bytes changed.',409);
 const entries=zipContents(raw,8*1024*1024);
 if(entries.size!==archive.files.length||new Set(archive.files.map(file=>file.name)).size!==entries.size||archive.files.some(file=>!entries.has(file.name)||entries.get(file.name).length!==file.bytes||digest(entries.get(file.name))!==file.sha256))throw error('Method archive manifest differs from original files.',409);
 const parse=name=>{const bytes=entries.get(name);if(!bytes)throw error('Original method evidence missing: '+name,409);return JSON.parse(bytes);};
 if(canonical(parse('method-request.json'))!==canonical(request))throw error('Archived method request differs from admitted request.',409);
 if(!Array.isArray(result.jobs)||result.jobs.length<2||new Set(result.jobs.map(job=>job.id)).size!==result.jobs.length)throw error('Method job identities are incomplete/duplicated.',409);
 const kinds=result.jobs.map(job=>job.stage),expected=[...(['multiplex','temporal'].includes(request.settings.group)?['build_corpus']:[]),'construct_network',...(request.settings.group==='multiplex'?['text_model']:[]),'diagnostics'];
 if(canonical(kinds)!==canonical(expected))throw error('Derived method stage sequence is invalid.',409);
 const sourceExpected=new Map(input.engine_identity?.sources||[]);let computed;
 for(const job of result.jobs){
  if(typeof job.id!=='string'||!/^[a-zA-Z0-9-]+$/.test(job.id))throw error('Invalid original method job ID.',409);
  const prefix='jobs/'+job.id+'/',recordRaw=entries.get(prefix+'result.json'),record=recordRaw&&JSON.parse(recordRaw);
  if(!record||digest(recordRaw)!==job.result_sha256||record.id!==job.id||record.stage!==job.stage||record.state!=='completed')throw error('Original method job state/hash differs.',409);
  if(canonical(record.runtime_source)!==canonical(job.runtime_source)||canonical(record.software_versions)!==canonical(job.software_versions))throw error('Method runtime/dependencies differ from archived job.',409);
  verifyExecutedSources(entries,prefix,record,input.engine_identity);
  for(const artifact of record.artifacts){const bytes=entries.get(artifact.path);if(!bytes||digest(bytes)!==artifact.sha256)throw error('Original method artifact changed.',409);}
  if(job.stage==='construct_network'&&canonical(parse(prefix+'graph.json'))!==canonical(unwire(request.exchange,'graph')))throw error('Imported graph differs from admitted parent graph.',409);
  if(job.stage==='diagnostics'){if(canonical(record.parameters)!==canonical(request.settings))throw error('Actual method job parameters differ from admitted settings.',409);computed={job,record};}
  if(job.stage==='text_model'&&(record.parameters.preset_id!==request.settings.semanticPresetId||canonical(Object.fromEntries(Object.entries(record.parameters).filter(([key])=>key!=='preset_id')))!==canonical(request.settings.request)))throw error('Actual encoding parameters/preset differ from admitted source layer.',409);
  if(job.stage==='build_corpus'){
   const supplied=unwire(request.exchange,'source_records'),rawRows=parse(prefix+'raw-records.json'),corpus=parse(prefix+'corpus.json');
   if(canonical(rawRows)!==canonical(supplied)||!Array.isArray(corpus)||corpus.length!==supplied.length||canonical(corpus.map(record=>canonical(record.source_metadata)).sort())!==canonical(supplied.map(canonical).sort()))throw error('Layer corpus/raw observations differ from admitted protected source rows.',409);
  }
 }
 if(canonical(result.summary)!==canonical(computed.record.result))throw error('Displayed method summary differs from exact job.',409);
 for(const [property,name]of [['result_artifact','method-results.json'],['report_artifact','method-report.md']]){const artifact=result[property],path='jobs/'+computed.job.id+'/'+name;if(!artifact||artifact.path!==path||digest(entries.get(path)||Buffer.alloc(0))!==artifact.sha256)throw error('Method result/report artifact binding failed.',409);}
 const value=parse(result.result_artifact.path);
 if(value.operation!==request.settings.operation||canonical(value.effective_bridge_settings)!==canonical(request.settings)||canonical(value.parent_input)!==canonical(request.exchange.parent)||value.input_graph_wire_sha256!==request.exchange.graph_sha256)throw error('Parsed method result effective operation/settings/parent/graph differ.',409);
 if(request.settings.operation==='link_scores'&&value.algorithm!==request.settings.request.algorithm)throw error('Actual ranking algorithm differs from requested method.',409);
 if(request.settings.operation==='temporal_link_evaluation'&&(value.comparison_graph_wire_sha256!==request.exchange.comparison_graph_sha256||canonical(parse('jobs/'+computed.job.id+'/comparison-graph.json'))!==canonical(unwire(request.exchange,'comparison_graph'))))throw error('Actual later observation graph differs from admitted frozen comparison.',409);
 if(request.settings.operation==='shared_node_multiplex'){
  const encoder=result.jobs.find(job=>job.stage==='text_model'),source=result.jobs.find(job=>job.stage==='build_corpus'),scope=value.source_scope;
  if(!encoder||encoder.id!==scope?.semantic_encoder_job)throw error('Actual local semantic layer encoding job is unbound.',409);
  const cachePath='jobs/'+encoder.id+'/vectors.json',cache=parse(cachePath),documents=parse('jobs/'+encoder.id+'/model-input.json').documents,corpus=parse('jobs/'+source.id+'/corpus.json'),semantic=parse('jobs/'+computed.job.id+'/layer-1.json'),citation=parse('jobs/'+computed.job.id+'/layer-0.json');
  const ids=unwire(request.exchange,'graph').nodes.map(node=>node.id).sort(),sameIds=rows=>Array.isArray(rows)&&rows.length===ids.length&&canonical(rows.map(row=>row.id).sort())===canonical(ids);
  if(cache.binding?.corpus_job!==source.id||scope.vector_sha256!==digest(entries.get(cachePath))||cache.model?.dimension!==384||!sameIds(cache.vectors)||!sameIds(documents)||!sameIds(corpus)||!sameIds(semantic.nodes)||!Array.isArray(scope.source_ids)||canonical([...scope.source_ids].sort())!==canonical(ids)||canonical(citation)!==canonical(unwire(request.exchange,'graph')))throw error('Actual vector/source/citation universes or original cache bytes are unbound.',409);
  const lookup=new Map(corpus.map(record=>[record.id,record])),vectors=new Map(cache.vectors.map(vector=>[vector.id,vector]));
  for(const doc of documents){const record=lookup.get(doc.id),text=(record.title||'')+'\n'+availableAbstract(record.source_metadata),vector=vectors.get(doc.id);if(doc.text!==text||doc.text_sha256!==digest(Buffer.from(text,'utf8'))||vector.text_sha256!==doc.text_sha256||!Array.isArray(vector.values)||vector.values.length!==384||vector.values.some(number=>typeof number!=='number'||!Number.isFinite(number)))throw error('Semantic vector text does not bind the exact retained source record.',409);}
  const provenance=semantic;
  if(provenance.vectors_sha256!==digest(entries.get(cachePath))||canonical(provenance.model)!==canonical(cache.model))throw error('Displayed semantic layer model/cache differs from its executed encoder.',409);
 }
 return {result,entries,value};
}

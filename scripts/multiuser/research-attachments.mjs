// Only explicit public scientific results; never agent prompts/private reviews.
import {canonical,digest,error} from './core.mjs';
import {unwire,zipContents} from './research-contracts.mjs';
import {checkMethodResult} from './research-method-contracts.mjs';

export async function prepareAttachments(integration,binding,selected,evidenceId){
 if(!Array.isArray(selected)||selected.length>3)throw error('Choose at most3 explicit existing scientific result attachments.',422);
 const values=[],seen=new Set();let bytes=0;const current=await integration.store.evidence(binding.userId,binding.projectId,evidenceId);
 for(const choice of selected){
  if(!choice||Object.keys(choice).some(key=>!['resultId','relationship','run','layer'].includes(key))||!/^[a-f0-9]{64}$/.test(choice.resultId)||!['same_evidence','explicit_comparison'].includes(choice.relationship)||seen.has(choice.resultId))throw error('Choose distinct exact project results and an explicit evidence relationship.',422);
  seen.add(choice.resultId);const result=await integration.result(binding,choice.resultId),documents=[];
  const add=(name,text,scope)=>{bytes+=Buffer.byteLength(text);if(bytes>4*1024*1024)throw error('Complete public attachment documents exceed4MiB; no automatic sampling.',413);documents.push({name,text,sha256:digest(Buffer.from(text,'utf8')),scope});};
  let parentEvidenceId,parentEvidenceChecksum,definition,universe,sourceIds,operation,settings,selection={};
  const actualSources=original=>{if(original.payload)return(original.payload.prepared?.works||[]).map(row=>String(row.id));const archive=zipContents(Buffer.from(original.exchange.exact_study_archive.data_base64,'base64')),build=original.exchange.jobs.find(job=>job.stage==='build_corpus');return build?JSON.parse(archive.get('jobs/'+build.id+'/corpus.json')).map(row=>row.id):[];};
  if(result.backend==='independent-bnr-methods'){
   const checked=checkMethodResult(result.exchange,result.input_binding),request=result.input_binding.request;settings=request.settings;operation=settings.operation;definition=request.exchange.parent;const original=await integration.result(binding,result.parentResultId);parentEvidenceId=original.exchange?.parent?.evidence_id;parentEvidenceChecksum=original.exchange?.parent?.evidence_checksum||original.payload?.evidenceChecksum;sourceIds=actualSources(original);
   const graph=unwire(request.exchange,'graph');universe=graph.nodes.map(node=>node.id);add('graph.json',request.exchange.graph_json,'Exact original parent graph of this method; attachment is not a new executed check');
   add('method-results.json',checked.entries.get(result.exchange.result_artifact.path).toString('utf8'),'Complete original public computed method output, including achieved objectives/uncertainty; private provider material excluded');
   if(choice.run!==undefined||choice.layer!==undefined){const run=choice.run??0,layer=choice.layer??null;if(!Number.isInteger(run)||run<0||layer!==null&&(!Number.isInteger(layer)||layer<0||layer>=(checked.value.layers?.length??0)))throw error('Select an exact nonnegative retained run/layer.',422);const fit=checked.value.joint_fit?.runs?.[run],membership=fit?.slice_memberships?fit.slice_memberships[layer]:fit?.membership;if(!membership)throw error('Requested attached run/slice membership is absent.',422);selection={run,layer};add('membership.json',canonical(membership),'Exact explicitly selected retained joint run/slice; no best-run selection or new clustering');}
  }else if(['bibliomap','independent-bnr'].includes(result.backend)){
   if(choice.run!==undefined||choice.layer!==undefined)throw error('Run/layer is only used by a joint method attachment.',422);
   const graph=result.exchange?unwire(result.exchange,'graph'):result.payload.graph;settings=result.exchange?unwire(result.exchange,'settings'):result.payload.settings;definition=graph.spec||graph.construction||null;parentEvidenceId=result.exchange?.parent?.evidence_id||result.payload?.evidenceId;parentEvidenceChecksum=result.exchange?.parent?.evidence_checksum||result.payload?.evidenceChecksum;operation=definition?.method||graph.canvasKind||graph.method||'frozen_graph';universe=graph.nodes.map(node=>String(node.id));add('graph.json',result.exchange?.graph_json||canonical(graph),'Complete exact frozen graph representation; all declared nodes/isolates retained');
   sourceIds=actualSources(result);for(const artifact of result.exchange?.artifacts||[])if(['validation-report.json','verifier-receipt.json'].includes(artifact.name))add(artifact.name,artifact.text,'Original archived public check receipt; attachment alone does not constitute a new independent check');
  }else throw error('Choose a native/engine graph or public graph-method result; researcher archives/private model material cannot be attached through this route.',422);
  if(parentEvidenceChecksum===current.artifact.checksum)parentEvidenceId=evidenceId;
  if(choice.relationship==='same_evidence'&&(parentEvidenceId!==evidenceId||parentEvidenceChecksum!==current.artifact.checksum))throw error('The selected result is not bound to this exact evidence version. Explicit comparison must be selected; no implicit merge.',409);
  add('settings.json',canonical(settings),'Exact recorded prior computation settings; not a new protocol or selected corpus');add('source-universe.json',canonical({node_ids:universe,node_count:universe.length,prepared_source_ids:sourceIds,prepared_source_count:sourceIds.length,parent_evidence_id:parentEvidenceId??null}),'Complete frozen graph nodes separately from actual prepared source identities; unknown parent evidence remains unknown');
  values.push({schema_version:'bnr.public-result-attachment.v1',parent:{result_id:result.id,result_checksum:result.checksum,backend:result.backend,evidence_id:parentEvidenceId??null,evidence_checksum:parentEvidenceChecksum??null,definition,operation,checksum_scope:'Original protected BM content-addressed result; document wire hashes separately retain their exact UTF8 bytes'},relationship:choice.relationship,selection,documents});
 }
 return values;
}

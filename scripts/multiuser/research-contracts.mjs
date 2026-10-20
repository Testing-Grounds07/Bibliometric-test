import {canonical,digest,error} from './core.mjs';
import {inflateRawSync} from 'node:zlib';
export const EXCHANGE='bnr.bibliomap-exchange.v1',CODEC='utf8-json-wire-v1',AUDIENCE='bibliomap-research-v1';
export function exact(value,keys){if(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).some(key=>!keys.includes(key)))throw error('Unsupported research request fields.',400);}
export function wire(name,value){const text=canonical(value);return {[name+'_json']:text,[name+'_sha256']:digest(Buffer.from(text,'utf8'))};}
export function unwire(value,name){const text=value[name+'_json'];if(typeof text!=='string'||digest(Buffer.from(text,'utf8'))!==value[name+'_sha256'])throw error('Exchange byte integrity failed: '+name,409);return JSON.parse(text);}
export function normalizedId(id){const match=typeof id==='string'&&/^(?:https?:\/\/openalex\.org\/)?(W[0-9]+)$/i.exec(id.trim());if(!match)throw error('This bridge requires OpenAlex W source/reference identities; arbitrary imported IDs are not mapped or silently excluded.',422);return match[1].toUpperCase();}
export function evidenceExchange(reference,snapshot,settings){
 if(!Array.isArray(snapshot.works)||snapshot.works.length>10000)throw error('Bridge evidence must contain at most 10000 original records.',413);
 for(const work of snapshot.works){normalizedId(work.id);if(Array.isArray(work.referenced_works))for(const id of work.referenced_works)normalizedId(id);}
 return {schema_version:EXCHANGE,codec:CODEC,parent:{evidence_id:reference.id,evidence_checksum:reference.artifact.checksum,artifact_codec:'bm-json-sorted-v1',acquisition:snapshot.specification||null,retrieved_at:snapshot.retrievedAt||null,total:snapshot.total??null,exhausted:snapshot.exhausted??null,capped:snapshot.exhausted!==true,public_evidence:snapshot.publicEvidence===true},...wire('records',snapshot.works),...wire('settings',settings)};
}
export function pipelineSettings(input){
 exact(input,['evidenceId','idempotencyKey','protocol','network','analysis','eligibility']);
 if(typeof input.idempotencyKey!=='string'||!/^[a-zA-Z0-9._-]{1,100}$/.test(input.idempotencyKey))throw error('A bounded idempotencyKey is required.');
 if(!input.protocol||!input.network||Object.keys(input.network).some(k=>!['method','counting','normalization','min_support','min_occurrence','min_weight'].includes(k)))throw error('Provide a protocol and pairwise network specification.');
 if(!['bibliographic_coupling','co_citation','direct_citation'].includes(input.network.method))throw error('Unsupported cycle1 construction.',422);
 const b=input.protocol.budget,caps={max_files:2,max_rows:10000,max_pairs:2000000,memory_mb:1024,threads:2,max_seconds:120,max_disk_mb:256};
 if(!b||Object.entries(caps).some(([k,max])=>b[k]!==undefined&&(!Number.isInteger(b[k])||b[k]<1||b[k]>max)))throw error('Protocol budget exceeds bridge limits.',422);
 if(input.analysis!==undefined&&input.analysis!==null){exact(input.analysis,['representation','optimizer','objective','resolution','seeds','iterations','compute_metrics','path_distance','max_exact_path_nodes','flow_model','two_level','markov_time','trials']);if(!['leiden','infomap'].includes(input.analysis.optimizer))throw error('Unsupported cycle1 optimizer.',422);}
 if(input.eligibility)exact(input.eligibility,['types','year_min','year_max']);
 return {protocol:input.protocol,network:input.network,...(input.analysis?{analysis:input.analysis}:{}),...(input.eligibility?{eligibility:input.eligibility}:{})};
}
export function zipContents(raw,maxCompressedBytes=12*1024*1024){
 if(raw.length>maxCompressedBytes)throw error('Study archive exceeds bridge bound.',413);
 let end=-1;for(let p=raw.length-22;p>=Math.max(0,raw.length-65557);p--)if(raw.readUInt32LE(p)===0x06054b50){end=p;break;}
 if(end<0)throw error('Unsealed study ZIP.',409);
 const count=raw.readUInt16LE(end+10);if(count>5000)throw error('Study ZIP entry bound exceeded.',409);
 let p=raw.readUInt32LE(end+16),total=0;const entries=new Map();
 for(let i=0;i<count;i++){
  if(p+46>raw.length||raw.readUInt32LE(p)!==0x02014b50)throw error('Malformed study ZIP directory.',409);
  const method=raw.readUInt16LE(p+10),size=raw.readUInt32LE(p+24),compressed=raw.readUInt32LE(p+20),n=raw.readUInt16LE(p+28),extra=raw.readUInt16LE(p+30),comment=raw.readUInt16LE(p+32),local=raw.readUInt32LE(p+42),name=raw.subarray(p+46,p+46+n).toString('utf8');
  total+=size;if(total>256*1024*1024||size>32000000||!name||name.startsWith('/')||name.includes('..')||[...name].some(c=>[0,58,92].includes(c.charCodeAt(0)))||entries.has(name)||![0,8].includes(method))throw error('Unsafe/oversized study ZIP entry.',409);
  if(local+30>raw.length||raw.readUInt32LE(local)!==0x04034b50)throw error('Malformed study ZIP entry.',409);
  const start=local+30+raw.readUInt16LE(local+26)+raw.readUInt16LE(local+28);if(start+compressed>raw.length)throw error('Truncated study ZIP.',409);
  const bytes=method===0?raw.subarray(start,start+compressed):inflateRawSync(raw.subarray(start,start+compressed),{maxOutputLength:Math.max(1,size)});
  if(bytes.length!==size)throw error('Study ZIP size mismatch.',409);entries.set(name,bytes);p+=46+n+extra+comment;
 }
 return entries;
}
export function verifyExecutedSources(entries,prefix,record,identity){
 const sources=record.runtime_source,expected=identity?new Map(identity.sources):null,names=new Set();
 if(!Array.isArray(sources)||!sources.length)throw error('Executed source manifest is missing.',409);
 for(const source of sources){
  if(typeof source?.path!=='string'||!source.path.startsWith('runtime-source/')||source.path.includes('..')||source.path.includes('\\'))throw error('Executed source path is invalid.',409);
  const name=source.path.split('/').at(-1),bytes=entries.get(prefix+source.path);
  if(names.has(name)||!bytes||digest(bytes)!==source.sha256||expected&&expected.get(name)!==source.sha256)throw error('Executed source bytes/manifest differ from admitted implementation.',409);names.add(name);
 }
 if(expected&&(names.size!==expected.size||[...expected.keys()].some(name=>!names.has(name))))throw error('Executed source manifest is incomplete for admitted implementation.',409);
}
export function checkResult(result,input){
 if(result?.schema_version!==EXCHANGE||result.codec!==CODEC||result.raw_records_sha256!==input.exchange.records_sha256||canonical(result.parent)!==canonical(input.exchange.parent)||canonical(unwire(result,'settings'))!==canonical(unwire(input.exchange,'settings')))throw error('Engine result exchange binding failed.',409);
 const graph=unwire(result,'graph'),ids=unwire(result,'eligible_source_ids');if(!Array.isArray(graph.nodes)||!Array.isArray(graph.edges)||!Array.isArray(ids)||new Set(ids).size!==ids.length)throw error('Engine result universe is invalid.',409);
 if(result.backend!=='independent-bnr'||input.execution_id&&result.execution_id!==input.execution_id||!Array.isArray(result.jobs)||result.jobs.length<5)throw error('Engine execution identity failed.',409);
 if(canonical(graph.spec)!==canonical(unwire(input.exchange,'settings').network))throw error('Graph definition differs from declared construction.',409);
 const nodes=new Set();for(const node of graph.nodes){if(typeof node.id!=='string'||nodes.has(node.id)||normalizedId(node.id)!==node.id)throw error('Invalid/duplicate engine node.',409);nodes.add(node.id);}
 const pairs=new Set();for(const edge of graph.edges){const key=graph.directed?[edge.source,edge.target].join('|'):[edge.source,edge.target].sort().join('|');if(!nodes.has(edge.source)||!nodes.has(edge.target)||edge.source===edge.target||pairs.has(key)||!Number.isFinite(edge.weight)||edge.weight<0||!Number.isInteger(edge.raw_support)||edge.raw_support<1||!Array.isArray(edge.evidence))throw error('Invalid/duplicate engine edge.',409);pairs.add(key);}
 for(const id of ids)if(normalizedId(id)!==id)throw error('Invalid eligible source identity.',409);
 const archive=result.exact_study_archive;if(!archive||typeof archive.data_base64!=='string'||digest(Buffer.from(archive.data_base64,'base64'))!==archive.sha256||Buffer.from(archive.data_base64,'base64').length!==archive.bytes)throw error('Exact original-byte study archive integrity failed.',409);
 for(const item of result.artifacts||[])if(typeof item.text!=='string'||digest(Buffer.from(item.text,'utf8'))!==item.sha256||Buffer.byteLength(item.text,'utf8')!==item.bytes)throw error('Original engine artifact text integrity failed.',409);
 const entries=zipContents(Buffer.from(archive.data_base64,'base64')),jobIds=new Set();
 const archivedExchange=JSON.parse(entries.get('exchange.json')||'null');if(!archivedExchange||archivedExchange.records_sha256!==input.exchange.records_sha256||canonical(archivedExchange.parent)!==canonical(input.exchange.parent))throw error('Archived original exchange differs.',409);unwire(archivedExchange,'records');
 const stages=result.jobs.map(j=>j.stage);if(new Set(stages).size!==stages.length||!['build_corpus','audit_corpus','construct_network','validate','report'].every(s=>stages.includes(s)))throw error('Incomplete/duplicate engine stages.',409);
 const expectedStages=['build_corpus','audit_corpus','construct_network',...(unwire(input.exchange,'settings').analysis?['run_analysis']:[]),'validate','report'];if(canonical(stages)!==canonical(expectedStages))throw error('Executed stage sequence differs from declared request.',409);
 for(const job of result.jobs){
  if(typeof job.id!=='string'||!/^[a-zA-Z0-9-]+$/.test(job.id)||jobIds.has(job.id))throw error('Invalid/duplicate engine job ID.',409);jobIds.add(job.id);
  const prefix='jobs/'+job.id+'/',raw=entries.get(prefix+'result.json');if(!raw||digest(raw)!==job.result_sha256)throw error('Archived exact engine job binding failed.',409);
  const record=JSON.parse(raw);if(record.id!==job.id||record.stage!==job.stage||record.state!=='completed')throw error('Archived engine state differs.',409);
  if(canonical(record.runtime_source)!==canonical(job.runtime_source)||canonical(record.software_versions)!==canonical(job.software_versions))throw error('Engine runtime provenance differs from archived job.',409);
  verifyExecutedSources(entries,prefix,record,input.engine_identity);
  for(const artifact of record.artifacts){const bytes=entries.get(artifact.path);if(!bytes||digest(bytes)!==artifact.sha256)throw error('Archived engine artifact differs.',409);}
  if(job.stage==='construct_network'){const bytes=entries.get(prefix+'graph.json');if(!bytes||canonical(JSON.parse(bytes))!==canonical(graph))throw error('Displayed graph differs from exact archived graph.',409);}
  if(job.stage==='build_corpus'){const corpus=JSON.parse(entries.get(prefix+'corpus.json'));if(canonical(corpus.map(r=>r.id).sort())!==canonical(ids))throw error('Eligible source universe differs from archive.',409);}
 }
 const displayed=new Set();for(const item of result.artifacts||[]){const key=item.stage+'/'+item.name;if(displayed.has(key)||typeof item.name!=='string'||item.name.includes('/')||item.name.includes('\\'))throw error('Duplicate/invalid displayed artifact.',409);displayed.add(key);const job=result.jobs.find(j=>j.stage===item.stage),bytes=job&&entries.get('jobs/'+job.id+'/'+item.name);if(!bytes||digest(bytes)!==item.sha256||!bytes.equals(Buffer.from(item.text,'utf8')))throw error('Displayed artifact differs from exact archived bytes.',409);}
 return result;
}

// Immutable physical-observation comparison. This never relaxes graph compatibility.
import {canonical,digest,error} from './core.mjs';
import {normalizedId} from './research-contracts.mjs';

const SECTIONS=['added_ids','removed_ids','common_ids','changed_common_ids','unchanged_common_ids'];
const MAX_ROWS=10000,MAX_RAW_BYTES=20*1024*1024,MAX_ARTIFACT_BYTES=24*1024*1024;
const rawCanonical=(value,depth=0)=>{
 if(depth>64)throw error('Raw JSON nesting exceeds the comparison bound; no observations were omitted.',413);
 if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
 if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(v=>rawCanonical(v,depth+1)).join(',')+']';
 if(value&&Object.getPrototypeOf(value)===Object.prototype)return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+rawCanonical(value[k],depth+1)).join(',')+'}';
 throw error('Original observations must contain finite JSON values; undefined or injected bookkeeping is not normalized away.',422);
};
export function versionObservations(records){
 if(!Array.isArray(records)||records.length>MAX_ROWS)throw error('Version comparison requires at most10000 original physical records; no sampling.',413);
 const counts=new Map();let totalBytes=0;
 for(const record of records){
  if(!record||Object.getPrototypeOf(record)!==Object.prototype)throw error('Each physical observation must be its original raw JSON object.',422);
  const id=normalizedId(record.id),encoded=rawCanonical(record);totalBytes+=Buffer.byteLength(encoded,'utf8');if(totalBytes>MAX_RAW_BYTES)throw error('Original comparison records exceed20MiB; no observations were omitted.',413);
  const fingerprint=digest(encoded);if(!counts.has(id))counts.set(id,new Map());const multiset=counts.get(id);multiset.set(fingerprint,(multiset.get(fingerprint)||0)+1);
 }
 return {counts,rows:records.length,bytes:totalBytes,codec:'sha256 of canonical raw JSON; object keys sorted, array order/missing/null/empty values and duplicate multiplicity retained',raw_identity:'No per-version IDs, locators, timestamps or arrival bookkeeping is introduced before fingerprinting'};
}
function difference(before,after,parentBinding,newBinding){
 const beforeIds=[...before.counts.keys()].sort(),afterIds=[...after.counts.keys()].sort(),common=beforeIds.filter(id=>after.counts.has(id)),changed=[],unchanged=[];let matched=0;
 for(const id of common){const a=before.counts.get(id),b=after.counts.get(id);for(const [fingerprint,count]of a)matched+=Math.min(count,b.get(fingerprint)||0);const keys=new Set([...a.keys(),...b.keys()]);([...keys].some(key=>(a.get(key)||0)!==(b.get(key)||0))?changed:unchanged).push(id);}
 return {schema_version:'bibliomap.evidence-version-diff.v1',parent:parentBinding,next:newBinding,raw_rows_before:before.rows,raw_rows_after:after.rows,unique_ids_before:beforeIds.length,unique_ids_after:afterIds.length,added_ids:afterIds.filter(id=>!before.counts.has(id)),removed_ids:beforeIds.filter(id=>!after.counts.has(id)),common_ids:common,changed_common_ids:changed,unchanged_common_ids:unchanged,matched_identical_physical_observations:matched,added_physical_observations:after.rows-matched,removed_physical_observations:before.rows-matched,fingerprint_codec:before.codec,raw_identity:before.raw_identity,scope:'Raw physical-observation multisets, not bibliographic semantic equality, chronology, graph/partition comparability or complete acquisition. Original evidence versions and acquisition descriptors remain immutable.'};
}
export function compareEvidenceVersions(beforeRaw,afterRaw,parentBinding,newBinding){return difference(versionObservations(beforeRaw),versionObservations(afterRaw),parentBinding,newBinding);}

export class ResearchVersions{
 constructor(integration){this.integration=integration;}
 async load(binding,id){
  const integration=this.integration;await integration.auth.authorize(binding,binding.projectId);
  const reference=await integration.store.evidence(binding.userId,binding.projectId,id);
  if(!Number.isSafeInteger(reference.artifact.bytes)||reference.artifact.bytes<0||reference.artifact.bytes>MAX_ARTIFACT_BYTES)throw error('Original evidence artifact exceeds the24MiB comparison read bound.',413);
  const snapshot=await integration.files.get(reference.artifact.checksum),observations=versionObservations(snapshot.works);
  const parent={evidence_id:id,evidence_checksum:reference.artifact.checksum,artifact_codec:'bm-json-sorted-v1',records_sha256:digest(canonical(snapshot.works)),raw_rows:observations.rows,unique_ids:observations.counts.size,acquisition:snapshot.specification||null,retrieved_at:snapshot.retrievedAt||null,declared_total:snapshot.total??null,exhausted:snapshot.exhausted??null,capped:snapshot.exhausted!==true,public_evidence:snapshot.publicEvidence===true,acquisition_limits:snapshot.coverage??null};
  return {observations,parent};
 }
 async page(binding,input){
  if(!input||Object.getPrototypeOf(input)!==Object.prototype||Object.keys(input).some(k=>!['beforeEvidenceId','afterEvidenceId','section','offset','limit','workId'].includes(k)))throw error('Provide two exact evidence IDs and a bounded typed comparison page.',422);
  const {beforeEvidenceId,afterEvidenceId,section='summary',offset=0,limit=25,workId}=input;
  if([beforeEvidenceId,afterEvidenceId].some(id=>typeof id!=='string'||!/^([a-f0-9]{64}|[a-f0-9-]{36})$/.test(id))||!['summary','observations',...SECTIONS].includes(section)||!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100||section==='summary'&&offset!==0||section!=='observations'&&workId!==undefined||section==='observations'&&(typeof workId!=='string'||normalizedId(workId)!==workId))throw error('Choose exact protected evidence IDs, an available section, offset>=0 and limit1..100; observation pages require one canonical workId.',422);
  const before=await this.load(binding,beforeEvidenceId),after=await this.load(binding,afterEvidenceId),diff=difference(before.observations,after.observations,before.parent,after.parent);
  // Publication must still be authorized even if membership changed during reads.
  await this.integration.auth.authorize(binding,binding.projectId);
  const comparisonId=digest({project:binding.projectId,parent:before.parent,next:after.parent,fingerprint_codec:diff.fingerprint_codec});let result;
  if(section==='summary'){
   result={...diff,project_id:binding.projectId,comparison_id:comparisonId,section,sections:Object.fromEntries(SECTIONS.map(name=>[name,{total:diff[name].length}]))};for(const name of SECTIONS)delete result[name];
  }else{
   const a=before.observations.counts,b=after.observations.counts,detail=id=>{const describe=counts=>{const entries=[...(counts.get(id)||new Map())].sort(([a],[b])=>a.localeCompare(b));return {physical_rows:entries.reduce((sum,[,n])=>sum+n,0),distinct_fingerprints:entries.length,multiset_sha256:digest(canonical(entries))};};return {id,before:describe(a),after:describe(b)};};
   let values,total;
   if(section==='observations'){if(!a.has(workId)&&!b.has(workId))throw error('Work identity is absent from both exact evidence versions.',404);const fingerprints=[...new Set([...(a.get(workId)?.keys()||[]),...(b.get(workId)?.keys()||[])])].sort();total=fingerprints.length;values=fingerprints.slice(offset,offset+limit).map(sha256=>({id:workId,sha256,before_count:a.get(workId)?.get(sha256)||0,after_count:b.get(workId)?.get(sha256)||0}));}
   else {const ids=diff[section];total=ids.length;values=ids.slice(offset,offset+limit).map(detail);}
   result={schema_version:diff.schema_version,project_id:binding.projectId,comparison_id:comparisonId,parent:before.parent,next:after.parent,section,...(workId?{work_id:workId}:{}),offset,total,values,next_offset:offset+limit<total?offset+limit:null,observation_detail:'Use section=observations and canonical workId to page every fingerprint/count; original raw rows remain on both evidence versions.',scope:diff.scope};
  }
  if(Buffer.byteLength(canonical(result),'utf8')>180000)throw error('Complete comparison entries exceed180kB; reduce the page size. Summary/acquisition descriptor overflow requires a smaller supported evidence artifact, never silent truncation.',413);
  return result;
 }
}

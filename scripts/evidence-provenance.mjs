const canonical=value=>value&&typeof value==='object'?Array.isArray(value)?value.map(canonical):Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const equal=(first,second)=>JSON.stringify(canonical(first))===JSON.stringify(canonical(second));

export function immutableEvidenceContext(graph){
 const provenance=graph?.evidenceProvenance,previous=graph?.scientificManifest;
 const value=provenance?.evidenceId?provenance:previous?.evidence?.id?{evidenceId:previous.evidence.id,retrievedAt:previous.evidence.retrievedAt,retrieval:previous.evidence.retrieval,completeness:previous.evidence.completeness,textVersions:previous.dependencies?.textVersions}:null;
 if(!value)return null;
 const context={evidenceId:value.evidenceId,retrievedAt:value.retrievedAt??null,retrieval:value.retrieval??null,completeness:value.completeness};
 if(value.textVersions?.evidence!==undefined)context.textVersions={evidence:value.textVersions.evidence};
 return structuredClone(context);
}

export function inheritEvidenceContext(target,parent,sourceCorpusId){
 if(typeof sourceCorpusId!=='string'||!sourceCorpusId)throw Error('The derived view has no verified source corpus. The previous map was retained.');
 if(target.sourceCorpusId&&target.sourceCorpusId!==sourceCorpusId||parent?.sourceCorpusId&&parent.sourceCorpusId!==sourceCorpusId)throw Error('The derived view and parent belong to different source corpora. The previous map was retained.');
 const context=immutableEvidenceContext(parent),existing=immutableEvidenceContext(target);
 if(context&&parent.sourceCorpusId!==sourceCorpusId)throw Error('The pinned parent evidence has no verifiable source-corpus scope. Reopen its saved finding.');
 if(existing){
  if(target.sourceCorpusId!==sourceCorpusId)throw Error('The derived evidence pin has no verifiable source-corpus scope.');
  if(context&&(['evidenceId','retrievedAt','retrieval'].some(key=>existing[key]!=null&&context[key]!=null&&!equal(existing[key],context[key]))))throw Error('The derived view already identifies different pinned evidence. The previous map was retained.');
  if(existing.textVersions?.evidence!=null&&context?.textVersions?.evidence!=null&&!equal(existing.textVersions.evidence,context.textVersions.evidence))throw Error('The derived view identifies a different retained evidence-text revision. The previous map was retained.');
 }
 return {...target,sourceCorpusId,externalCorpus:parent?.externalCorpus===true||target.externalCorpus===true,...(existing||context?{evidenceProvenance:existing||context}:{})};
}

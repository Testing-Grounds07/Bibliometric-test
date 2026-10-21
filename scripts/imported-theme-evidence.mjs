// Current text interpretation is separate from the retained imported network.
const approved=new WeakMap();
export const standaloneImport=graph=>!!graph?.importedStandalone&&graph._backend==='independent-bnr-standalone';
export async function textDigest(value){return [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(byte=>byte.toString(16).padStart(2,'0')).join('');}

export function strictSourceText(record){
 const title=typeof (record.display_name??record.title)==='string'?(record.display_name??record.title):'';
 let index=record.abstract_inverted_index;
 if(typeof index==='string'){try{index=JSON.parse(index);}catch{return {title:title===record.id?'':title,abstract:'',abstractStatus:'invalid_json_abstract_omitted'};}}
 const result={title:title===record.id?'':title,abstract:'',abstractStatus:'missing_abstract'};
 if(index==null)return result;
 if(typeof index!=='object'||Array.isArray(index))return {...result,abstractStatus:'invalid_abstract_omitted'};
 const words=new Map();
 for(const [word,positions]of Object.entries(index)){
  if(!word||!Array.isArray(positions)||!positions.length)return {...result,abstractStatus:'invalid_abstract_omitted'};
  for(const position of positions){if(!Number.isSafeInteger(position)||position<0||position>200000||words.has(position))return {...result,abstractStatus:'invalid_abstract_omitted'};words.set(position,word);}
 }
 if(!words.size)return result;
 for(let position=0;position<words.size;position++)if(!words.has(position))return {...result,abstractStatus:'gapped_abstract_omitted'};
 return {...result,abstract:[...words].sort((a,b)=>a[0]-b[0]).map(([,word])=>word).join(' '),abstractStatus:'retained_contiguous_abstract'};
}

export async function importedTextInput(corpusId,articles){
 if(typeof corpusId!=='string'||!Array.isArray(articles)||!articles.length||articles.length>20000)throw Error('Pinned source-text input is unavailable.');
 const seen=new Set(),references={};
 const documents=articles.map(record=>{if(typeof record?.id!=='string'||seen.has(record.id))throw Error('Pinned source IDs are missing or duplicated.');seen.add(record.id);references[record.id]=Array.isArray(record.references)?record.references:Array.isArray(record.referenced_works)?record.referenced_works:[];return {id:record.id,...strictSourceText(record)};}).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
 const sourceIds=documents.map(document=>document.id),textCoverage={sources:documents.length,withTitle:documents.filter(d=>d.title).length,withAbstract:documents.filter(d=>d.abstract).length,omittedInvalidAbstracts:documents.filter(d=>d.abstractStatus.includes('omitted')).length,withoutText:documents.filter(d=>!d.title&&!d.abstract).length};
 return {sourceCorpusId:corpusId,sourceIds,referenceIds:[],references,documents,importedSourceText:{schema_version:'bibliomap.imported-source-text.v1',sourceIds,textSha256:await textDigest(JSON.stringify(documents)),coverage:textCoverage,scope:'Exact retained source titles and contiguous available abstracts. Invalid or gapped abstracts omitted explicitly; no previous/reference-cache filling, no new retrieval. Current interpretative overlay; not approval by the retained study reviewers.'}};
}

export async function bindImportedThemes(graph,data,packet){
 approved.delete(graph);
 if(!standaloneImport(graph)||graph.collaboration||graph.temporalSelection||graph.semantic&&graph.entityKind!=='source'||!packet||packet.corpusId!==graph.sourceCorpusId||packet.evidence?.sourceCorpusId!==packet.corpusId||data?.sourceCorpusId!==packet.corpusId)throw Error('Keyword evidence does not match this saved source corpus.');
 const input=await importedTextInput(packet.corpusId,packet.evidence.articles),sourceIds=new Set(input.sourceIds);
 if(!Array.isArray(graph.nodes)||graph.nodes.some(node=>!sourceIds.has(node.id)))throw Error('Displayed nodes are not all members of the pinned source corpus.');
 const value=await validateImportedCache(data,input);approved.set(graph,value);return value;
}

export async function validateImportedCache(data,input){
 const binding=data?.importedSourceText;
 if(!binding||data.sourceCorpusId!==input.sourceCorpusId||JSON.stringify(binding)!==JSON.stringify(input.importedSourceText)||binding.textSha256!==await textDigest(JSON.stringify(input.documents)))throw Error('Keyword cache lacks the exact pinned source-text binding.');
 const expected=input.documents.filter(document=>document.title||document.abstract),cached=data.documents;
 if(!cached||typeof cached!=='object'||Array.isArray(cached)||Object.keys(cached).length!==expected.length||!expected.length)throw Error('Keyword cache has missing, foreign or unavailable source text.');
 if(data.dimensions!==384||typeof data.model!=='string'||!/^[a-f0-9]{40,64}$/i.test(data.revision||''))throw Error('Keyword model identity or dimensions are not pinned.');
 for(const document of expected){const actual=cached[document.id];if(!actual||actual.id!==document.id||actual.title!==document.title||actual.abstract!==document.abstract||typeof actual.embedding!=='string'||atob(actual.embedding).length!==data.dimensions||!Array.isArray(actual.phrases))throw Error('Keyword cache text or embeddings do not match the pinned sources.');
  for(const phrase of actual.phrases){if(typeof phrase.text!=='string'||!phrase.text.trim()||phrase.text.length>500||!Number.isFinite(phrase.semantic)||!Number.isInteger(phrase.count)||phrase.count<1||!Array.isArray(phrase.evidence)||!phrase.evidence.length||phrase.evidence.length>3)throw Error('Invalid keyword evidence.');for(const span of phrase.evidence){const text=document[span.field];if(!['title','abstract'].includes(span.field)||!Number.isInteger(span.start)||!Number.isInteger(span.end)||span.start<0||span.end<=span.start||span.end>Array.from(text).length)throw Error('Keyword evidence has invalid source offsets.');if(Array.from(text).slice(span.start,span.end).join('').toLowerCase().replace(/\s+/g,' ')!==phrase.text.toLowerCase())throw Error('Keyword phrase does not match its literal source span.');}}
 }
 return {schema_version:'bibliomap.imported-theme-binding.v1',corpusId:input.sourceCorpusId,textSha256:binding.textSha256,cacheProjectionSha256:await textDigest(JSON.stringify(data))};
}
export function importedThemeBinding(graph){return approved.get(graph)||null;}
export function clearImportedThemes(graph){approved.delete(graph);}

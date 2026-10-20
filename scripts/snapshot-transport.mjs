import {canonicalScience,scienceDigest} from './scientific-manifest.mjs';

export const SNAPSHOT_TRANSPORT_VERSION='pinned-source-fields-v1';
const marker='__bibliomapPinnedSourceFields',fields=['authorships','abstract_inverted_index','topics'],maximumReferences=100000,maximumDepth=64,maximumValues=3000000;
const maximumExpandedBytes=256*1024*1024,maximumExpandedValues=10000000;
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const own=(value,key)=>Object.hasOwn(value,key);
const define=(object,key,value)=>Object.defineProperty(object,key,{value,enumerable:true,writable:true,configurable:true});
const normalized=value=>JSON.parse(JSON.stringify(value,(key,item)=>item instanceof Set?[...item]:item));
const validHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function scope(context){if(!record(context)||typeof context.corpusId!=='string'||!context.corpusId||typeof context.evidenceId!=='string'||!context.evidenceId)throw Error('Pinned snapshot transport needs a known corpus and evidence identity. Reopen the saved study.');}
function sourceMap(records){if(!Array.isArray(records))throw Error('Pinned source records are unavailable. Reopen the saved study.');const result=new Map();for(const source of records){if(!record(source)||typeof source.id!=='string'||!source.id||result.has(source.id))throw Error('Pinned source records have missing or ambiguous identities.');result.set(source.id,source);}return result;}
function inspectScope(value,context){if(Array.isArray(value.nodes)&&Array.isArray(value.links)){if(value.sourceCorpusId&&value.sourceCorpusId!==context.corpusId)throw Error('A saved graph belongs to different pinned source evidence.');for(const pin of[value.evidenceProvenance?.evidenceId,value.scientificManifest?.evidence?.id])if(pin&&pin!==context.evidenceId)throw Error('A saved graph identifies different pinned evidence.');}if(value.evidenceCorpusId&&record(value.graph)&&value.evidenceCorpusId!==context.corpusId)throw Error('A saved parent belongs to different pinned source evidence.');}
function budget(){let values=0,references=0;return {value(depth){if(depth>maximumDepth||++values>maximumValues)throw Error('Snapshot transport exceeds the explicit nesting/value budget. No fields were discarded.');},reference(){if(++references>maximumReferences)throw Error('Snapshot transport exceeds the explicit reference budget. No records were sampled.');},count:()=>references};}
function valueSize(value){let bytes=0,values=0;function visit(item,depth){if(depth>maximumDepth||++values>maximumExpandedValues)throw Error('Expanded snapshot exceeds its explicit depth/value budget.');if(item===null||typeof item!=='object'){bytes+=new TextEncoder().encode(JSON.stringify(item)).length;return;}bytes+=2;const entries=Array.isArray(item)?item.map(value=>[null,value]):Object.entries(item);for(const [key,child]of entries){bytes++;if(key!==null)bytes+=new TextEncoder().encode(JSON.stringify(key)).length+1;visit(child,depth+1);if(bytes>maximumExpandedBytes)throw Error('Expanded snapshot exceeds its explicit 256 MiB byte budget.');}}visit(value,0);return {bytes,values};}

export function assertPlainSnapshot(snapshot){const limits=budget();function visit(value,depth){limits.value(depth);if(value===null||typeof value!=='object')return;if(own(value,marker))throw Error('Pinned source references require their verified transport envelope.');for(const item of Object.values(value))visit(item,depth+1);}visit(snapshot,0);}

export async function snapshotSourceDigests(records,context){
 scope(context);const sources=sourceMap(records),items=[];
 for(const [id,source]of sources){const hashes={};for(const field of fields)if(own(source,field)&&source[field]!==undefined)hashes[field]=await scienceDigest(source[field]);if(Object.keys(hashes).length)items.push({id,fields:hashes});}
 return {version:SNAPSHOT_TRANSPORT_VERSION,corpusId:context.corpusId,evidenceId:context.evidenceId,records:items};
}

export async function compactSnapshotTransport(snapshot,records,index){
 const plain=normalized(snapshot);if(!index)return {snapshot:plain};scope(index);if(index.version!==SNAPSHOT_TRANSPORT_VERSION||!Array.isArray(index.records))throw Error('Pinned snapshot transport metadata is unsupported. Reopen the saved study.');
 const sources=sourceMap(records),digests=new Map(),cache=new Map(),limits=budget();
 for(const item of index.records){if(!record(item)||typeof item.id!=='string'||digests.has(item.id)||!record(item.fields)||Object.entries(item.fields).some(([field,digest])=>!fields.includes(field)||!validHash(digest)))throw Error('Pinned snapshot field checksums are invalid.');digests.set(item.id,item.fields);}
 async function visit(value,depth){
  limits.value(depth);if(value===null||typeof value!=='object')return value;
  if(Array.isArray(value)){const result=[];for(const item of value)result.push(await visit(item,depth+1));return result;}
  if(own(value,marker))throw Error('The saved view already contains a reserved transport marker.');inspectScope(value,index);
  const matching=[],source=typeof value.id==='string'?sources.get(value.id):null,expected=source&&digests.get(value.id);
  if(expected)for(const field of fields)if(own(value,field)&&own(source,field)&&expected[field]&&canonicalScience(value[field])===canonicalScience(source[field])){const key=value.id+'\0'+field;if(!cache.has(key))cache.set(key,await scienceDigest(source[field]));if(cache.get(key)===expected[field])matching.push(field);}
  const result={};for(const [key,item]of Object.entries(value))if(!matching.includes(key))define(result,key,await visit(item,depth+1));
  if(matching.length){limits.reference();define(result,marker,{id:value.id,fields:matching.map(field=>({name:field,sha256:expected[field]}))});}return result;
 }
 const result=await visit(plain,0);if(!limits.count())return {snapshot:plain};
 return {snapshot:result,snapshotTransport:{version:SNAPSHOT_TRANSPORT_VERSION,corpusId:index.corpusId,evidenceId:index.evidenceId,references:limits.count(),logicalSha256:await scienceDigest(plain)}};
}

export async function hydrateSnapshotTransport(snapshot,transport,records,context,options={}){
 scope(context);if(!record(transport)||transport.version!==SNAPSHOT_TRANSPORT_VERSION||transport.corpusId!==context.corpusId||transport.evidenceId!==context.evidenceId||!validHash(transport.logicalSha256)||!Number.isInteger(transport.references)||transport.references<1||transport.references>maximumReferences)throw Error('Pinned snapshot transport does not match this corpus and evidence.');
 const byteLimit=options.maximumExpandedBytes??maximumExpandedBytes,valueLimit=options.maximumExpandedValues??maximumExpandedValues;if(!Number.isInteger(byteLimit)||byteLimit<1||byteLimit>maximumExpandedBytes||!Number.isInteger(valueLimit)||valueLimit<1||valueLimit>maximumExpandedValues)throw Error('Expanded snapshot budgets may only be reduced, never increased.');
 const sources=sourceMap(records),cache=new Map(),limits=budget(),expanded=valueSize(snapshot);if(expanded.bytes>byteLimit||expanded.values>valueLimit)throw Error('Expanded snapshot already exceeds its configured budget.');
 async function visit(value,depth){
  limits.value(depth);if(value===null||typeof value!=='object')return value;
  if(Array.isArray(value)){const result=[];for(const item of value)result.push(await visit(item,depth+1));return result;}
  const result={};for(const [key,item]of Object.entries(value))if(key!==marker)define(result,key,await visit(item,depth+1));
  if(own(value,marker)){
   limits.reference();const reference=value[marker];if(!record(reference)||Object.keys(reference).some(key=>!['id','fields'].includes(key))||typeof reference.id!=='string'||reference.id!==value.id||!Array.isArray(reference.fields)||!reference.fields.length||reference.fields.length>fields.length)throw Error('A pinned source reference is malformed.');
   const source=sources.get(reference.id),seen=new Set();if(!source)throw Error('A pinned source reference cannot be resolved in this corpus.');
   for(const field of reference.fields){if(!record(field)||Object.keys(field).some(key=>!['name','sha256'].includes(key))||!fields.includes(field.name)||seen.has(field.name)||own(value,field.name)||!validHash(field.sha256)||!own(source,field.name)||source[field.name]===undefined)throw Error('A pinned source field reference is invalid.');seen.add(field.name);const key=reference.id+'\0'+field.name;if(!cache.has(key))cache.set(key,{...valueSize(source[field.name]),sha256:await scienceDigest(source[field.name])});const verified=cache.get(key);if(verified.sha256!==field.sha256)throw Error('Pinned source field content no longer matches its checksum.');expanded.bytes+=verified.bytes;expanded.values+=verified.values;if(expanded.bytes>byteLimit||expanded.values>valueLimit)throw Error('Expanded snapshot exceeds the explicit byte/value budget (at most 256 MiB / 10,000,000 values). No sources were sampled.');define(result,field.name,normalized(source[field.name]));}
  }
  inspectScope(result,context);return result;
 }
 const result=await visit(snapshot,0);if(limits.count()!==transport.references||await scienceDigest(result)!==transport.logicalSha256)throw Error('The hydrated snapshot does not match its complete logical checksum.');return result;
}

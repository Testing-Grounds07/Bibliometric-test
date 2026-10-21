// Scientific identity excludes layout and interpretative labels, never membership.
export const RETAINED_CHECKS_VERSION = 'bibliomap.retained-checks.v1';
export function assertLegacyCountEvidence(graph,records,entry,input){
 if(input.kind!=='rank-cutoff'||input.options?.rankMetric!=='global-citations'||input.options.globalCitationField!=='citedBy')return;
 const complete=entry?.checks?.some(c=>c.id==='rank-cutoff'&&c.result?.audit?.global_count_missing===0);
 const ids=new Set(graph.nodes.map(n=>n.id));
 if(!complete&&records.some(r=>ids.has(r.id)&&r.citedBy===0))throw Error('This legacy packet has citation-count zeros with unknown missingness provenance. Use strength or incoming citations, or supply explicit raw cited_by_count metadata. Zeros are not assumed to be missing or observed.');
}
export function researchTypeMap(csv) {
 csv=csv.replace(/^\uFEFF/,'');
 const rows=[];let row=[],field='',quoted=false;
 for(let i=0;i<csv.length;i++){const c=csv[i];if(c==='"'){if(quoted&&csv[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(field);field='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&csv[i+1]==='\n')i++;row.push(field);rows.push(row);row=[];field='';}else field+=c;}
 if(quoted)throw Error('Incomplete source-type CSV.');if(field||row.length){row.push(field);rows.push(row);}
 const header=rows.shift()||[],id=header.indexOf('id'),type=header.indexOf('type');if(id<0||type<0)throw Error('Source-type fields are missing.');
 const out={};for(const r of rows){const key=r[id]?.replace(/^https?:\/\/openalex.org\//,'');if(!/^W\d+$/.test(key)||!r[type]||out['https://openalex.org/'+key])throw Error('Invalid or duplicate source type record.');out['https://openalex.org/'+key]=r[type];}return out;
}
function canonical(value) {
 if (Array.isArray(value)) return value.map(canonical);
 if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,canonical(value[key])]));
 return value;
}
export function researchGraphIdentity(graph) {
 if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.links)) throw Error('A complete graph is required.');
 const endpoint=value=>typeof value==='object'?value.id:value;
 // The canvas adds this derived count during restoration; memberships are pinned below.
 const clustering=graph.clustering?{...graph.clustering}:undefined;if(clustering)delete clustering.clusters;
 const nodes=graph.nodes.map(n=>({id:n.id,cluster:n.cluster,engineCommunity:n.engineCommunity,references:[...(n.references||[])].sort()})).sort((a,b)=>a.id.localeCompare(b.id));
 if(new Set(nodes.map(n=>n.id)).size!==nodes.length)throw Error('Duplicate source IDs.');
 const links=graph.links.map(e=>{const pair=[endpoint(e.source),endpoint(e.target)];if(!graph.directed)pair.sort();return{pair,strength:e.strength,weight:e.weight,count:e.count,rawSupport:e.rawSupport,similarity:e.similarity,references:[...(e.references||[])].sort()};}).sort((a,b)=>JSON.stringify(a.pair).localeCompare(JSON.stringify(b.pair)));
 return canonical({nodes,links,sourceCorpusId:graph.sourceCorpusId,projectId:graph._projectId,method:graph.method,canvasKind:graph.canvasKind,entityKind:graph.entityKind,directed:graph.directed,networkModel:graph.networkModel,order:graph.order,maximumOrder:graph.maximumOrder,hyperedges:graph.hyperedges,construction:graph.construction,normalization:graph.normalization,counting:graph.counting,threshold:graph.threshold,minimumSupport:graph.minimumSupport,minimumShared:graph.minimumShared,minimumCosine:graph.minimumCosine,minimumRetainedWeight:graph.minimumRetainedWeight,resolution:graph.resolution,clustering,appliedSettings:graph.appliedSettings,semantic:graph.semantic,importedStandalone:graph.importedStandalone,evidenceProvenance:graph.evidenceProvenance});
}
export async function researchGraphDigest(graph) {
 const bytes=new TextEncoder().encode(JSON.stringify(researchGraphIdentity(graph)));
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export async function bindRetainedChecks(graph,manifest,readBytes) {
 if(manifest?.schema_version!==RETAINED_CHECKS_VERSION||!Array.isArray(manifest.maps))throw Error('Unsupported retained-check index.');
 const candidates=manifest.maps.filter(m=>m.map_key===graph.importedStandalone?.map_key&&m.corpus_id===graph.sourceCorpusId&&m.project_id===graph._projectId);
 if(!candidates.length)return null;
 const digest=await researchGraphDigest(graph),entry=candidates.find(m=>m.graph_sha256===digest);
 if(!entry)throw Error('Retained checks withheld: graph, membership, source or settings changed.');
 if(!Array.isArray(entry.artifacts)||!entry.artifacts.length||!Array.isArray(entry.checks))throw Error('Incomplete retained-check evidence.');
 for(const artifact of entry.artifacts){
  if(typeof artifact.path!=='string'||!/^ai-research\/[a-zA-Z0-9_./-]+$/.test(artifact.path)||artifact.path.split('/').includes('..')||!/^[a-f0-9]{64}$/.test(artifact.sha256))throw Error('Invalid retained evidence identity.');
  const bytes=await readBytes(artifact.path),actual=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
  if(actual!==artifact.sha256)throw Error('Retained checks withheld: supporting file identity changed.');
 }
 return structuredClone(entry);
}

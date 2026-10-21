import {RESEARCH_CHECK_VERSION} from './research-check-methods.mjs';

// A navigation indicator for whole-map evidence, never a per-cluster grade.
export function clusterMapChecks(graph,cluster,{entry=null,digest=null}={}){
 if(!graph||!(Number(cluster)>0))return null;
 const members=graph.nodes.filter(n=>String(n.cluster)===String(cluster));if(!members.length)return null;
 const matched=digest&&entry?.graph_sha256===digest&&entry.corpus_id===graph.sourceCorpusId&&entry.project_id===graph._projectId&&entry.map_key===graph.importedStandalone?.map_key;
 const retained=(matched?entry.checks:[]).filter(c=>c.relationship==='Includes this map or its explicitly named baseline comparison');
 const fresh=(graph.researchCheckRuns||[]).filter(r=>digest&&r.graph_sha256===digest&&r.result?.version===RESEARCH_CHECK_VERSION&&r.result.status==='completed'&&r.result.executed===true);
 if(!retained.length&&!fresh.length)return null;
 return {cluster:String(cluster),members:members.length,retainedCount:retained.length,freshCount:fresh.length,label:'Map checks · '+(retained.length+fresh.length),detail:`Cluster ${cluster}: ${retained.length} retained whole-map checks and ${fresh.length} fresh diagnostic results. These are map-level results, not a stability rating for this cluster.`};
}

export function clearClusterMapChecks(root){
 for(const wrapper of root.querySelectorAll('.cluster-research-tile')){const button=wrapper.querySelector('.cluster-button');if(button)wrapper.replaceWith(button);else wrapper.remove();}
}

export function syncClusterMapChecks(root,graph,state,onOpen){
 for(const button of root.querySelectorAll('.cluster-buttons .cluster-button[data-cluster]')){
  const cluster=button.dataset.cluster,info=clusterMapChecks(graph,cluster,state);let wrapper=button.parentElement?.classList.contains('cluster-research-tile')?button.parentElement:null;
  if(!info){if(wrapper)wrapper.replaceWith(button);continue;}
  if(!wrapper){const focused=root.activeElement===button;wrapper=root.createElement('div');wrapper.className='cluster-research-tile';button.before(wrapper);wrapper.append(button);if(focused)button.focus({preventScroll:true});}
  let link=wrapper.querySelector('.cluster-map-checks');if(!link){link=root.createElement('button');link.type='button';link.className='cluster-map-checks';wrapper.append(link);}
  if(link.textContent!==info.label)link.textContent=info.label;
  link.title=info.detail;link.setAttribute('aria-label','View map-level research checks for cluster '+cluster);link.setAttribute('aria-controls','researchChecks');
  link.onclick=event=>{event.stopPropagation();onOpen(graph,cluster);};
 }
}

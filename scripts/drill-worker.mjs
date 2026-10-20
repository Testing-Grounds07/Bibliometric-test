import {analysisErrorMessage} from './analysis-errors.mjs';
import {drillGraph,analyzeDrill,expandedMembers} from './drill-analysis.mjs';
self.onmessage=event=>{
 try{
  const {base,members,bundles,order,cap,articleIds,minimumSupport=5,expanded=false,referenceMinimum=5,parentThreshold=10}=event.data;
  const selected=expanded?expandedMembers(base,members,referenceMinimum,minimumSupport,parentThreshold):members;
  const graph=drillGraph(base,selected,bundles,order,cap,minimumSupport),anchors=new Set(members);
  for(const node of graph.nodes)node.addedReference=!anchors.has(node.id);
  graph.expansion={enabled:expanded,referenceMinimum,minimumSupport,parentThreshold,anchorCount:members.length,addedCount:selected.length-members.length,rule:'One-hop pairwise co-citation to an original anchor; additions must be below the parent reference-frequency threshold. No recursive neighbor expansion.'};
  self.postMessage({graph,config:analyzeDrill(graph,articleIds,progress=>self.postMessage({progress}))});
 }catch(error){self.postMessage({error:analysisErrorMessage(error)});}
};

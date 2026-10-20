(() => {
 'use strict';
 window.selectAtlasCandidate=(config,mode)=>{
  const resolution=mode==='auto'?config.autoResolution:Number(mode);
  if(!Number.isFinite(resolution)||resolution<=0)throw new Error('Invalid CPM resolution');
  return [...config.candidates].sort((left,right)=>Math.abs(Math.log(left.resolution/resolution))-Math.abs(Math.log(right.resolution/resolution))||left.resolution-right.resolution)[0];
 };
 window.atlasAudit=(config,candidate,mode)=>({version:config.version||window.ATLAS_SETTINGS.version,enabled:mode==='auto',selectedResolution:config.autoResolution,actualResolution:candidate.resolution,requestedResolution:mode==='auto'?null:Number(mode),recommendation:config.recommendation,density:config.density,linkedNodes:config.linkedNodes,searchRange:config.searchRange,boundarySelected:config.boundarySelected,testedResolutions:config.candidates.length,bootstrapARI:candidate.bootstrapARI,bootstrapCoverage:candidate.bootstrapCoverage,bootstrapARIInterval:candidate.bootstrapARIInterval,bootstrapCoverageInterval:candidate.bootstrapCoverageInterval,neighborARI:candidate.neighborARI,singletonFraction:candidate.singletonFraction,score:candidate.score,fragmentation:candidate.fragmentation,selectionEligible:candidate.selectionEligible,bootstrapSamples:config.bootstrapCount||window.ATLAS_SETTINGS.bootstrapCount,bootstrapRestarts:config.bootstrapRestarts,fullRestarts:config.fullRestarts,method:config.method||window.ATLAS_SETTINGS.method,limitations:config.limitations||window.ATLAS_SETTINGS.limitations});
 window.atlasSetting=(threshold,order,cap,mode)=>{
  const key=`s${threshold}_${order==='all'?'cap'+cap:'n'+order}`,config=window.ATLAS_SETTINGS.configs[key];
  if(!config)throw new Error('Unsupported analysis setting: '+key);
  const candidate=window.selectAtlasCandidate(config,mode);
  return {key,config,candidate};
 };
 window.resolveAtlasGraph=(name,mode,cap)=>{
  const graph=JSON.parse(JSON.stringify(window.ATLAS_DATA.graphs[name]));
  const {key,config,candidate}=window.atlasSetting(graph.threshold,graph.order,cap,mode);
  if(graph.order==='all'){
   graph.maximumOrder=cap;const nodes=new Map(graph.nodes.map(node=>[node.id,node]));
   for(const edge of graph.links){
    for(const id of Object.keys(edge.maximumOrderByArticle))edge.maximumOrderByArticle[id]=Math.min(edge.maximumOrderByArticle[id],cap);
    edge.combinedScore=Object.values(edge.maximumOrderByArticle).reduce((sum,order)=>sum+1+Math.log2(order-1),0);
    edge.higherOrderBonus=edge.combinedScore-edge.count;edge.maximumSupportedOrder=Math.max(...Object.values(edge.maximumOrderByArticle));edge.orderProfile=edge.orderProfile.filter(row=>row.order<=cap);
    edge.strength=edge.combinedScore/(nodes.get(edge.source).citations*nodes.get(edge.target).citations);
   }
   graph.metric={...graph.metric,maximumIncludedOrder:cap,definition:graph.metric.definition+' For this view, K is capped at '+cap+'.'};
  }
  graph.derivedFromAnalysisId=graph.analysisId;graph.analysisId=candidate.analysisId||null;
  graph.resolution=candidate.resolution;
  const degrees=new Map(graph.nodes.map(node=>[node.id,0]));for(const edge of graph.links){degrees.set(edge.source,degrees.get(edge.source)+1);degrees.set(edge.target,degrees.get(edge.target)+1);}
  for(const node of graph.nodes){node.cluster=candidate.memberships[node.id]||0;node.degree=degrees.get(node.id);}
  graph.stats={nodes:graph.nodes.length,edges:graph.links.length,clusters:candidate.clusters,isolated_nodes:graph.nodes.filter(node=>!node.degree).length};
  graph.clustering={algorithm:'leiden',objective:'cpm',resolution:candidate.resolution,weight_scale:candidate.scale,restarts:10,selected_seed:candidate.seed,quality:candidate.quality,communities:candidate.clusters};
  graph.autoCPM={...window.atlasAudit(config,candidate,mode),setting:key};
  return graph;
 };
})();

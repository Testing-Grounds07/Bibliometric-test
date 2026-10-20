import createGraph from 'ngraph.graph';
import {detectClusters} from 'ngraph.leiden';
import {analysisNetwork, isIncidenceModel, incidenceNetwork, hypergraphProjection} from './hypergraph-network.mjs';
export const AUTO_CPM_VERSION=3;
export const AUTO_CPM_METHOD='Overview-oriented Auto CPM. Selection uses the fixed density-adaptive logarithmic grid plus legacy settings, not locally refined points. Fifty conditional source bootstraps, two Leiden starts per bootstrap, ten full-data starts. Score = nonnegative mean bootstrap ARI × retained-node coverage − 0.20 × introduced tiny-reference fraction − 0.10 × introduced tiny-cluster fraction. Tiny means 1–3 references; intact disconnected components are exempt. Admissible settings require mean ARI ≥0.70, coverage ≥0.80, introduced tiny-reference fraction ≤0.20 and introduced tiny-cluster fraction ≤0.50. Choose the fewest clusters within 0.05 of the best admissible score, breaking ties by lower CPM. A recommended range must contain that choice, span at least a factor of two, include ≥3 consecutive eligible tested points and have every-pair partition ARI ≥0.90. Otherwise show an exploratory overview with no clear recommendation. These thresholds express an overview preference, not a validated optimum.';
export const AUTO_CPM_LIMITATIONS='Exploratory heuristics, not CHAMP, significance tests, confidence intervals or thematic validation. Bootstrap 10th–90th percentiles describe observed resampling spread. References, discovered bundles and expanded-neighborhood membership remain fixed; no re-mining or neighbor re-selection. Sampled stable ranges do not establish stability between every tested point. Single-cluster stability does not demonstrate a meaningful subdivision.';
export function densityGrid(graph){
 if(isIncidenceModel(graph)){const network=incidenceNetwork(graph);return {density:network.density,linkedNodes:network.articleIds.length,meanEdgeWeight:network.scale,resolutions:Array.from({length:17},(_,position)=>(network.density||.02)*2**(-5+position/2))};}
 graph=analysisNetwork(graph);
 const linked=new Set(graph.links.flatMap(edge=>[edge.source,edge.target])),possible=linked.size*(linked.size-1)/2;
 const meanEdgeWeight=graph.links.reduce((sum,edge)=>sum+edge.strength,0)/Math.max(1,graph.links.length);
 const density=possible&&meanEdgeWeight?graph.links.reduce((sum,edge)=>sum+edge.strength/meanEdgeWeight,0)/possible:0;
 const center=density||.02;
 const resolutions=[...new Set([.005,.01,.02,.04,.07,.1,.16,...Array.from({length:17},(_,position)=>Number((center*2**(-5+position/2)).toPrecision(8)))])].sort((left,right)=>left-right);
 return {density,linkedNodes:linked.size,meanEdgeWeight,resolutions};
}
export function fragmentation(graph,memberships){
 if(isIncidenceModel(graph))graph={...graph,networkModel:'connectivity-only',links:incidenceNetwork(graph).groups.flatMap(edge=>edge.members.slice(1).map(target=>({source:edge.members[0],target,strength:1})))};
 graph=analysisNetwork(graph);
 const adjacency=new Map();for(const edge of graph.links){if(!adjacency.has(edge.source))adjacency.set(edge.source,[]);if(!adjacency.has(edge.target))adjacency.set(edge.target,[]);adjacency.get(edge.source).push(edge.target);adjacency.get(edge.target).push(edge.source);}
 const componentByNode=new Map(),components=[];
 for(const start of adjacency.keys()){if(componentByNode.has(start))continue;const component=components.length,stack=[start],members=[];componentByNode.set(start,component);while(stack.length){const current=stack.pop();members.push(current);for(const next of adjacency.get(current))if(!componentByNode.has(next)){componentByNode.set(next,component);stack.push(next);}}components.push(members);}
 const groups=new Map();for(const [id,cluster] of Object.entries(memberships)){if(!groups.has(cluster))groups.set(cluster,[]);groups.get(cluster).push(id);}
 let tinyNodes=0,tinyClusters=0,introducedTinyNodes=0,introducedTinyClusters=0,subdividedGroups=0;
 for(const members of groups.values()){const component=components[componentByNode.get(members[0])],intact=!!component&&members.length===component.length&&members.every(id=>componentByNode.get(id)===componentByNode.get(members[0]));if(!intact)subdividedGroups++;if(members.length<=3){tinyNodes+=members.length;tinyClusters++;if(!intact){introducedTinyNodes+=members.length;introducedTinyClusters++;}}}
 return {components:components.length,componentSizes:components.map(members=>members.length).sort((left,right)=>right-left),tinyNodes,tinyClusters,introducedTinyNodes,introducedTinyClusters,introducedTinyNodeFraction:introducedTinyNodes/Math.max(1,adjacency.size),introducedTinyClusterFraction:introducedTinyClusters/Math.max(1,subdividedGroups),singletons:[...groups.values()].filter(members=>members.length===1).length,pairs:[...groups.values()].filter(members=>members.length===2).length,triples:[...groups.values()].filter(members=>members.length===3).length};
}
export function scoreCandidates(candidates){
 candidates.sort((left,right)=>left.resolution-right.resolution);
 for(const [position,candidate] of candidates.entries()){
  const neighbors=[candidates[position-1],candidates[position+1]].filter(Boolean);
  candidate.neighborARI=neighbors.reduce((sum,other)=>sum+agreement(candidate.memberships,other.memberships),0)/Math.max(1,neighbors.length);
  candidate.score=Math.max(0,candidate.bootstrapARI)*candidate.bootstrapCoverage-.2*candidate.fragmentation.introducedTinyNodeFraction-.1*candidate.fragmentation.introducedTinyClusterFraction;
 }
}
export function recommendRange(candidates){
 const grid=candidates.filter(candidate=>candidate.selectionEligible!==false).sort((left,right)=>left.resolution-right.resolution),coarsest=(left,right)=>left.clusters-right.clusters||left.resolution-right.resolution;
 const admissible=grid.filter(candidate=>candidate.bootstrapARI>=.7&&candidate.bootstrapCoverage>=.8&&candidate.fragmentation.introducedTinyNodeFraction<=.2&&candidate.fragmentation.introducedTinyClusterFraction<=.5),bestScore=Math.max(...admissible.map(candidate=>candidate.score));
 const eligible=candidate=>admissible.includes(candidate)&&candidate.score>=bestScore-.05;
 const preferred=[...grid.filter(eligible)].sort(coarsest),fallbackBest=Math.max(...grid.map(candidate=>candidate.score)),fallback=grid.filter(candidate=>candidate.score>=fallbackBest-.05).sort(coarsest),choice=preferred[0]||fallback[0];
 const base={range:null,representative:choice.resolution,admissibleSettings:admissible.length,nearBestSettings:preferred.length};
 if(!choice.clusters)return {...base,status:'no_edges',reason:'No eligible connections; no CPM recommendation.'};
 if(!preferred.length)return {...base,status:'no_clear_recommendation',reason:'No clear CPM recommendation: stability, coverage and fragmentation safeguards conflict. Showing a broader near-best score trade-off, with safeguards unmet—not a validated recommendation.'};
 if(choice.clusters<=choice.fragmentation.components)return {...base,status:'no_subdivision',reason:'No supported internal subdivision at the overview choice; groups reflect disconnected components. This is not evidence of validated themes.'};
 const bands=[];
 for(let start=0;start<grid.length;start++){const band=[];for(const candidate of grid.slice(start)){if(!eligible(candidate)||band.some(other=>agreement(other.memberships,candidate.memberships)<.9))break;band.push(candidate);if(band.includes(choice)&&band.length>=3&&candidate.resolution/band[0].resolution>=2-1e-6)bands.push([...band]);}}
 bands.sort((left,right)=>Math.log(right.at(-1).resolution/right[0].resolution)-Math.log(left.at(-1).resolution/left[0].resolution)||left[0].resolution-right[0].resolution);
 if(!bands.length)return {...base,status:'no_clear_recommendation',reason:'No clear recommended CPM range: the broader near-best choice lacks a stable twofold interval. Showing an exploratory overview, not an optimum.'};
 const band=bands[0];return {...base,status:'supported_range',range:[band[0].resolution,band.at(-1).resolution],testedPoints:band.length,clusterRange:[Math.min(...band.map(item=>item.clusters)),Math.max(...band.map(item=>item.clusters))],reason:'Broader near-best overview within a sampled twofold stability range; not a validated optimum.'};
}
export function reselectCPM(graph,config){
 const resolutions=new Set(densityGrid(graph).resolutions);
 if([...resolutions].some(resolution=>!config.candidates.some(candidate=>candidate.resolution===resolution)))throw new Error('Cached audit lacks fixed-grid candidates');
 const candidates=config.candidates.map(candidate=>({...candidate,selectionEligible:resolutions.has(candidate.resolution),fragmentation:fragmentation(graph,candidate.memberships)}));
 scoreCandidates(candidates);const recommendation=recommendRange(candidates),grid=candidates.filter(candidate=>candidate.selectionEligible);
 return {...config,version:AUTO_CPM_VERSION,candidates,recommendation,autoResolution:recommendation.representative,boundarySelected:recommendation.representative===grid[0].resolution||recommendation.representative===grid.at(-1).resolution,method:AUTO_CPM_METHOD,limitations:AUTO_CPM_LIMITATIONS};
}
export function analyzeCPM(graph,articleIds,progress=()=>{}){
 const grid=densityGrid(graph),bootstrapCount=50,bootstrapRestarts=2;
 const samples=Array.from({length:bootstrapCount},(_,sample)=>{
  let seed=20261016+sample;const weights={};
  for(let draw=0;draw<articleIds.length;draw++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const id=articleIds[Math.floor(seed/4294967296*articleIds.length)];weights[id]=(weights[id]||0)+1;}
  return resample(graph,weights,graph.bundles||[]);
 });
 const quantile=(values,fraction)=>{const ordered=values.slice().sort((left,right)=>left-right),offset=(ordered.length-1)*fraction,index=Math.floor(offset);return ordered[index]+(ordered[Math.min(index+1,ordered.length-1)]-ordered[index])*(offset-index);};
 const candidates=[];
 function evaluate(resolution,phase){
  const result=partition(graph,resolution),metrics=samples.map(sample=>{
   const sampled=partition(sample,resolution,bootstrapRestarts),shared=Object.keys(result.memberships).filter(id=>sampled.memberships[id]).length;
   return {ari:agreement(result.memberships,sampled.memberships),coverage:shared/Math.max(1,Object.keys(result.memberships).length)};
  });
  candidates.push({resolution,...result,bootstrapARI:metrics.reduce((sum,item)=>sum+item.ari,0)/bootstrapCount,bootstrapCoverage:metrics.reduce((sum,item)=>sum+item.coverage,0)/bootstrapCount,bootstrapARIInterval:[quantile(metrics.map(item=>item.ari),.1),quantile(metrics.map(item=>item.ari),.9)],bootstrapCoverageInterval:[quantile(metrics.map(item=>item.coverage),.1),quantile(metrics.map(item=>item.coverage),.9)]});
  progress({phase,tested:candidates.length,resolution,bootstrapCount});
 }
 for(const resolution of grid.resolutions)evaluate(resolution,'coarse');
 return reselectCPM(graph,{candidates,density:grid.density,linkedNodes:grid.linkedNodes,meanEdgeWeight:grid.meanEdgeWeight,bootstrapCount,bootstrapRestarts,fullRestarts:10,searchRange:[candidates[0].resolution,candidates.at(-1).resolution]});
}
export function partition(graph,resolution,restarts=10,initialSeed=42){
 if(isIncidenceModel(graph))throw new Error('Bipartite CPM must use the incidence Leiden engine; pair projection is not a fallback.');
 graph=analysisNetwork(graph);
 const network=createGraph(),connected=new Set(graph.links.flatMap(edge=>[edge.source,edge.target]));
 for(const node of graph.nodes)if(connected.has(node.id))network.addNode(node.id);
 const scale=graph.links.reduce((sum,edge)=>sum+edge.strength,0)/Math.max(1,graph.links.length);
 for(const edge of graph.links)network.addLink(edge.source,edge.target,{weight:edge.strength/scale});
 if(!graph.links.length)return {memberships:{},clusters:0,singletonFraction:1,scale:0};
 let best;
 for(let seed=initialSeed;seed<initialSeed+restarts;seed++){const result=detectClusters(network,{quality:'cpm',resolution,randomSeed:seed,linkWeight:link=>link.data.weight}),quality=result.quality();if(!best||quality>best.quality)best={result,quality,seed};}
 const groups=[...best.result.getCommunities().values()].sort((left,right)=>right.length-left.length);
 return {memberships:Object.fromEntries(groups.flatMap((members,position)=>members.map(id=>[id,position+1]))),clusters:groups.length,singletonFraction:groups.filter(group=>group.length===1).length/connected.size,scale,quality:best.quality,seed:best.seed};
}
export function agreement(first,second){
 const ids=Object.keys(first).filter(id=>second[id]),rows=new Map(),columns=new Map(),cells=new Map(),pairs=count=>count*(count-1)/2;
 if(ids.length<2)return 0;
 for(const id of ids){rows.set(first[id],(rows.get(first[id])||0)+1);columns.set(second[id],(columns.get(second[id])||0)+1);const key=first[id]+'|'+second[id];cells.set(key,(cells.get(key)||0)+1);}
 const sum=map=>[...map.values()].reduce((total,count)=>total+pairs(count),0),joint=sum(cells),row=sum(rows),column=sum(columns),expected=row*column/pairs(ids.length),denominator=(row+column)/2-expected;
 return denominator?(joint-expected)/denominator:1;
}

export function resample(graph,weights,bundles){
 const minimumSupport=graph.minimumSupport||5;
 const count=articles=>articles.reduce((sum,id)=>sum+(weights[id]||0),0),frequency=new Map(graph.nodes.map(node=>[node.id,count(node.articles)]));
 const eligible=new Map(bundles.filter(bundle=>count(bundle.articles)>=minimumSupport).map(bundle=>[bundle.id,bundle]));
 const links=[];
 for(const edge of graph.links){
  const sourceFrequency=frequency.get(edge.source),targetFrequency=frequency.get(edge.target);if(!sourceFrequency||!targetFrequency)continue;
  let score=0,support=0;
  if(graph.order===2){support=count(edge.articles);score=support;}
  else if(graph.order==='all'){
   support=count(edge.articles);const orders=new Map(edge.articles.map(id=>[id,2]));
   for(const id of edge.bundleIds||[]){const bundle=eligible.get(id);if(bundle)for(const article of bundle.articles)if(orders.has(article))orders.set(article,Math.max(orders.get(article),Math.min(bundle.members.length,graph.maximumOrder)));}
   score=[...orders].reduce((sum,[id,order])=>sum+(weights[id]||0)*(1+Math.log2(order-1)),0);
  }else{const articles=new Set();for(const id of edge.bundleIds||[]){const bundle=eligible.get(id);if(bundle&&bundle.members.length>=graph.order)for(const article of bundle.articles)articles.add(article);}support=count([...articles]);score=support;}
  if(support>=minimumSupport)links.push({...edge,strength:score/(sourceFrequency*targetFrequency)});
 }
 return {nodes:graph.nodes,links};
}

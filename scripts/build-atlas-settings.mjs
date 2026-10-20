import fs from 'node:fs';
import vm from 'node:vm';
import {analyzeCPM,AUTO_CPM_VERSION,AUTO_CPM_METHOD,AUTO_CPM_LIMITATIONS} from './auto-cpm.mjs';
const context={window:{}};
vm.runInNewContext(fs.readFileSync('public/conservative-atlas/data.js','utf8'),context);
const data=context.window.ATLAS_DATA,graphs=Object.entries(data.graphs),articleIds=Object.keys(data.articles);
const previousContext={window:{}};
vm.runInNewContext(fs.readFileSync('public/conservative-atlas/settings-data.js','utf8'),previousContext);
const previous=previousContext.window.ATLAS_SETTINGS;
const checkpoint='.trials/conservative-cocitation/auto-cpm-v3-checkpoint.json';
const output=fs.existsSync(checkpoint)?JSON.parse(fs.readFileSync(checkpoint,'utf8')):{version:AUTO_CPM_VERSION,createdAt:new Date().toISOString(),bootstrapCount:50,method:AUTO_CPM_METHOD,limitations:AUTO_CPM_LIMITATIONS,configs:{}};
function cappedGraph(base,cap){
 const graph=structuredClone(base);if(cap===null)return graph;
 const nodes=new Map(graph.nodes.map(node=>[node.id,node]));graph.maximumOrder=cap;
 graph.links=graph.links.map(edge=>{const maximumOrderByArticle=Object.fromEntries(Object.entries(edge.maximumOrderByArticle).map(([id,order])=>[id,Math.min(order,cap)])),combinedScore=Object.values(maximumOrderByArticle).reduce((sum,order)=>sum+1+Math.log2(order-1),0);return {...edge,maximumOrderByArticle,combinedScore,higherOrderBonus:combinedScore-edge.count,maximumSupportedOrder:Math.max(...Object.values(maximumOrderByArticle)),orderProfile:edge.orderProfile.filter(row=>row.order<=cap),strength:combinedScore/(nodes.get(edge.source).citations*nodes.get(edge.target).citations)};});return graph;
}

const tasks=[];
for(const threshold of [10,20,30]){
 const baseline=graphs.filter(([,graph])=>graph.threshold===threshold&&graph.resolution===.02),combined=baseline.find(([,graph])=>graph.order==='all');
 for(const [name,graph] of baseline.filter(([,graph])=>graph.order!=='all'))tasks.push({key:`s${threshold}_n${graph.order}`,name,graph:cappedGraph(graph,null)});
 for(let cap=2;cap<=combined[1].maximumOrder;cap++)tasks.push({key:`s${threshold}_cap${cap}`,name:combined[0],graph:cappedGraph(combined[1],cap)});
}

for(const [position,task] of tasks.entries()){
 if(output.configs[task.key]){console.log(task.key+' resumed');continue;}
 task.graph.bundles=data.bundlesByScope[task.graph.threshold]||[];
 const config=analyzeCPM(task.graph,articleIds);
 for(const candidate of config.candidates){
  const old=previous.configs[task.key]?.candidates.find(item=>item.resolution===candidate.resolution&&item.analysisId);
  if(old&&JSON.stringify(old.memberships)===JSON.stringify(candidate.memberships))candidate.analysisId=old.analysisId;
 }
 output.configs[task.key]={...config,base:task.name,threshold:task.graph.threshold,order:task.graph.order,maximumOrder:task.graph.order==='all'?task.graph.maximumOrder:null};
 console.log((position+1)+'/'+tasks.length+' '+task.key+': '+config.autoResolution+' '+JSON.stringify(config.recommendation));
 fs.writeFileSync(checkpoint,JSON.stringify(output));
}
output.method=AUTO_CPM_METHOD;output.limitations=AUTO_CPM_LIMITATIONS;
for(const config of Object.values(output.configs)){config.method=AUTO_CPM_METHOD;config.limitations=AUTO_CPM_LIMITATIONS;}
fs.writeFileSync('public/conservative-atlas/settings-data.js','window.ATLAS_SETTINGS='+JSON.stringify(output).replaceAll('<','\\u003c')+';\n');
fs.writeFileSync('.trials/conservative-cocitation/auto-cpm-settings.json',JSON.stringify(output));

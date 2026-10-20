import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {Neo4jStore} from '../neo4j-store.mjs';

const context={window:{}};
for(const file of ['data.js','settings-data.js','atlas-settings.js'])vm.runInNewContext(fs.readFileSync('public/conservative-atlas/'+file,'utf8'),context);
const {ATLAS_DATA:data,ATLAS_SETTINGS:settings}=context.window;
const identity=JSON.parse(fs.readFileSync('.trials/adaptive-leadership-full/summary.json','utf8'));
const store=Neo4jStore.fromEnvironment();let created=0,reused=0;
try{
 await store.init();
 for(const [key,config] of Object.entries(settings.configs)){
  for(const resolution of new Set([config.autoResolution,.02,.1])){
   const candidate=config.candidates.find(item=>item.resolution===resolution);
   if(candidate.analysisId){reused++;continue;}
   const original=Object.values(data.graphs).find(graph=>graph.threshold===config.threshold&&graph.order===config.order&&graph.resolution===resolution&&(config.order!=='all'||graph.maximumOrder===config.maximumOrder));
   if(original&&original.nodes.every(node=>node.cluster===(candidate.memberships[node.id]||0))){candidate.analysisId=original.analysisId;reused++;continue;}
   const graph=context.window.resolveAtlasGraph(config.base,resolution===config.autoResolution?'auto':String(resolution),config.maximumOrder),nodes=new Map(graph.nodes.map(node=>[node.id,node]));
   const bundles=(data.bundlesByScope[config.threshold]||[]).filter(bundle=>config.order==='all'?config.maximumOrder>=3:config.order>2&&bundle.members.length>=config.order);
   const network={method:'co_citation',representation:config.order==='all'?'capped_all_order_weighted_pair_projection':'higher_order_pair_projection',nodes:graph.nodes.map(node=>({id:node.key,occurrence:node.citations,community:node.cluster?node.cluster-1:null,degree:node.degree,isolated:!node.degree})),edges:graph.links.map(edge=>({source:nodes.get(edge.source).key,target:nodes.get(edge.target).key,raw_weight:edge.count,normalized_weight:edge.strength,weight:edge.strength,articles:edge.articles,...(config.order==='all'?{combined_score:edge.combinedScore,maximum_order_by_article:edge.maximumOrderByArticle,order_profile:edge.orderProfile}:{}),bundle_ids:edge.bundleIds||[]})),bundles,stats:graph.stats,clustering:graph.clustering,auto_cpm:graph.autoCPM,maximum_included_order:config.maximumOrder};
   const record=await store.create('analyses',{project_id:identity.project_id,corpus_id:data.summary.corpus_id,name:`Atlas ${key} · CPM ${resolution}`,parameters:{order:config.order,maximum_included_order:config.maximumOrder,minimum_support:5,minimum_reference_occurrence:config.threshold,clustering:graph.clustering,auto_cpm_audit:graph.autoCPM,source_analysis_id:graph.derivedFromAnalysisId},ref_coverage:data.summary.coverage,network});
   await store.transaction(true,async transaction=>{
    await transaction.run('MATCH (analysis:BMAnalysis {id:$id}), (source:BMAnalysis {id:$source}) CREATE (analysis)-[:DERIVED_FROM]->(source)',{id:record.id,source:graph.derivedFromAnalysisId});
    if(bundles.length){const payload=bundles.map(bundle=>({id:record.id+':'+bundle.id,support:bundle.articles.length,order:bundle.members.length,members:bundle.members.map(id=>nodes.get(id)?.key).filter(Boolean),articles:bundle.articles}));
     await transaction.run('UNWIND $bundles AS bundle MATCH (analysis:BMAnalysis {id:$id}) CREATE (hyperedge:BMCoCitationBundle {id:bundle.id,analysis_id:$id,support:bundle.support,order:bundle.order}) CREATE (analysis)-[:HAS_COCITATION_BUNDLE]->(hyperedge) WITH hyperedge,bundle UNWIND bundle.members AS member MERGE (work:BMWork {id:member}) CREATE (hyperedge)-[:CONTAINS_REFERENCE]->(work)',{id:record.id,bundles:payload});
     await transaction.run('UNWIND $bundles AS bundle MATCH (hyperedge:BMCoCitationBundle {id:bundle.id}) UNWIND bundle.articles AS article MERGE (work:BMWork {id:article}) CREATE (hyperedge)-[:SUPPORTED_BY]->(work)',{bundles:payload});
    }
   });
   const saved=await store.get('analyses',record.id);assert.equal(saved.network.edges.length,graph.links.length);assert.equal(saved.network.clustering.resolution,resolution);
   candidate.analysisId=record.id;created++;
   fs.writeFileSync('public/conservative-atlas/settings-data.js','window.ATLAS_SETTINGS='+JSON.stringify(settings).replaceAll('<','\\u003c')+';\n');
  }
  console.log(key+' saved');
 }
}finally{await store.close();}
fs.writeFileSync('public/conservative-atlas/settings-data.js','window.ATLAS_SETTINGS='+JSON.stringify(settings).replaceAll('<','\\u003c')+';\n');
console.log(JSON.stringify({created,reused}));

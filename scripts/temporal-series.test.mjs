import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTemporalSeries,windowTransitions,temporalSettings} from './temporal-series.mjs';
const works=[{id:'s1',year:2000,references:['a','b']},{id:'s2',year:2001,references:['a','b']},{id:'s3',year:2002,references:['b','c']},{id:'s4',year:null,references:['a','c']}];
const graph={nodes:[{id:'a',articles:['s1','s2','s4']},{id:'b',articles:['s1','s2','s3']},{id:'c',articles:['s3','s4']}],links:[],method:'cocitation',networkModel:'pairwise',order:2,threshold:2,minimumSupport:1,resolution:.02,clustering:{algorithm:'leiden'},scienceAudit:{roles:{}},themeDescriptions:{1:{}}};
test('publication windows actually rebuild pinned incidence and fit fixed declared settings',async()=>{
 const before=JSON.stringify(graph),series=await buildTemporalSeries(graph,works,{from:2000,to:2003,width:2,step:2});assert.equal(series.windows.length,2);assert.equal(series.coverage.unknownYear,1);assert.equal(series.coverage.insideBoundary,3);assert.equal(series.windows[0].graph.links[0].count,2);assert.equal(series.windows[1].graph.links[0].count,1);assert.deepEqual(series.windows[1].graph.links[0].articles,['s3']);for(const period of series.windows){assert.equal(period.graph.clustering.seed,42);assert.equal(period.graph.clustering.starts,3);assert.equal(period.graph.resolution,.02);assert.equal(period.graph.scienceAudit,undefined);assert.equal(period.graph.themeDescriptions,undefined);}assert.equal(JSON.stringify(graph),before);
 assert.deepEqual(series.parentGraph,graph);assert.equal(series.parentGraph.temporalSeries,undefined);await assert.rejects(buildTemporalSeries({...graph,temporalSelection:{index:0}},works,{from:2000,to:2003}),/full pinned map/);
 const changing=await buildTemporalSeries(graph,works,{from:2000,to:2003,width:2,step:2,universe:'changing'});assert.deepEqual(changing.windows[0].graph.nodes.map(node=>node.id),['a','b']);assert.equal(changing.windows[1].graph.nodes.length,0);
});
test('rolling windows, empty exposure, explicit unsupported methods and bounded spans',async()=>{
 const series=await buildTemporalSeries(graph,works,{from:2000,to:2004,width:3,step:1});assert.equal(series.windows[0].sourceCount,3);assert.equal(series.windows.at(-1).status,'no-exposure');assert.equal(series.windows.at(-1).truncatedBoundary,true);assert.equal(series.windows.at(-1).graph.links.length,0);
 for(const patch of[{networkModel:'hypergraph'},{order:3},{clustering:{algorithm:'infomap'}},{semantic:{kind:'terms'}}])await assert.rejects(buildTemporalSeries({...graph,...patch},works,{from:2000,to:2005}),/currently supports/);
 assert.throws(()=>temporalSettings({from:1900,to:2000,width:1,step:1}),/20 completed/);
});
test('coupling changing and fixed source universes differ explicitly',async()=>{
 const parent={...graph,method:'coupling',canvasKind:'coupling',nodes:works.map(work=>({...work,cluster:1})),minimumShared:1,minimumCosine:0};
 for(const universe of['fixed','changing']){const series=await buildTemporalSeries(parent,works,{from:2000,to:2003,width:2,step:2,universe}),period=series.windows[0].graph;assert.equal(period.nodes.length,universe==='fixed'?4:2);assert.equal(period.links.length,1);assert.equal(period.links[0].count,2);if(universe==='fixed')assert.equal(period.nodes.find(node=>node.id==='s3').cluster,0);}
});
test('coupling never expands parent source scope and every retained node is canvas-ready',async()=>{
 const all=works.map(work=>({...work,year:2000})),parent={...graph,method:'coupling',canvasKind:'coupling',nodes:all.slice(0,2),minimumShared:1,minimumCosine:0};
 for(const universe of['fixed','changing']){const result=await buildTemporalSeries(parent,all,{from:2000,to:2000,universe}),next=result.windows[0].graph;assert.equal(next.nodes.length,2);assert.equal(next.links.length,1);assert(next.links.every(edge=>next.nodes.some(node=>node.id===edge.source)&&next.nodes.some(node=>node.id===edge.target)));for(const node of next.nodes){assert.equal(typeof node.label,'string');assert.equal(typeof node.key,'string');assert.equal(typeof node.citations,'number');assert.equal(typeof node.x,'number');assert(Array.isArray(node.articles));}}
 await assert.rejects(buildTemporalSeries({...graph,normalization:'jaccard'},works,{from:2000,to:2001}),/alternative construction/);
});
test('many-to-many transitions retain split merge membership and common denominators, not color identity',()=>{
 const first={nodes:[['a',1],['b',1],['c',2],['d',2],['x',0],['lost',3]].map(([id,cluster])=>({id,cluster}))},second={nodes:[['a',1],['b',2],['c',2],['d',2],['x',0],['new',4]].map(([id,cluster])=>({id,cluster}))},result=windowTransitions(first,second);
 assert.deepEqual(result.splits,[1]);assert.deepEqual(result.merges,[2]);assert.equal(result.commonAssignedBoth,4);assert.deepEqual(result.firstOnly,['lost']);assert.deepEqual(result.secondOnly,['new']);assert.equal(result.overlaps.length,3);assert.deepEqual(result.overlaps.find(edge=>edge.from===1&&edge.to===2).members,['b']);assert.equal(result.firstUnassigned,1);assert.equal(result.unmatchedEarlier[0].cluster,3);
});
test('publication date coverage and explicit seed survive whole-series construction',async()=>{
 const series=await buildTemporalSeries({...graph,evidenceProvenance:{retrievedAt:'2002-06-01T00:00:00Z'},clustering:{algorithm:'leiden',seed:77}},works,{from:2000,to:2003,width:2,step:2});assert.equal(series.evidenceDate,'2002-06-01T00:00:00Z');assert.equal(series.latestPeriod.observationYear,2002);assert.equal(series.windows[1].potentiallyPartial,true);assert.equal(series.settings.seed,77);assert(series.windows.every(period=>period.graph.clustering.seed===77));
 const unknown=await buildTemporalSeries(graph,works,{from:2000,to:2003,width:2,step:2});assert.equal(unknown.evidenceDate,null);assert.match(unknown.latestPeriod.warning,/unknown/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {fitBurstStates,publicationBursts} from './publication-bursts.mjs';
test('constant feature share does not burst merely because publication exposure grows',()=>{
 const rows=[10,10,10,100,100,100,100].map((exposure,index)=>({from:2000+index,to:2000+index,exposure,count:exposure/10})),result=fitBurstStates(rows);assert.equal(result.status,'completed');assert(result.states.every(state=>state===0));assert.equal(result.intervals.length,0);
});
test('batched binomial model detects concentrated shares and preserves no exposure gaps',()=>{
 const rows=Array.from({length:12},(_,index)=>({from:2000+index,to:2000+index,exposure:100,count:index>=6&&index<=8?60:2})),result=fitBurstStates(rows,{scale:2,penalty:1,states:3});assert(result.intervals.some(row=>row.from<=2006&&row.to>=2008));rows[7]={from:2007,to:2007,exposure:0,count:0};const gap=fitBurstStates(rows);assert.equal(gap.states[7],null);assert(!gap.intervals.some(row=>row.from<2007&&row.to>2007));assert.equal(fitBurstStates(rows.map(row=>({...row,count:0}))).status,'unavailable');
});
test('burst evidence counts distinct source documents, unknown dates and partial observation year explicitly',async()=>{
 const works=Array.from({length:90},(_,index)=>({id:'s'+index,year:2000+Math.floor(index/10),title:index>59?'Novel Leadership Novel Leadership':'Old Routine'}));works.push({id:'unknown',year:null,title:'Novel Leadership'});const graph={nodes:[],evidenceProvenance:{evidenceId:'pin',retrievedAt:'2008-06-01T00:00:00Z'}};
 const result=await publicationBursts(works,graph,{from:2000,to:2008,minimumSupport:3,vocabularyLimit:20});assert.equal(result.coverage.unknownYear,1);assert.equal(result.latestPeriod.excludedYear,2008);assert.equal(result.coverage.insideBoundary,80);const feature=result.features.find(row=>row.label==='novel');assert.equal(feature.totalSources,31);assert(feature.periods.every(period=>period.count<=period.exposure));assert.equal(feature.periods.at(-1).rate,null);assert.equal(feature.periods.at(-1).fit,undefined);assert(result.sensitivity.some(row=>row.settings.width===2));assert(result.sensitivity.some(row=>row.settings.excludeLatest===false));assert.equal(result.evidence.evidenceId,'pin');
});
test('penalty sensitivity is genuine, insufficient dates unavailable, references stay scoped',async()=>{
 const rows=Array.from({length:10},(_,index)=>({from:index,to:index,exposure:100,count:index===5?25:5}));const low=fitBurstStates(rows,{penalty:.1}),high=fitBurstStates(rows,{penalty:10});assert(low.intervals.length>high.intervals.length);
 const works=Array.from({length:20},(_,index)=>({id:'s'+index,year:2000+index%3,title:'Leadership Development'})),result=await publicationBursts(works,{nodes:[]},{from:2000,to:2003,excludeLatest:false});assert.equal(result.status,'unavailable');assert(result.features.every(row=>row.fit.status==='unavailable'));
 await assert.rejects(publicationBursts(works,{method:'coupling',nodes:[]},{kind:'references',from:2000,to:2003}),/parent co-citation/);
});
test('period metadata availability is separate from all-source publication exposure',async()=>{
 const works=Array.from({length:60},(_,index)=>({id:'s'+index,year:2000+Math.floor(index/10),title:index%2?'Leadership Development':''})),result=await publicationBursts(works,{nodes:[]},{from:2000,to:2005,excludeLatest:false});assert(result.periods.every(period=>period.exposure===10&&period.availableMetadata===5&&period.unavailableMetadata===5));const coverage=result.sensitivity.find(check=>check.settings.denominator==='available-metadata');assert(coverage);assert.equal(coverage.exposedPeriods,6);
});
test('entirely unavailable feature metadata yields a gap, not fabricated absence against corpus exposure',async()=>{
 const works=Array.from({length:70},(_,index)=>({id:'s'+index,year:2000+Math.floor(index/10),title:Math.floor(index/10)===3?'':'Leadership Development'})),result=await publicationBursts(works,{nodes:[]},{from:2000,to:2006,excludeLatest:false}),gap=result.periods[3];assert.equal(gap.status,'metadata-unavailable');assert.equal(gap.allSourceExposure,10);assert.equal(gap.exposure,0);assert.equal(result.coverage.insideBoundary,70);assert.equal(result.coverage.usableModelExposure,60);assert(result.features.every(row=>row.periods[3].rate===null&&row.fit.states[3]===null));
});

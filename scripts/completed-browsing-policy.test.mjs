import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {automaticSettingsPending} from './canvas-settings.mjs';
import {automaticNavigationAllowed} from './startup-navigation.mjs';

test('actual quick-check scheduler launches zero timers/jobs while browsing completed windows or their parent',()=>{
 const source=readFileSync('scripts/canvas-reliability.mjs','utf8'),body=source.match(/function scheduleQuickCheck\(\) \{([\s\S]*?)\n\}\n\nexport function showCanvasReliability/)[1],schedule=new Function('automaticNavigationAllowed','return function(activeGraph,records,window,settingsValidationState,algorithm,pendingMethod,setTimeout,clearTimeout,run,autoTimer){'+body+'}')(automaticNavigationAllowed),base={nodes:[{id:'a',cluster:1}],clustering:{algorithm:'leiden'}};
 for(const selection of[{linkedBrowse:true},{collaboration:{kind:'author'}},{temporalSeries:{windows:[]}},{temporalSelection:{index:0}},{}]){let timers=0,jobs=0;const graph={...base,...selection},records=new WeakMap([[graph,{}]]);schedule(graph,records,{},()=> 'idle',()=> 'leiden',()=>false,callback=>{timers++;callback();return 1;},()=>{},()=>{jobs++;},null);assert.equal(timers,Object.keys(selection).length?0:1);assert.equal(jobs,Object.keys(selection).length?0:1);}
 let callback,jobs=0;const pending={...base};schedule(pending,new WeakMap([[pending,{}]]),{},()=> 'idle',()=> 'leiden',()=>false,work=>{callback=work;return 1;},()=>{},()=>jobs++,null);pending.temporalSeries={windows:[]};callback();assert.equal(jobs,0,'a previously scheduled callback must recheck completed-series state');
});
test('completed series disables only automatic settings search; ordinary compatible maps retain it',()=>{
 const graph={networkModel:'hypergraph',clustering:{algorithm:'hypergraph'}};assert.equal(automaticSettingsPending(graph),true);assert.equal(automaticSettingsPending({...graph,temporalSeries:{windows:[]}}),false);assert.equal(automaticSettingsPending({...graph,linkedBrowse:true}),false);assert.equal(automaticSettingsPending({...graph,collaboration:{kind:'author'}}),false);
});

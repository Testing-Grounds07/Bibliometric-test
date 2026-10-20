import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createStartupNavigation,automaticNavigationAllowed} from './startup-navigation.mjs';
import {inheritEvidenceContext} from './evidence-provenance.mjs';
import {analysisErrorMessage} from './analysis-errors.mjs';
import {completeCouplingDiagnostics} from './coupling-install.mjs';

const graph=()=>({sourceCorpusId:'current-corpus',externalCorpus:true,nodes:[{id:'source',cluster:1,references:['ref']}],links:[],clustering:{algorithm:'leiden'},order:2,networkModel:'pairwise',evidenceProvenance:{evidenceId:'correct-pin'},resolution:.02,minimumShared:1,minimumCosine:0});
const source=readFileSync('scripts/evidence-explorer.mjs','utf8'),build=source.slice(source.indexOf('function buildCoupling('),source.indexOf('function settingsComparison('));

function fixture(){
 const policy=createStartupNavigation('/conservative-atlas/index.html');policy.saved();let visible=graph(),algorithm='leiden',rejectSolver=false,releaseSolver,draws=0,automaticDraws=0,accepted;const timers=[],jobs=[];
 const progress={textContent:''},window={ATLAS_STARTUP_NAVIGATION:policy,atlasSharedCanvas:{graph:()=>visible,currentCorpus:()=>({graph:visible})},atlasEvidenceContext:()=>({graph:visible}),ATLAS_COMMUNITIES:{start:()=>({promise:rejectSolver?Promise.reject(Error('Solver failed')):new Promise(resolve=>releaseSolver=resolve)})}};
 const schedulerBody=readFileSync('scripts/canvas-reliability.mjs','utf8').match(/function scheduleQuickCheck\(\) \{[\s\S]*?\r?\n\}/)[0];
 const context={window,context:{graph:visible},contextKey:'same-study',mode:'coupling',focusCluster:null,document:{getElementById:id=>({value:id==='clusteringMethod'?algorithm:'pairwise'})},dialog:{querySelector:()=>progress},dataset:{sourceCorpusId:'current-corpus'},draft:{},generation:0,communityJob:null,settingsAudit:null,coupling:null,couplingBaseline:null,couplingRoles:null,couplingStability:null,inheritEvidenceContext,analysisErrorMessage,completeCouplingDiagnostics,cancelCanvasReliability(){},connectionRoles:()=>({}),scopeArticles:()=>[],retainCouplingBaseline:()=>null,reuseCouplingBaseline:()=>null,runWorker(request,callback){context.generation++;accepted=callback;},stopWorker(){context.generation++;},loadCommunities:()=>Promise.resolve(),selectTab(){},shell(){visible=context.coupling;draws++;if(automaticNavigationAllowed(visible))automaticDraws++;const scheduler={window,activeGraph:visible,records:new WeakMap([[visible,{}]]),autoTimer:null,automaticNavigationAllowed,settingsValidationState:()=> 'idle',algorithm:current=>current.clustering.algorithm,pendingMethod:()=>false,clearTimeout(){},setTimeout:callback=>{timers.push(callback);return timers.length;},run:samples=>jobs.push({samples,graph:visible,sourceCorpusId:visible.sourceCorpusId})};vm.runInNewContext(schedulerBody+';scheduleQuickCheck();',scheduler);}};
 vm.createContext(context);vm.runInContext(build,context);const method=source.split('window.ATLAS_EVIDENCE = {')[1].match(/ restoreCoupling\(([^\r\n]*?)\)\s*\{([^\r\n]+)\},/);context.restoreCoupling=vm.runInContext('(function('+method[1]+'){'+method[2]+'})',context);
 return {context,window,policy,progress,timers,jobs,settings:{minimumShared:1,minimumCosine:0,resolution:.02},setAlgorithm:value=>algorithm=value,fail:()=>rejectSolver=true,complete:next=>accepted({graph:next,roles:{}}),release:next=>releaseSolver(next),visible:()=>visible,counts:()=>({draws,automaticDraws})};
}

test('saved coupling restore remains zero-auto, but a new verified user build is automatically eligible only on the installed current graph',async()=>{
 const previous=globalThis.window;
 try{const value=fixture();globalThis.window=value.window;value.context.restoreCoupling(graph());assert.equal(value.policy.state().phase,'completed');assert.equal(value.counts().automaticDraws,0);assert.equal(value.timers.length,0);value.context.buildCoupling(value.settings);assert.equal(value.policy.state().phase,'completed','pending build must not release completed browsing');await value.complete(graph());assert.equal(value.policy.state().phase,'study');assert.equal(value.visible().evidenceProvenance.evidenceId,'correct-pin');assert.equal(value.counts().automaticDraws,1);assert(automaticNavigationAllowed(value.visible()));assert.equal(value.timers.length,1);value.timers[0]();assert.equal(value.jobs.length,1);assert.equal(value.jobs[0].samples,10);assert.equal(value.jobs[0].sourceCorpusId,'current-corpus');assert.equal(value.jobs[0].graph,value.visible());value.policy.saved();value.context.restoreCoupling(graph());assert.equal(value.counts().automaticDraws,1,'completed restoration still does not compute');assert.equal(value.timers.length,1);}finally{globalThis.window=previous;}
});

test('failed, stale and wrong-corpus fresh builds never release completed navigation or install an unverified graph',async()=>{
 const previous=globalThis.window;
 try{for(const mode of['wrong-corpus','failed','stale']){const value=fixture();globalThis.window=value.window;value.context.restoreCoupling(graph());const prior=value.visible();if(mode!=='wrong-corpus')value.setAlgorithm('infomap');if(mode==='failed')value.fail();value.context.buildCoupling(value.settings);const pending=value.complete(mode==='wrong-corpus'?{...graph(),sourceCorpusId:'wrong-corpus'}:graph());if(mode==='stale'){await new Promise(resolve=>setImmediate(resolve));value.context.generation++;value.release(graph());}await pending;assert.equal(value.policy.state().phase,'completed',mode);assert.equal(value.visible(),prior,mode);assert.equal(value.counts().automaticDraws,0,mode);}}
 finally{globalThis.window=previous;}
});

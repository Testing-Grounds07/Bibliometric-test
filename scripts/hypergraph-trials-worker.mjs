import {analysisErrorMessage} from './analysis-errors.mjs';
import {buildHyperedges} from './community-methods.mjs';
import {runHypergraphTrial, periodCategories, TRIAL_VERSION} from './hypergraph-trials.mjs';
import {bootstrapWeights, clusterRecovery, summarizeRecovery} from './evidence-metrics.mjs';
import {resampleHyperedges} from './network-reliability.mjs';

self.onmessage = event => {
 try {
  const {graph,bundles,articles,options,action,result}=event.data;
  const samples=event.data.samples??10;
  if(action==='check'&&![10,50].includes(samples))throw new Error('Choose 10 or 50 resamples.');
  const progress=text=>self.postMessage({progress:text});
  progress('Reconstructing complete supported combinations…');
  const allEdges=buildHyperedges(graph,bundles),edges=options.family==='categorical'?periodCategories(allEdges,articles):allEdges;
  if(action!=='check'){
   const fitted=runHypergraphTrial(edges,options,progress);
   self.postMessage({result:fitted,coverage:{allCombinations:allEdges.length,includedCombinations:edges.length},edges});return;
  }
  if(result.version!==TRIAL_VERSION)throw new Error('The trial engine has changed. Run this trial again before checking evidence.');
  const sourceIds=Object.keys(articles),outcomes=[];let nonconverged=0;
  for(let sample=0;sample<samples;sample++){
   progress('Evidence check '+(sample+1)+'/'+samples+' · '+options.family);
   const retained=resampleHyperedges(edges,bootstrapWeights(sourceIds,sample+2000),graph.minimumSupport||5);
   if(!retained.length){outcomes.push(clusterRecovery(result.memberships,{}));continue;}
   const fitted=runHypergraphTrial(retained,{...result.settings,starts:1,seed:42+sample});
   if(!fitted.converged)nonconverged++;
   outcomes.push(clusterRecovery(result.memberships,fitted.memberships));
  }
  self.postMessage({audit:{version:TRIAL_VERSION,algorithm:'trial',samples,preliminary:samples<50,clusters:summarizeRecovery(outcomes),nonconverged,method:result.definition.name,restarts:1,resamplingUnit:'citing source article, conditional on discovered combinations',settings:result.settings,limitations:'Conditional source bootstraps; support and source-normalized weights rebuilt on discovered combinations. One search start per resample; optimization variability is included. Fixed k may be clipped to retained nodes and spectral k may increase to retain disconnected components. Period categories stay fixed. Not thematic validation or a settings recommendation.'}});
 }catch(error){self.postMessage({error:analysisErrorMessage(error)});}
};

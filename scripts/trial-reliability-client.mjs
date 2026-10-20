import {analysisErrorMessage} from './analysis-errors.mjs';
export function startTrialReliability(graph, samples, progress) {
 const worker = new Worker('hypergraph-trials-worker.js?v=coupling-errors-2');
 let rejectJob;
 const promise = new Promise((resolve, reject) => {
  rejectJob = reject;
  worker.onmessage = event => {
   const message = event.data;
   if (message.progress) { progress(message.progress); return; }
   worker.terminate();
   if (Object.hasOwn(message, 'error')) reject(new Error(analysisErrorMessage(message.error))); else resolve(message.audit);
  };
  worker.onerror = event => { worker.terminate(); reject(new Error(analysisErrorMessage(event))); };
  worker.postMessage({action: 'check', graph, bundles: graph.bundles, articles: window.ATLAS_DATA.articles, options: graph.trial.result.settings, result: graph.trial.result, samples});
 });
 return {promise, cancel() { worker.terminate(); rejectJob(new Error('Reliability check cancelled.')); }};
}

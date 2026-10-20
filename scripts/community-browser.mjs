import Infomap from '@mapequation/infomap';
import {fitBlockModel} from './blockmodel-client.mjs';
import {fitIncidenceLeiden} from './incidence-client.mjs';
import {INFOMAP_ARGS, infomapArgs, infomapInput, infomapResult, applyCommunityResult} from './community-methods.mjs';
import {analysisError} from './analysis-errors.mjs';

window.ATLAS_COMMUNITIES = {
 startSettings(graph, articleIds, action = 'tune', progress = () => {}) {
  if (window.BIBLIOMAP?.active) return window.BIBLIOMAP.stage(graph, action === 'sensitivity' ? 'sensitivity' : 'scan', {compareObjectives: action === 'objectives'}, progress);
  const worker = new Worker('method-settings-worker.js?v=coupling-errors-2');
  const controller = new AbortController();
  let engine, stopped = false, rejectJob;
  const cleanup = () => { stopped = true; controller.abort(); worker.terminate(); engine?.terminateAll(); };
  const promise = new Promise((resolve, reject) => {
   rejectJob = reject;
   worker.onmessage = async event => {
    const message = event.data;
    if (message.progress) { progress(message.progress); return; }
    if (Object.hasOwn(message, 'error')) { cleanup(); reject(analysisError(message.error)); return; }
    if (message.result) { cleanup(); resolve(message.result); return; }
    if (message.leiden) {
     try { const result = await fitIncidenceLeiden(message.leiden, message.settings, controller.signal); if (!stopped) worker.postMessage({partition: result}); }
     catch (error) { if (!stopped) { cleanup(); reject(error); } }
    }
    if (message.infomap) {
     try {
      const {ids, network} = infomapInput(message.infomap);
      let result = {memberships: {}};
      if (ids.length) {
       engine = new Infomap();
       result = infomapResult(await engine.runAsync({network, args: infomapArgs(message.settings)}), ids, {...message.infomap.clustering, ...message.settings, networkModel: message.infomap.networkModel});
       engine.terminateAll(); engine = null;
      }
      if (!stopped) worker.postMessage({partition: result});
     } catch (error) { if (!stopped) { cleanup(); reject(error); } }
    }
   };
   worker.onerror = event => { cleanup(); reject(analysisError(event)); };
   worker.postMessage({graph, articleIds, action});
  });
  return {promise: promise.catch(error => { throw analysisError(error); }), cancel() { cleanup(); rejectJob(new Error('Settings search cancelled')); }};
 },
 startReliability(graph, articleIds, samples, progress = () => {}, options = {}) {
  if (window.BIBLIOMAP?.active) return window.BIBLIOMAP.stage(graph, 'reliability', {samples, ...options}, progress);
  const worker = new Worker('reliability-worker.js?v=coupling-errors-2');
  let engine, rejectJob, stopped = false;
  const controller = new AbortController();
  const cleanup = () => { stopped = true; controller.abort(); worker.terminate(); engine?.terminateAll(); };
  const promise = new Promise((resolve, reject) => {
   rejectJob = reject;
   worker.onmessage = async event => {
    const message = event.data;
    if (message.progress) { progress(message.progress); return; }
    if (Object.hasOwn(message, 'error')) { cleanup(); reject(analysisError(message.error)); return; }
    if (message.result) { cleanup(); resolve(message.result); return; }
    if (message.leiden) {
     try { const result = await fitIncidenceLeiden(message.leiden, {resolution: graph.resolution, trials: 2}, controller.signal); if (!stopped) worker.postMessage({partition: result}); }
     catch (error) { if (!stopped) { cleanup(); reject(error); } }
    }
    if (message.sbm) {
     try {
      const result = await fitBlockModel(message.sbm, controller.signal, 2);
      const level = Math.min(graph.clustering.selectedLevel || 0, Math.max(0, result.hierarchy.length - 1));
      if (result.hierarchy[level]) result.memberships = result.hierarchy[level].memberships;
      if (!stopped) worker.postMessage({partition: result});
     } catch (error) { if (!stopped) { cleanup(); reject(error); } }
    }
    if (message.infomap) {
     try {
      const {ids, network} = infomapInput(message.infomap);
      let result = {memberships: {}};
      if (ids.length) {
       engine = new Infomap();
       const settings = {...message.infomap.clustering, networkModel: message.infomap.networkModel, trials: 2};
       const output = await engine.runAsync({network, args: infomapArgs(settings)});
       result = infomapResult(output, ids, settings); engine.terminateAll(); engine = null;
      }
      if (!stopped) worker.postMessage({partition: result});
     } catch (error) { if (!stopped) { cleanup(); reject(error); } }
    }
   };
   worker.onerror = event => { cleanup(); reject(analysisError(event)); };
   worker.postMessage({start: true, graph, articleIds, samples, options});
  });
  return {promise: promise.catch(error => { throw analysisError(error); }), cancel() { cleanup(); rejectJob(new Error('Reliability check cancelled')); }};
 },
 start(graph, algorithm, bundles, progress = () => {}, options = {}) {
  if (window.BIBLIOMAP?.active) return window.BIBLIOMAP.stage(graph, 'clustering', {algorithm, ...options}, progress);
  let cancel = () => {}, rejectJob;
  const promise = new Promise((resolve, reject) => {
   rejectJob = reject;
   if (options.networkModel === 'hypergraph' && !options.incidenceReady && ['leiden', 'infomap'].includes(algorithm)) {
    const worker = new Worker('community-worker.js?v=coupling-errors-2'); cancel = () => worker.terminate();
    worker.onmessage = event => {
     if (event.data.progress) { progress(event.data.progress); return; }
     worker.terminate();
     if (Object.hasOwn(event.data, 'error')) { reject(analysisError(event.data.error)); return; }
     if (event.data.incidence) {
      const job = window.ATLAS_COMMUNITIES.start(event.data.incidence, algorithm, [], progress, {...options, modelVersion: event.data.incidence.clustering.modelVersion, incidenceReady: true});
      cancel = () => job.cancel(); job.promise.then(resolve, reject);
     } else resolve(applyCommunityResult({...graph, networkModel: 'hypergraph'}, event.data.result, event.data.hyperedges));
    };
    worker.onerror = event => { worker.terminate(); reject(analysisError(event)); };
    worker.postMessage({graph, bundles, options: {...options, algorithm}});
   } else if (algorithm === 'leiden' && options.incidenceReady) {
    const controller = new AbortController(); cancel = () => controller.abort();
    progress('Leiden: optimizing bipartite CPM on whole-group incidence…');
    fitIncidenceLeiden(graph, options, controller.signal).then(result => resolve(applyCommunityResult(graph, result, graph.hyperedges))).catch(reject);
   } else if (algorithm === 'sbm') {
    const controller = new AbortController(); cancel = () => controller.abort();
    progress('Block model: fitting a nested degree-corrected hierarchy…');
    fitBlockModel(graph, controller.signal).then(result => { const level = Math.min(options.selectedLevel || 0, Math.max(0, result.hierarchy.length - 1)); if (result.hierarchy[level]) { result.memberships = result.hierarchy[level].memberships; result.selectedLevel = level; } resolve(applyCommunityResult(graph, result)); }).catch(reject);
   } else if (algorithm === 'infomap') {
    const {ids, network} = infomapInput(graph);
    if (!ids.length) { resolve(applyCommunityResult(graph, {memberships: {}, algorithm, label: 'Infomap', networkModel: graph.networkModel, modelVersion: options.modelVersion, quality: null, trials: 0, limitations: 'No eligible weighted links.'}, graph.hyperedges)); return; }
    progress('Infomap: ten trials of the two-level map equation…');
    const engine = new Infomap(); cancel = () => engine.terminateAll();
    engine.runAsync({network, args: infomapArgs(options)}).then(output => {
     const result = infomapResult(output, ids, options);
     if (graph.networkModel !== 'hypergraph' && (graph.method === 'coupling' || graph.canvasKind === 'coupling')) result.limitations = 'Uses cosine-weighted coupling edges, ten two-level map-equation trials, selected Markov time. CPM does not apply. Agreement is not thematic validation; run the separate method-specific reliability check to assess sensitivity.';
     resolve(applyCommunityResult(graph, result, graph.hyperedges));
    }).catch(reject).finally(() => engine.terminateAll());
   } else if (algorithm === 'hypergraph') {
    const worker = new Worker('community-worker.js?v=coupling-errors-2'); cancel = () => worker.terminate();
    worker.onmessage = event => {
     if (event.data.progress) { progress(event.data.progress); return; }
     worker.terminate();
     if (Object.hasOwn(event.data, 'error')) {reject(analysisError(event.data.error));return;}
     try{if(!event.data.result?.memberships)throw new Error('Direct hypergraph computation returned an invalid result. Retry the analysis.');resolve(applyCommunityResult(graph,event.data.result,event.data.hyperedges));}catch(error){reject(error);}
    };
    worker.onerror = event => { worker.terminate(); reject(analysisError(event)); };
    worker.postMessage({graph, bundles, options:{...options,algorithm}});
   } else reject(new Error('Unknown clustering method'));
  });
  return {promise: promise.catch(error => { throw analysisError(error); }), cancel: () => { cancel(); rejectJob(new Error('Clustering cancelled')); }};
 }
};

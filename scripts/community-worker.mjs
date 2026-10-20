import {buildHyperedges, hypergraphPartition} from './community-methods.mjs';
import {couplingHyperedges, COUPLING_HYPERGRAPH_METHOD} from './coupling-hypergraph.mjs';
import {HYPERGRAPH_MODEL_VERSION} from './hypergraph-network.mjs';
import {analysisErrorMessage} from './analysis-errors.mjs';
self.onmessage = event => {
 try {
  const {graph, bundles, options = {}} = event.data,algorithm=options.algorithm||'hypergraph';
  if(!['hypergraph','leiden','infomap'].includes(algorithm))throw new Error('Unknown community worker algorithm');
  self.postMessage({progress: 'Reconstructing exact supported combinations…'});
  const coupling = graph.method === 'coupling' || graph.canvasKind === 'coupling';
  const hyperedges = coupling ? couplingHyperedges(graph) : buildHyperedges(graph, bundles);
  if (['leiden','infomap'].includes(algorithm)) {
   if(options.networkModel!=='hypergraph')throw new Error('Incidence preparation requires the hypergraph network model');
   const configured = {...graph, networkModel: 'hypergraph', hyperedges, clustering: {algorithm, modelVersion: HYPERGRAPH_MODEL_VERSION}};
   self.postMessage({incidence: configured}); return;
  }
  const result = hypergraphPartition(graph, hyperedges, progress => self.postMessage({progress}), options);
  if (coupling) {
   result.method = COUPLING_HYPERGRAPH_METHOD + ' ' + result.method;
   result.limitations += ' Different references are not necessarily independent evidence. Pairwise lines can omit relationships used by whole reference groups. Run the separate method-specific reliability check to assess sensitivity.';
  }
  self.postMessage({result, hyperedges});
 } catch (error) { self.postMessage({error: analysisErrorMessage(error)}); }
};

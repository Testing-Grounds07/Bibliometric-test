import {analysisErrorMessage} from './analysis-errors.mjs';
import {prepareReliability} from './network-reliability.mjs';
import {isIncidenceModel} from './hypergraph-network.mjs';
let session, position;
function advance() {
 if (position === session.sampleCount) { self.postMessage({result: session.finish()}); return; }
 self.postMessage({progress: `Resample ${position + 1}/${session.sampleCount} · ${session.algorithm}`});
 const sample = session.sample(position);
 if (session.algorithm === 'infomap') self.postMessage({infomap: sample.graph});
 else if (session.algorithm === 'leiden' && isIncidenceModel(sample.graph)) self.postMessage({leiden: sample.graph});
 else if (session.algorithm === 'sbm') self.postMessage({sbm: sample.graph});
 else {
  session.record(session.partition(sample, message => self.postMessage({progress: `Resample ${position + 1}/${session.sampleCount} · ${message}`})));
  position++; setTimeout(advanceSafely, 0);
 }
}
function advanceSafely() { try { advance(); } catch (error) { self.postMessage({error: analysisErrorMessage(error)}); } }
self.onmessage = event => {
 try {
  if (event.data.start) { session = prepareReliability(event.data.graph, event.data.articleIds, event.data.samples, event.data.options); position = 0; }
  else { session.record(event.data.partition); position++; }
  advanceSafely();
 } catch (error) { self.postMessage({error: analysisErrorMessage(error)}); }
};

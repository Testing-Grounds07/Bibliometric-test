import {analysisErrorMessage} from './analysis-errors.mjs';
import {runSettingsSearch, evidenceSensitivity} from './method-settings.mjs';
let pending;
const infomap = (graph, settings) => new Promise((resolve, reject) => { pending = {resolve, reject}; self.postMessage({[settings.algorithm === 'leiden' ? 'leiden' : 'infomap']: graph, settings}); });
self.onmessage = async event => {
 if (event.data.partition) { pending?.resolve(event.data.partition); pending = null; return; }
 if (event.data.failure) { pending?.reject(new Error(event.data.failure)); pending = null; return; }
 try {
  const {graph, articleIds, action} = event.data;
  const execute = action === 'sensitivity' ? evidenceSensitivity : runSettingsSearch;
  const result = await execute(graph, articleIds, infomap, progress => self.postMessage({progress}), {compareObjectives: action === 'objectives'});
  self.postMessage({result});
 } catch (error) { self.postMessage({error: analysisErrorMessage(error)}); }
};

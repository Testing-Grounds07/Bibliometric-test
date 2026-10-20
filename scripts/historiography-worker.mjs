import {analysisErrorMessage} from './analysis-errors.mjs';
import {buildHistoriography} from './historiography.mjs';
self.onmessage = event => {
 try { self.postMessage({result: buildHistoriography(event.data.articles, event.data.options, progress => self.postMessage({progress}))}); }
 catch (error) { self.postMessage({error: analysisErrorMessage(error)}); }
};

import {runResearchCheck} from './research-check-methods.mjs';

// One explicit request per worker. The caller terminates the worker on cancellation
// or at 180 seconds and saves only the final {result}, never progress or partial fits.
self.onmessage = async event => {
 try {const result = await runResearchCheck(event.data, progress => self.postMessage({progress})); self.postMessage({result});}
 catch (error) {self.postMessage({error: error instanceof Error ? error.message : 'Research check failed.'});}
};

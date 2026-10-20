import {analysisErrorMessage} from './analysis-errors.mjs';
import {buildSemanticGraph, semanticSensitivity} from './semantic-network.mjs';
self.onmessage = async event => {
 const {action, works, settings, cache, graph, context, supplementalText} = event.data;
 try {const progress = message => self.postMessage({progress: message}), result = action === 'sensitivity' ? await semanticSensitivity(works, graph, cache, {...context,supplementalText}, progress) : await buildSemanticGraph(works, settings, cache, context, progress); if (action !== 'sensitivity') result.semantic.supplementalText = supplementalText; self.postMessage({result});} catch (problem) {self.postMessage({error: analysisErrorMessage(problem)});}
};

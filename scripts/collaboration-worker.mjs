import {analysisErrorMessage} from './analysis-errors.mjs';
import {buildCollaborationGraph,collaborationSensitivity} from './collaboration-networks.mjs';
self.onmessage=async event=>{const {works,settings,graph,context,action}=event.data;try{const progress=message=>self.postMessage({progress:message}),result=action==='sensitivity'?await collaborationSensitivity(works,graph,context,progress):await buildCollaborationGraph(works,settings,context,progress);self.postMessage({result});}catch(problem){self.postMessage({error:analysisErrorMessage(problem)});}};

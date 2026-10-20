import {analysisErrorMessage} from './analysis-errors.mjs';
import {buildTemporalSeries} from './temporal-series.mjs';
import {publicationBursts} from './publication-bursts.mjs';
self.onmessage=async event=>{try{const {stage,graph,works,settings}=event.data,progress=message=>self.postMessage({progress:message}),result=stage==='temporal-series'?await buildTemporalSeries(graph,works,settings,progress):stage==='publication-bursts'?await publicationBursts(works,graph,settings,progress):null;if(!result)throw Error('Unknown publication-time operation.');self.postMessage({result});}catch(problem){self.postMessage({error:analysisErrorMessage(problem)});}};

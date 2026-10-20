import {parentPort,workerData} from 'node:worker_threads';
import {executeStage} from './stages.mjs';
import {FileArtifacts} from './artifacts.mjs';

const files=new FileArtifacts(workerData.storageRoot),controller=new AbortController();
let sequence=0;const pending=new Map();
const call=(kind,value)=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});parentPort.postMessage({kind,value,id});});
parentPort.on('message',message=>{if(message.cancel)controller.abort();else if(pending.has(message.id)){const request=pending.get(message.id);pending.delete(message.id);message.error?request.reject(new Error(message.error)):request.resolve(message.value);}});
try{
 const input=await files.get(workerData.input.checksum),context={files,scope:workerData.job.scope,signal:controller.signal,checkpoint:workerData.job.checkpoint?JSON.parse(workerData.job.checkpoint):null,progress:value=>parentPort.postMessage({progress:typeof value==='string'?value:JSON.stringify(value)}),saveCheckpoint:value=>call('checkpoint',value),rateLimit:()=>call('rate',null),metadataGet:(ids,epoch)=>call('metadata-get',{ids,epoch}),metadataPut:(work,epoch)=>call('metadata-put',{work,epoch})};
 const result=await executeStage(workerData.job.stage,input,workerData.settings,context);controller.signal.throwIfAborted();parentPort.postMessage({result});
}catch(problem){const status=problem.status||(/^(Coupling candidate universe|Higher-order mining|This scope|Choose |No eligible|No resampling|Network exceeds|More than |Incomplete |Invalid )/.test(problem.message)?422:undefined);parentPort.postMessage({error:{message:problem.message,status,transient:problem.transient||false,retryAfter:problem.retryAfter||0}});}

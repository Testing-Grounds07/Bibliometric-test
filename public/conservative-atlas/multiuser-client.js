(() => {
 'use strict';
 const originalFetch=window.fetch.bind(window);
 const ready=originalFetch('/auth/session').then(async response=>{const value=await response.json();if(!response.ok)throw Error(value.error);return value;});
 window.fetch=async(input,options={})=>{
  const url=new URL(typeof input==='string'?input:input.url,location.href),method=(options.method||'GET').toUpperCase();
  if(url.origin===location.origin&&!['GET','HEAD'].includes(method)){const session=await ready;options={...options,headers:{...options.headers,'X-CSRF-Token':session.csrf}};}
  return originalFetch(input,options);
 };
 async function api(route,method='GET',value){const response=await window.fetch('/conservative-atlas/workspace-api'+route,{method,headers:value?{'Content-Type':'application/json'}:{},body:value?JSON.stringify(value):undefined});const result=await response.json();if(!response.ok){if(response.status===401)window.dispatchEvent(new CustomEvent('bibliomap:session-expired'));throw Error(result.error||'Request failed.');}return result;}
 function stage(graph,kind,settings={},progress=()=>{},force=false){
  const controller=new AbortController();let subscription;
  const promise=(async()=>{
   if(remoteReadOnly())throw Error('This project is view-only. Open an existing result or ask an editor to run the analysis.');
   const current=graph||window.atlasSharedCanvas?.graph();if(!current?._resultId)throw Error('Open a completed project analysis first.');
   const projectId=current._projectId,selectionVersion=window.BIBLIOMAP.selectionVersion||0;const created=await api('/projects/'+projectId+'/computations','POST',{resultId:current._resultId,stage:kind,settings,force});subscription=created.id;
   const finished=await wait(created.id,progress,controller.signal,projectId),result=await api('/projects/'+projectId+'/results/'+finished.resultId);
   if(controller.signal.aborted)throw Error('Request cancelled.');
   if(selectionVersion!==(window.BIBLIOMAP.selectionVersion||0)||window.atlasSharedCanvas?.graph()?._projectId!==projectId)throw Error('Selection changed. The completed result remains in analysis history.');
   if(['clustering','coupling','history','temporal','semantic-network','collaboration-network'].includes(kind))return result.graph;
   const visible=window.atlasSharedCanvas?.graph();
   if(visible&&current._projectId===visible._projectId&&(current._analysisKey&&current._analysisKey===visible._analysisKey||current._resultId===visible._resultId)){visible._attachments=[...new Set([...(visible._attachments||[]),result.id])];for(const key of ['reliability','sourceReliability','settingsSearch','evidenceSensitivity','temporalSeries','burstReport','collaborationSensitivity'])if(result.graph[key])visible[key]=result.graph[key];window.dispatchEvent(new CustomEvent('bibliomap:derived',{detail:{...result,source:visible}}));}
   if(visible&&current._projectId===visible._projectId&&(current._analysisKey&&current._analysisKey===visible._analysisKey||current._resultId===visible._resultId)&&result.graph.scienceAudit)visible.scienceAudit={...visible.scienceAudit,...result.graph.scienceAudit};
   return result.value;
  })();
  return {promise,cancel(){controller.abort();if(subscription)api('/jobs/'+subscription+'/cancel','POST',{}).catch(()=>{});}};
 }
 async function wait(id,progress=()=>{},signal,projectId){
  while(true){if(signal?.aborted){await api('/jobs/'+id+'/cancel','POST',{});throw Error('Request cancelled.');}const result=await api('/jobs/'+id);progress(result.message||result.status);window.dispatchEvent(new CustomEvent('bibliomap:job-status',{detail:{...result,projectId}}));if(result.status==='succeeded')return result;if(['failed','cancelled'].includes(result.status))throw Error(result.message||'Computation did not complete.');await new Promise(resolve=>setTimeout(resolve,800));}
 }
 window.BIBLIOMAP={active:true,ready,api,wait,stage};
 function remoteReadOnly(){return window.BIBLIOMAP.canCompute===false;}
 window.addEventListener('bibliomap:session-expired',()=>{document.getElementById('status').textContent='Your session expired. Sign in again to continue.';});
})();

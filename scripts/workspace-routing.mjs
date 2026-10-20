import {analysisErrorMessage} from './analysis-errors.mjs';
import {parseWorkspaceRoute,workspacePath} from './workspace-route-path.mjs';
import {startupNavigation,baselineLocation} from './startup-navigation.mjs';

export function isViewReturn(target,parent){if(!parent)return false;const url=new URL(target,'http://localhost');return url.pathname+url.search===parent;}

export function mapSignature(snapshot){
 const graph=snapshot.graph;
 return JSON.stringify({kind:graph.canvasKind,collaboration:graph.collaboration||null,semantic:graph.semantic||null,historySettings:graph.historiography?.settings,historyView:snapshot.historyView,networkModel:graph.networkModel,order:graph.order,maximum:graph.maximumOrder,threshold:graph.threshold,support:graph.minimumSupport,resolution:graph.resolution,clustering:graph.clustering,nodes:graph.nodes.map(node=>[node.id,node.cluster]),links:graph.links.map(link=>[link.source,link.target,link.count,link.strength]),controls:Object.fromEntries(Object.entries(snapshot.controls).map(([key,value])=>[key,value.value])),hidden:[...(snapshot.hiddenClusters||[])],minimumClusterSize:snapshot.minimumClusterSize,hideUnlinked:snapshot.hideUnlinked},(key,value)=>value instanceof Set?[...value]:value);
}

if(typeof window!=='undefined'){
 const projects=window.ATLAS_PROJECTS,canvas=window.atlasSharedCanvas;
 let context=null,signature=null,latestView=null,applying=false,starting=true,navigation=Promise.resolve(),modalParent=null,returnTo=null;
 const make=(tag,text='')=>{const element=document.createElement(tag);element.textContent=text;return element;};
 const projectPanel=document.getElementById('projectsPanel'),status=make('p');status.className='workspace-route-status';status.setAttribute('role','status');projectPanel.append(status);
 const currentSignature=()=>mapSignature(canvas.captureProject());
 function updateSkipLink(){const link=document.querySelector('.skip-link');if(link)link.href=location.pathname+location.search+(window.ATLAS_HISTORY?.active()?'#historyNetwork':'#network');}
 function write(path,replace=false,modal=false){if(location.pathname+location.search===path)return;if(modal&&!replace)modalParent=location.pathname+location.search;window.history[replace?'replaceState':'pushState']({atlas:true,atlasModal:modal},'',path);updateSkipLink();}
 function viewPath(view=latestView){const base=context&&signature===currentSignature()?context:{live:true,projectId:projects.activeProject()?.id};return workspacePath({...base,cluster:view?.cluster,source:view?.source,target:view?.target});}
 function recordMap(detail){context=detail;signature=currentSignature();if(!applying&&!starting){write(workspacePath(context));if(latestView)write(viewPath(),false,true);}}
 window.addEventListener('atlas:project-opened',event=>{if(applying||starting)return;context=null;signature=null;write(workspacePath(event.detail));});
 window.addEventListener('atlas:map-opened',event=>recordMap(event.detail));
 window.addEventListener('atlas:map-saved',event=>recordMap(event.detail));
 window.addEventListener('atlas:exploded-open',event=>{latestView=event.detail;if(!applying&&!starting)write(viewPath(),false,true);});
 window.addEventListener('atlas:exploded-change',event=>{latestView=event.detail;if(!applying&&(latestView.cluster||latestView.source))write(viewPath(),true,true);});
 window.addEventListener('atlas:exploded-close',()=>{latestView=null;if(applying||starting)return;const route=parseWorkspaceRoute(location.href);if(route?.cluster||route?.source){if(window.history.state?.atlasModal){returnTo=modalParent;modalParent=null;window.history.back();}else write(workspacePath({projectId:route.projectId,mapId:route.mapId,live:route.live}),true);}});
 async function applyRoute(target){
  updateSkipLink();
  const startup=startupNavigation(),intent=startup?.begin();
  applying=true;status.textContent='Opening linked view…';
  try{
   const route=parseWorkspaceRoute(target);await window.ATLAS_EXPLODED?.close();latestView=null;
   if(!route){if(!baselineLocation(target))throw Error('This workspace link is not recognized. Choose a saved study or explicitly return to the baseline.');context=null;signature=null;projects.restoreBaseline();(window.atlasWorkspaceShell.showAutomatic||window.atlasWorkspaceShell.show)(null);status.textContent='';return;}
   if(route.live){
    context=null;signature=null;
    if(route.projectId&&projects.activeProject()?.id!==route.projectId){await projects.openProject(route.projectId);startup?.waiting(intent);(window.atlasWorkspaceShell.showAutomatic||window.atlasWorkspaceShell.show)('projects');status.textContent='Live workspace path. Open a saved map or build a search map to restore an analysis; navigation does not save it.';return;}
    (window.atlasWorkspaceShell.showAutomatic||window.atlasWorkspaceShell.show)(null);
    if(route.cluster)canvas.openClusterCombinations(route.cluster);
    else if(route.source)canvas.openConnectionCombinations(route.source,route.target);
    startup?.completed(intent);status.textContent='';return;
   }
   if(!route.projectId){context=null;signature=null;startup?.waiting(intent);(window.atlasWorkspaceShell.showAutomatic||window.atlasWorkspaceShell.show)('projects');status.textContent='Choose a project to open its searches and saved maps.';return;}
   if(!context||context.projectId!==route.projectId||context.mapId!==route.mapId||signature!==currentSignature()){
    const project=await projects.openProject(route.projectId);
    if(route.mapId){if(!project.analyses.some(analysis=>analysis.id===route.mapId))throw Error('This saved map does not belong to the project in the link.');await projects.openSnapshot(route.mapId);context={projectId:route.projectId,mapId:route.mapId};signature=currentSignature();}
    else{context=null;signature=null;}
   }
   if(!route.mapId){startup?.waiting(intent);(window.atlasWorkspaceShell.showAutomatic||window.atlasWorkspaceShell.show)('projects');status.textContent='Project opened.';return;}
   (window.atlasWorkspaceShell.showAutomatic||window.atlasWorkspaceShell.show)(null);
   if(route.cluster){if(!canvas.graph().nodes.some(node=>String(node.cluster)===route.cluster))throw Error('This cluster is not in the saved map.');canvas.openClusterCombinations(route.cluster,{initialSize:route.size,initialCombination:route.combination});}
   else if(route.source)canvas.openConnectionCombinations(route.source,route.target,{initialSize:route.size,initialCombination:route.combination});
   startup?.completed(intent);status.textContent='Saved view restored.';
  }catch(error){startup?.failed(intent);status.textContent='Could not open this link: '+analysisErrorMessage(error);(window.atlasWorkspaceShell.showAutomatic||window.atlasWorkspaceShell.show)('projects');}
  finally{applying=false;}
 }
 function followLocation(){const target=location.href;if(isViewReturn(target,returnTo)){returnTo=null;updateSkipLink();return Promise.resolve();}if(window.ATLAS_EXPLODED&&isViewReturn(target,modalParent)){modalParent=null;navigation=navigation.catch(()=>{}).then(async()=>{applying=true;try{await window.ATLAS_EXPLODED?.close();latestView=null;updateSkipLink();}finally{applying=false;}});return navigation;}returnTo=null;navigation=navigation.catch(()=>{}).then(()=>applyRoute(target));return navigation;}
 window.addEventListener('popstate',followLocation);
 document.getElementById('tool-projects').addEventListener('click',()=>{if(!applying&&document.getElementById('tool-projects').getAttribute('aria-expanded')==='true'&&!context)write(workspacePath({projectId:projects.activeProject()?.id}));});
 updateSkipLink();projects.ready.then(()=>{starting=false;if(parseWorkspaceRoute(location.href)||!baselineLocation(location.href))followLocation();}).catch(error=>{starting=false;if(!baselineLocation(location.href)){const startup=startupNavigation(),intent=startup?.begin();startup?.failed(intent);}status.textContent=analysisErrorMessage(error);});
 window.ATLAS_ROUTES={openProject:projectId=>{write(workspacePath({projectId}));return followLocation();}};
}

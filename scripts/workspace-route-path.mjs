export const WORKSPACE_BASE='/conservative-atlas/';
const uuid='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const routePattern=new RegExp('^'+WORKSPACE_BASE+'(?:projects(?:/('+uuid+')(?:/(?:maps/('+uuid+')|(map))(?:/(?:clusters/([1-9][0-9]*)|connections/([^/]+)/([^/]+))/combinations)?)?)?|(map)(?:/(?:clusters/([1-9][0-9]*)|connections/([^/]+)/([^/]+))/combinations)?)/?$');
export function parseWorkspaceRoute(input){
 const url=new URL(input,'http://localhost'),match=routePattern.exec(url.pathname);
 if(!match)return null;
 try{
  const result={projectId:match[1]||null,mapId:match[2]||null};
  if(match[3]||match[7])result.live=true;
  if(match[4]||match[8])result.cluster=match[4]||match[8];
  if(match[5]||match[9]){result.source=decodeURIComponent(match[5]||match[9]);result.target=decodeURIComponent(match[6]||match[10]);if([result.source,result.target].some(id=>id.length>300||/[\u0000-\u001f]/.test(id)))return null;}
  const size=url.searchParams.get('size');if(size&&size!=='all'&&(!/^\d+$/.test(size)||Number(size)<3||Number(size)>10000))return null;
  result.size=size||null;result.combination=url.searchParams.get('combination')?.slice(0,3000)||null;
  return result;
 }catch{return null;}
}
export function workspacePath({projectId,mapId,cluster,source,target,size,combination,live=false}={}){
 if(projectId&&!new RegExp('^'+uuid+'$').test(projectId)||mapId&&(!projectId||!new RegExp('^'+uuid+'$').test(mapId)))throw Error('A valid project and saved map are required.');
 let path=WORKSPACE_BASE+(live&&!projectId?'map':'projects'+(projectId?'/'+projectId:'')+(mapId?'/maps/'+mapId:live?'/map':''));
 if(cluster){if(!mapId&&!live||!/^\d+$/.test(String(cluster))||Number(cluster)<1)throw Error('A map and valid cluster are required.');path+='/clusters/'+cluster+'/combinations';}
 else if(source&&target){if(!mapId&&!live)throw Error('A map is required.');path+='/connections/'+encodeURIComponent(source)+'/'+encodeURIComponent(target)+'/combinations';}
 const query=new URLSearchParams();if(size)query.set('size',size);if(combination)query.set('combination',combination);
 return path+(query.size?'?'+query:'');
}

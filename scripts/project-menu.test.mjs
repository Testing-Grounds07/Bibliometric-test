import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('public/conservative-atlas/workspace-projects.js','utf8');
class Node {
 constructor(tag,text=''){this.tagName=tag.toUpperCase();this.textContent=text;this.children=[];this.attrs={};this.hidden=false;this.open=false;this.value='';this.classList={add:()=>{}};this.listeners={};}
 append(...nodes){for(const node of nodes){if(node.parentElement){const at=node.parentElement.children.indexOf(node);if(at>=0)node.parentElement.children.splice(at,1);}node.parentElement=this;this.children.push(node);}}
 prepend(node){this.append(node);this.children.unshift(this.children.pop());}
 replaceChildren(...nodes){this.children=[];this.append(...nodes);}
 setAttribute(name,value){this.attrs[name]=value;}
 addEventListener(name,fn){this.listeners[name]=fn;}
 focus(){this.focused=true;}
 click(){return this.onclick?.();}
}
const all=root=>[root,...root.children.flatMap(all)];
async function fixture(){
 const panel=new Node('div'),analysis=new Node('div'),roots=[panel,analysis],requests=[],events=[],project={id:'12345678-1234-1234-1234-123456789abc',name:'Leadership research'},findings=Array.from({length:13},(_,i)=>({id:'map-'+i,name:'Map '+i,created_at:'2026-10-20',parameters:{workspaceVersion:1},findings:'Complete retained findings '+i+' '.repeat(200)+'End of notes'}));let pendingJob,deferred;const otherProject={id:'bbbbbbbb-1234-1234-1234-123456789abc',name:'Other project'};
 for(const id of['clusteringMethod','networkModel','workspace-coupling']){const node=new Node('select');node.id=id;node.value='leiden';roots.push(node);}
 const fetch=async(url,options={})=>{requests.push({url,method:options.method||'GET',body:options.body&&JSON.parse(options.body)});if(deferred&&deferred.url===url&&deferred.method===(options.method||'GET')){const next=deferred;deferred=null;return next.promise;}let result;
  if(url==='workspace-api/projects'&&options.method==='POST'){project.name=JSON.parse(options.body).name;result={...project};}
  else if(url==='workspace-api/projects')result={projects:[project,otherProject]};
  else if(url==='workspace-api/projects/'+project.id&&options.method==='PATCH'){project.name=JSON.parse(options.body).name;result={...project};}
  else if(url==='workspace-api/projects/'+project.id)result={project:{...project},searches:[{id:'search-a',name:'Search A',query:{retrieved:1},created_at:'2026-10-20',result_count:1}],analyses:findings};
  else if(url==='workspace-api/projects/'+otherProject.id)result={project:{...otherProject},searches:[],analyses:[]};
  else if(url==='workspace-api/search'){result={id:'running-search'};}
  else if(url==='workspace-api/jobs/running-search'){return new Promise(resolve=>pendingJob=()=>resolve(new Response(JSON.stringify({status:'cancelled',retrieved:0,pages:0}),{status:200})));}
  else if(url.endsWith('/cancel'))result={};else throw Error('Unexpected request: '+url);
  return new Response(JSON.stringify(result),{status:200});};
 const document={createElement:tag=>new Node(tag),createTextNode:text=>new Node('#text',text),getElementById:id=>roots.flatMap(all).find(n=>n.id===id),querySelector:()=>analysis};
 const window={atlasWorkspaceShell:{addTool:()=>panel},atlasSharedCanvas:{captureProject:()=>({graph:{nodes:[],links:[]}})},dispatchEvent:event=>events.push(event)};
 const context={window,document,fetch,structuredClone,TextEncoder,URL,Set,Option:class extends Node{constructor(text,value){super('option',text);this.value=value;}},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},localStorage:{getItem:()=>null,setItem(){}},location:{pathname:'/conservative-atlas/projects'},setTimeout};
 vm.runInNewContext(source,context);await window.ATLAS_PROJECTS.ready;
 return{panel,window,project,otherProject,findings,requests,events,defer:(url,method='GET')=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});deferred={url,method,promise};return{resolve:value=>resolve(new Response(JSON.stringify(value),{status:200})),reject};},all:()=>all(panel),byId:id=>document.getElementById(id),button:label=>all(panel).find(n=>n.tagName==='BUTTON'&&(n.attrs['aria-label']===label||n.textContent===label)),finishJob:()=>pendingJob?.()};
}

test('compact Projects keeps the selector first, maps open, counted disclosures and forms closed',async()=>{
 const f=await fixture(),before=JSON.stringify(f.findings);await f.window.ATLAS_PROJECTS.openProject(f.project.id);
 const details=f.panel.children.filter(n=>n.tagName==='DETAILS');assert.deepEqual(details.map(n=>n.id),['projectSavedFindings','projectResearchReports','projectSearchHistory','projectSaveFinding','projectNewSearch','projectOriginalStudy']);assert.equal(details[0].open,true);assert(details.slice(1).every(n=>!n.open));assert.equal(f.byId('projectNameEditor').hidden,true);
 assert.equal(f.byId('projectSavedFindings').children[0].children[1].textContent,'13');assert.equal(f.byId('projectSearchHistory').children[0].children[1].textContent,'1');assert.equal(all(details[0]).filter(n=>n.tagName==='BUTTON').length,13);
 const notes=all(details[0]).filter(n=>n.className==='project-finding-notes');assert.equal(notes.length,13);assert(notes.every(n=>!n.open&&n.children[1].textContent.endsWith('End of notes')));assert.equal(JSON.stringify(f.findings),before);
 assert(f.requests.every(r=>r.method==='GET'));for(const detail of details)assert(!all(detail.children[0]).some(n=>n.tagName==='BUTTON'));
});

test('inline New/Rename editor performs only explicit actions and cancel or Escape restores compact state',async()=>{
 const f=await fixture(),newButton=f.button('New project'),rename=f.button('Rename project'),editor=f.byId('projectNameEditor'),input=all(editor).find(n=>n.attrs['aria-label']==='Project name');
 await newButton.click();assert(!editor.hidden);assert.equal(newButton.attrs['aria-expanded'],'true');assert.equal(input.value,'');assert.equal(f.requests.filter(r=>r.method!=='GET').length,0);input.value='New bounded project';await f.button('Create project').click();assert(editor.hidden);assert.equal(f.project.name,'New bounded project');assert.equal(f.requests.filter(r=>r.method==='POST').length,1);
 await rename.click();assert.equal(input.value,'New bounded project');input.value='Renamed project';await f.button('Save name').click();assert(editor.hidden);assert.equal(f.project.name,'Renamed project');assert.equal(f.requests.filter(r=>r.method==='PATCH').length,1);
 await newButton.click();let prevented=false;let stopped=false;editor.listeners.keydown({key:'Escape',preventDefault(){prevented=true;},stopPropagation(){stopped=true;}});assert(prevented);assert(stopped);assert(editor.hidden);assert(newButton.focused);assert.equal(newButton.attrs['aria-expanded'],'false');
});

test('pending name mutations are one-owner and cannot replace a newly selected project',async()=>{
 const f=await fixture();await f.window.ATLAS_PROJECTS.openProject(f.project.id);await f.button('Rename project').click();const editor=f.byId('projectNameEditor'),input=all(editor).find(n=>n.attrs['aria-label']==='Project name');input.value='Changed A';const held=f.defer('workspace-api/projects/'+f.project.id,'PATCH'),first=f.button('Save name').click();await f.button('Save name').click();assert.equal(f.requests.filter(r=>r.method==='PATCH').length,1);assert.equal(f.all().find(n=>n.attrs['aria-label']==='Open project').disabled,true);
 await f.window.ATLAS_PROJECTS.openProject(f.otherProject.id);held.resolve({...f.project,name:'Changed A'});await first;assert.equal(f.window.ATLAS_PROJECTS.activeProject().id,f.otherProject.id);assert.equal(f.all().find(n=>n.attrs['aria-label']==='Open project').value,f.otherProject.id);assert(editor.hidden);
});

test('name errors keep the editor usable and delayed inventory/search reads do not restore an old project',async()=>{
 const f=await fixture();await f.window.ATLAS_PROJECTS.openProject(f.project.id);await f.button('Rename project').click();const editor=f.byId('projectNameEditor'),input=all(editor).find(n=>n.attrs['aria-label']==='Project name'),failed=f.defer('workspace-api/projects/'+f.project.id,'PATCH');const submission=f.button('Save name').click();failed.reject(Error('Save unavailable'));await submission;assert(!editor.hidden);assert(!input.disabled);assert(input.focused);assert(f.all().some(n=>n.attrs.role==='status'&&n.textContent==='Save unavailable'));
 const inventory=f.defer('workspace-api/projects');input.value='Renamed A';const pendingName=f.button('Save name').click();await new Promise(resolve=>setImmediate(resolve));await f.window.ATLAS_PROJECTS.openProject(f.otherProject.id);inventory.resolve({projects:[f.project]});await pendingName;assert.equal(f.window.ATLAS_PROJECTS.activeProject().id,f.otherProject.id);assert.equal(f.all().find(n=>n.attrs['aria-label']==='Open project').value,f.otherProject.id);
 await f.window.ATLAS_PROJECTS.openProject(f.project.id);const search=f.defer('workspace-api/searches/search-a'),pendingSearch=f.button('Search A').click();await f.window.ATLAS_PROJECTS.openProject(f.otherProject.id);search.resolve({project_id:f.project.id,query:{query:'Old search'},result_snapshot:{examples:[],retrieved:0,total:0}});await pendingSearch;const history=f.byId('projectSearchHistory');assert.equal(history.open,false);assert.equal(history.children.find(n=>n.tagName==='SECTION').hidden,true);assert.equal(f.window.ATLAS_PROJECTS.activeProject().id,f.otherProject.id);
});

test('a running search keeps Cancel outside its collapsed form and preserves original search settings',async()=>{
 const f=await fixture();await f.window.ATLAS_PROJECTS.openProject(f.project.id);const disclosure=f.byId('projectNewSearch'),form=all(disclosure).find(n=>n.tagName==='FORM');assert(!disclosure.open);const operation=form.onsubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));const cancel=f.button('Cancel search');assert.equal(cancel.hidden,false);assert.equal(cancel.parentElement.className,'project-active-actions');assert(!all(disclosure).includes(cancel));await cancel.click();f.finishJob();await operation;assert.equal(cancel.hidden,true);
 const request=f.requests.find(r=>r.url==='workspace-api/search');assert.deepEqual(request.body,{projectId:f.project.id,query:'adaptive leadership',phrase:true,limit:500,from:'',through:''});assert(f.requests.some(r=>r.url.endsWith('/running-search/cancel')));
});

test('isolated menu CSS protects closed/hidden content and keeps mobile controls bounded',()=>{
 const css=readFileSync('public/conservative-atlas/project-menu.css','utf8'),html=readFileSync('public/conservative-atlas/index.html','utf8');assert(css.includes('details.project-disclosure:not([open])>:not(summary){display:none!important}'));assert(css.includes('.project-tools [hidden]{display:none!important}'));assert(css.includes('min-height:44px'));assert(css.includes('@media(max-width:480px)'));assert(html.indexOf('workspace-theme.css')<html.indexOf('project-menu.css'));assert(css.includes(':focus-visible'));
});

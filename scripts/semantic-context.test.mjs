import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

class Node {
 constructor(tag,text=''){this.tag=tag;this.textContent=text;this.children=[];this.className='';this.value='';this.attributes={};this.dataset={};}
 append(...nodes){for(const node of nodes){node.parentElement=this;this.children.push(node);}}
 prepend(node){node.remove();node.parentElement=this;this.children.unshift(node);}
 replaceChildren(...nodes){this.children=[];this.append(...nodes);}
 remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(node=>node!==this);this.parentElement=null;}
 setAttribute(key,value){this.attributes[key]=value;}
 addEventListener(){}
 querySelector(selector){return this.all().find(node=>selector.startsWith('.')?node.className.split(' ').includes(selector.slice(1)):node.id===selector.slice(1))||null;}
 all(){return this.children.flatMap(node=>[node,...node.all()]);}
}
const settings={kind:'topics',textScope:'titles',minimumSupport:3,vocabularyLimit:120,minimumScore:.3,minimumSimilarity:.65,resolution:.02};
const graph=(count,report)=>({semantic:{...settings,coverage:{records:count}},entityKind:'topic',nodes:Array.from({length:count},(_,index)=>({id:'topic-'+index})),stats:{clusters:1},semanticSensitivity:report});

test('actual semantic module clears prior corpus presentation/cache context but restores the selected saved report',()=>{
 const host=new Node('section'),tabs=new Node('div'),listeners={},window={ATLAS_DATA:{summary:{corpus_id:'A'}},addEventListener:(type,handler)=>listeners[type]=handler},document={createElement:tag=>new Node(tag),createTextNode:text=>new Node('text',text),querySelector:selector=>selector==='.workspace-tabs'?tabs:host};
 const source=readFileSync('scripts/semantic-browser.mjs','utf8').replace(/^import .*;\r?\n/gm,'').replace('export function mountSemanticBrowser()','function mountSemanticBrowser()'),context={window,document,Option:class extends Node{constructor(text,value){super('option',text);this.value=value;}},analysisErrorMessage:()=>'',semanticSettings:value=>value};vm.createContext(context);vm.runInContext(source+'\nmountSemanticBrowser();',context);
 const report={completed:2,attempted:3,status:'partial',variants:[],limitation:'Only corpus A evidence',modelSensitivity:'No alternate model'},first=graph(12,report),before=JSON.stringify(first),panel=host.children[0],status=panel.all().find(node=>node.attributes.role==='status');window.ATLAS_SEMANTIC.sync(first);assert.match(panel.querySelector('#semanticConstructionSummary').textContent,/12 topics/);assert(panel.querySelector('.semantic-report'));panel.open=true;
 window.ATLAS_DATA.summary.corpus_id='B';listeners['bibliomap:selection-changed']();assert.equal(window.ATLAS_SEMANTIC.installed,null);assert.equal(window.ATLAS_SEMANTIC.sourceCache,null);assert.equal(panel.querySelector('.semantic-report'),null);assert.equal(panel.querySelector('#semanticConstructionSummary').textContent,'');assert.match(status.textContent,/No semantic result is selected/);assert.equal(panel.open,false);assert.equal(JSON.stringify(first),before);
 const second=graph(5);window.ATLAS_SEMANTIC.sync(second);assert.match(panel.querySelector('#semanticConstructionSummary').textContent,/5 topics/);assert.equal(panel.querySelector('.semantic-report'),null);assert.equal(window.ATLAS_SEMANTIC.installed,second);window.ATLAS_SEMANTIC.resetContext();window.ATLAS_DATA.summary.corpus_id='A';window.ATLAS_SEMANTIC.sync(first);assert(panel.querySelector('.semantic-report'));assert.match(status.textContent,/current pinned source evidence/);assert.equal(JSON.stringify(first),before);
 const app=readFileSync('public/conservative-atlas/app.js','utf8');assert.match(app,/function canvasMode\(coupling\)\{\s*if\(!graph.semantic\)window.ATLAS_SEMANTIC\?\.resetContext\(\)/);assert.match(app,/installCorpus=\(packet,options=\{\}\)=>\{\s*window.ATLAS_EVIDENCE.validateCanvasPacket\(packet\);\s*window.ATLAS_SEMANTIC\?\.resetContext\(\)/);assert.match(source,/cacheIdentity=null/);assert.match(source,/sourceRecordsCorpus=null/);
});

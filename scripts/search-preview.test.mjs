import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('public/conservative-atlas/workspace-projects.js','utf8'),helpers=['previewRecordLinks','previewArticle'].map(name=>source.match(new RegExp(' function '+name+'\\(work\\)\\{[\\s\\S]*?\\r?\\n \\}'))[0]).join('\n');
const node=(tag,text='')=>({tag,textContent:text,children:[],append(...children){this.children.push(...children);}}),context={URL,element:node,document:{createTextNode:text=>({textContent:text})}};vm.runInNewContext(helpers,context);

test('search previews retain existing title/year, IDs and DOI without changing stored work evidence',()=>{
 const service=readFileSync('scripts/workspace-projects-service.mjs','utf8'),mapping=service.match(/examples: search\.result_snapshot\.works\.slice\(0, 10\)\.map\(work => \((\{title:[^\n]+?\})\)\)/)[1],project=new Function('work','return ('+mapping+')'),work={id:'https://openalex.org/W123',doi:'https://doi.org/10.1000/example',display_name:'Leadership training',publication_year:2024},before=structuredClone(work),preview=project(work);
 assert.deepEqual(preview,{title:work.display_name,year:2024,id:work.id,doi:work.doi});assert.deepEqual(work,before);const row=context.previewArticle(preview);assert.equal(row.textContent,'Leadership training (2024)');const anchors=row.children.filter(child=>child.tag==='a');assert.equal(anchors.length,2);assert.equal(anchors[0].href,work.id);assert.equal(anchors[1].href,work.doi);for(const anchor of anchors){assert.equal(anchor.target,'_blank');assert.equal(anchor.rel,'noopener noreferrer');}
 const old=context.previewArticle({title:'Legacy title-only preview',year:2001});assert.equal(old.textContent,'Legacy title-only preview (2001)');assert.equal(old.children.length,0);
});

test('record links canonicalize only OpenAlex work identifiers and validated DOI paths',()=>{
 for(const id of ['W123','w123','http://openalex.org/W123','https://openalex.org/W123'])assert.equal(context.previewRecordLinks({id})[0].href,'https://openalex.org/W123');
 assert.equal(context.previewRecordLinks({doi:'10.1000/example?part#fragment'})[0].href,'https://doi.org/10.1000/example%3Fpart%23fragment');assert.equal(context.previewRecordLinks({doi:'http://dx.doi.org/10.1000/example'})[0].href,'https://doi.org/10.1000/example');
 for(const value of ['javascript:alert(1)','data:text/html,bad','https://openalex.org.evil/W123','https://openalex.org/W123?tracking=1','https://openalex.org/W123#x','https://openalex.org/A123','https://user@openalex.org/W123','https://doi.org.evil/10.1000/example','https://user@doi.org/10.1000/example','https://doi.org/10.1000/example?query=bad','https://doi.org/10.1000/example#bad','10.1000/with space','https://doi.org/10.1000/%00','<img src=x onerror=bad>',{private:'not-a-string'}])assert.equal(context.previewRecordLinks({id:value,doi:value}).length,0);
 const unsafe=context.previewArticle({title:'<img src=x onerror=bad>',id:'javascript:alert(1)',doi:'data:text/html,bad'});assert.equal(unsafe.textContent,'<img src=x onerror=bad>');assert(unsafe.children.every(child=>!child.tag));assert(unsafe.children.some(child=>child.textContent.includes('Record ID: javascript:')));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('actual labels omit publication years only for nonpublication features/actors, not source or cited works',()=>{
 const source=readFileSync('public/conservative-atlas/app.js','utf8'),body=source.match(/function articleLabel\(n\)\{([^\r\n]+)\}\r?\n/)[1],label=new Function('n','graph','$','foundationLabelsActive','isCoupling','state','window',body),control=()=>({value:'articles'});
 for(const entityKind of ['term','topic','author','institution','country']){const result=label({label:'Psychological safety'}, {entityKind},()=>{throw Error('A nonpublication label must not inspect year controls');});assert.equal(result,'Psychological safety');}
 const work={label:'Jones, Leadership training',authors:'Jones, A',year:2020};assert.equal(label(work,{entityKind:'source'},control,()=>false,()=>true,{method:'coupling'},{}),'Jones (2020)');assert.equal(label({...work,year:null},{entityKind:'source'},control,()=>false,()=>true,{method:'coupling'},{}),'Jones (?)');assert.equal(label(work,{entityKind:'cited-work'},control,()=>false,()=>false,{method:'cocitation'},{}),'Jones (2020)');assert.equal(label({...work,year:null},{entityKind:'cited-work'},control,()=>false,()=>false,{method:'cocitation'},{}),'Jones (?)');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {publicSupplementTarget,proxyAnalysis} from './analysis-proxy.mjs';
import http from 'node:http';
import {PassThrough,Readable,Writable} from 'node:stream';
import {once} from 'node:events';
const corpus='a67fdd5f-d449-4016-87fd-6b78e3e878fc',route='/conservative-atlas/workspace-api/public-collaboration-metadata';
test('public supplement proxy exposes exactly one read-only literal path and forwards only its corpus query',()=>{
 assert.equal(publicSupplementTarget(new URL(route+'?corpus='+corpus,'http://localhost'),'GET'),'/public-collaboration-metadata?corpus='+corpus);
 for(const method of ['POST','PATCH','DELETE','HEAD'])assert.equal(publicSupplementTarget(new URL(route+'?corpus='+corpus,'http://localhost'),method),null);
 for(const path of [route,route+'?corpus='+corpus+'&path=C:/private',route+'?corpus='+corpus+'&corpus='+corpus,route+'?corpus=../../private',route+'/other?corpus='+corpus,'/conservative-atlas/workspace-api/corpora/'+corpus+'/evidence'])assert.equal(publicSupplementTarget(new URL(path,'http://localhost'),'GET'),null);
});
test('actual proxy adapter forwards allowed query without network and rejects writes before contacting upstream',async()=>{
 const original=http.request,called=[];http.request=(options,callback)=>{called.push(options);const upstream=new PassThrough();upstream.on('finish',()=>{const result=Readable.from(['{"publicCorpus":true}']);result.statusCode=200;callback(result);});return upstream;};
 try{for(const method of ['GET','POST']){const request=Readable.from([]);Object.assign(request,{url:route+'?corpus='+corpus,method,headers:{}});let body='',status;const response=new Writable({write(chunk,encoding,done){body+=chunk;done();}});response.writeHead=value=>{status=value;response.headersSent=true;};const completed=once(response,'finish');assert.equal(proxyAnalysis(request,response),true);await completed;assert.equal(status,method==='GET'?200:400);if(method==='GET')assert.equal(body,'{"publicCorpus":true}');}assert.equal(called.length,1);assert.equal(called[0].hostname,'127.0.0.1');assert.equal(called[0].port,8094);assert.equal(called[0].path,'/public-collaboration-metadata?corpus='+corpus);}finally{http.request=original;}
});

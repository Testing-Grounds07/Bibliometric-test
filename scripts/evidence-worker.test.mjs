import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const bundle = fs.readFileSync('public/conservative-atlas/evidence-worker.js', 'utf8');
function run(data) {
 const messages = [], context = {self: {postMessage: message => messages.push(message)}};
 vm.runInNewContext(bundle, context); context.self.onmessage({data});
 const result = messages.at(-1); assert.equal(result.error, undefined); return {result, messages};
}

test('published coupling worker builds real partitions and runs all 50 recovery resamples', () => {
 const articles = [{id:'a',references:['r','s','t']},{id:'b',references:['r','s','t']},{id:'c',references:[]}];
 const {result} = run({action:'coupling',articles,minimumShared:1,minimumCosine:0,resolution:.02});
 assert.equal(result.graph.links.length, 1); assert.equal(result.graph.clustering.clusters, 1); assert.equal(result.graph.nodes[2].cluster, 0);
 const recovery = run({action:'stability',graph:result.graph});
 assert.equal(recovery.result.stability.samples, 50); assert.equal(recovery.messages.filter(message=>message.progress).length, 50);
 assert.equal(recovery.result.stability.clusters[1].meanJaccard, 1);
});

test('published worker resamples source articles for higher-order reference graphs', () => {
 const articles = ['s1','s2','s3','s4','s5'];
 const graph = {method:'cocitation',order:3,resolution:.02,minimumSupport:5,nodes:['a','b','c'].map(id=>({id,cluster:1,articles})),links:[['a','b'],['a','c'],['b','c']].map(([source,target])=>({source,target,strength:.2,articles,bundleIds:['bundle']})),bundles:[{id:'bundle',members:['a','b','c'],articles}]};
 const {result} = run({action:'stability',graph,articleIds:articles});
 assert.equal(result.stability.clusters[1].meanJaccard, 1);
 assert.match(result.stability.resamplingUnit, /Source articles/);
});

test('settings comparison is bounded, deterministic, validates separately and rejects trivial structure', () => {
 const articles = [{id: 'a', references: ['r', 's', 't']}, {id: 'b', references: ['r', 's', 't']}, {id: 'c', references: []}];
 const request = {action: 'compare-coupling', articles, current: {minimumShared: 3, minimumCosine: .05}};
 const {result} = run(request), audit = result.audit;
 assert.equal(audit.candidates.length, 9);
 assert.equal(audit.validationSamples, 50); assert.equal(audit.validationSeedOffset, 100);
 assert.equal(audit.status, 'no_clear_recommendation'); assert.ok(audit.validation.reasons.includes('groups only reproduce disconnected components'));
 assert.equal(JSON.stringify(run(request).result), JSON.stringify(result));
 assert.equal(audit.validationClusters[1].meanJaccard, 1);
 assert.equal(run({action: 'compare-coupling', articles: [{id: 'empty', references: []}]}).result.audit.status, 'no_connections');
});

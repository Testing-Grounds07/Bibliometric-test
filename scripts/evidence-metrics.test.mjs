import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {connectionRoles, sourcesForCluster, couplingPairs, couplingGraph, clusterRecovery, summarizeRecovery, bootstrapWeights} from './evidence-metrics.mjs';

test('source linking uses the union of citing articles without duplicates or outsiders', () => {
 const articles = [{id:'a'}, {id:'b'}, {id:'c'}], graph = {nodes:[{cluster:1,articles:['a','b']},{cluster:1,articles:['a']},{cluster:2,articles:['c']}]};
 assert.deepEqual(sourcesForCluster(articles, graph, 1), articles.slice(0, 2));
 assert.equal(sourcesForCluster(articles, graph, null), articles);
 assert.deepEqual(sourcesForCluster(articles, graph, 3), []);
});

test('coupling uses all distinct references, preserves missing-data nodes and normalizes lengths', () => {
 const articles = [{id: 'a', references: ['rare', 'shared', 'rare', 'unique']}, {id: 'b', references: ['rare', 'shared']}, {id: 'c', references: []}];
 const pairs = couplingPairs(articles), graph = couplingGraph(articles, pairs, 2, 0);
 assert.equal(pairs.length, 1); assert.equal(graph.nodes.length, 3); assert.equal(graph.nodes[0].referenceCount, 3);
 assert.equal(graph.links[0].count, 2); assert.equal(graph.links[0].strength, 2 / Math.sqrt(6));
 assert.equal(couplingGraph(articles, pairs, 3, 0).links.length, 0);
 assert.equal(couplingGraph(articles, pairs, 1, .9).links.length, 0);
});

test('reference resampling rebuilds previously excluded coupling pairs', () => {
 const articles = [{id: 'a', references: ['r', 's']}, {id: 'b', references: ['r', 't']}], pairs = couplingPairs(articles);
 assert.equal(couplingGraph(articles, pairs, 2, 0).links.length, 0);
 const graph = couplingGraph(articles, pairs, 2, 0, {r: 2, s: 0, t: 1});
 assert.equal(graph.links[0].count, 2); assert.equal(graph.links[0].strength, 2 / Math.sqrt(6));
});

test('roles use weighted full-graph participation and undefined z for no within-cluster variation', () => {
 const graph = {nodes: [{id: 'a', cluster: 1}, {id: 'b', cluster: 1}, {id: 'c', cluster: 2}, {id: 'd', cluster: 0}], links: [{source: 'a', target: 'b', strength: 3}, {source: 'a', target: 'c', strength: 1}]};
 const before = JSON.stringify(graph), roles = connectionRoles(graph);
 assert.equal(roles.a.participation, .375); assert.equal(roles.a.externalShare, .25);
 assert.deepEqual(roles.a.connectedClusters, [2]); assert.equal(roles.a.withinClusterZ, null);
 assert.equal(roles.b.label, 'Within-cluster only'); assert.equal(roles.d.participation, null);
 assert.equal(roles.c.label, 'Some cross-cluster connections'); assert.equal(JSON.stringify(graph), before);
});

test('construction-only cluster-zero placeholders never become community role findings',()=>{
 const graph={clustering:{algorithm:'not_requested'},nodes:[{id:'a',cluster:0},{id:'b',cluster:0},{id:'e',cluster:0}],links:[{source:'a',target:'b',strength:.5}]},before=JSON.stringify(graph),roles=connectionRoles(graph);
 assert.equal(roles.a.degree,1);assert.equal(roles.a.strength,.5);assert.equal(roles.e.degree,0);
 for(const role of Object.values(roles)){assert.equal(role.partitionAssessed,false);assert.equal(role.participation,null);assert.equal(role.withinClusterZ,null);assert.equal(role.externalShare,null);assert.match(role.label,/not assessed/);}
 assert.equal(JSON.stringify(graph),before);
});

test('recovery ignores cluster numbering but penalizes missing nodes, splits and merges', () => {
 const original = {a: 1, b: 1, c: 2, d: 2, isolated: 0};
 const matched = clusterRecovery(original, {a: 8, b: 8, c: 9, d: 9});
 assert.equal(matched[1].jaccard, 1); assert.equal(matched[0], undefined);
 const split = clusterRecovery(original, {a: 1, b: 2, c: 3, d: 3}); assert.equal(split[1].jaccard, .5);
 const merged = clusterRecovery(original, {a: 1, b: 1, c: 1, d: 1}); assert.equal(merged[1].jaccard, .5);
 const lost = clusterRecovery(original, {a: 1}); assert.equal(lost[1].jaccard, .5); assert.equal(lost[1].retention, .5); assert.equal(lost[2].jaccard, 0);
});

test('deterministic bootstraps preserve draw count and report empirical recovery spread', () => {
 const ids = ['a', 'b', 'c', 'd']; assert.deepEqual(bootstrapWeights(ids, 0), bootstrapWeights(ids, 0));
 assert.equal(Object.values(bootstrapWeights(ids, 2)).reduce((sum, count) => sum + count, 0), 4);
 const summary = summarizeRecovery([{1: {jaccard: 0, retention: .5, size: 2}}, {1: {jaccard: 1, retention: 1, size: 2}}]);
 assert.equal(summary[1].meanJaccard, .5); assert.deepEqual(summary[1].interval, [.1, .9]); assert.equal(summary[1].meanRetention, .75);
});

test('published incidence preserves all sources and references, collapsing only audited duplicate identities', () => {
 const data = JSON.parse(fs.readFileSync('public/conservative-atlas/source-evidence.json', 'utf8'));
 const works = new Map(JSON.parse(fs.readFileSync('.trials/adaptive-leadership-full/works.json', 'utf8')).map(work => [work.id, work]));
 assert.equal(data.articles.length, 2855); assert.equal(new Set(data.articles.map(article => article.id)).size, 2855);
 const aliases=new Map(data.deduplication.mergedGroups.flatMap(group=>group.records.map(record=>[record.id,group.canonicalId])));
 for (const article of data.articles) assert.deepEqual([...article.references].sort(), [...new Set((works.get(article.id).referenced_works || []).map(id=>aliases.get(id)||id))].sort());
 assert(new Set(data.articles.flatMap(article => article.references)).size > 100000);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {clusterSizeFilter,hasObservedLinks} from './cluster-visibility.mjs';

const nodes = [1, 1, 2, 2, 2, 3, 0, 0].map((cluster, position) => ({id: String(position), cluster}));

test('cluster minimum uses full membership and retains groups exactly at the cutoff', () => {
 const original = structuredClone(nodes), result = clusterSizeFilter(nodes, 3);
 assert.equal(result.counts.get(2), 3);
 assert.deepEqual([...result.hiddenClusters], [1, 3]);
 assert.deepEqual(nodes.filter(node => !result.hiddenClusters.has(node.cluster)).map(node => node.id), ['2', '3', '4', '6', '7']);
 assert.deepEqual(nodes, original);
 assert.deepEqual([...clusterSizeFilter(nodes, 1).hiddenClusters], []);
 assert.equal(clusterSizeFilter(nodes, 99).hiddenClusters.size, 3);
});

test('unlinked works are separate from cluster size, including string IDs and empty graphs', () => {
 const result = clusterSizeFilter(nodes.map(node => ({...node, cluster: String(node.cluster)})), 9);
 assert(!result.hiddenClusters.has(0)); assert(result.hiddenClusters.has(2));
 assert.equal(clusterSizeFilter([], 5).hiddenClusters.size, 0);
});

test('invalid cutoffs safely return to one and fractional cutoffs hide smaller integer groups', () => {
 for (const value of [undefined, null, '', NaN, Infinity, -2, 0]) assert.equal(clusterSizeFilter(nodes, value).minimum, 1);
 assert.equal(clusterSizeFilter(nodes, '3').minimum, 3);
 assert.equal(clusterSizeFilter(nodes, 2.5).minimum, 3);
});

test('shared canvas saves the minimum, restores old snapshots and filters unlinked tiles', () => {
 const app = fs.readFileSync('public/conservative-atlas/app.js', 'utf8');
 assert(app.includes('minimumClusterSize:mapVisibility.minimumClusterSize'));
 assert(app.includes('mapVisibility.minimumClusterSize=session.minimumClusterSize||1'));
 assert(app.includes('!sizeFilter.hiddenClusters.has(Number(n.cluster))'));
 assert(app.includes('!sizeFilter.hiddenClusters.has(cluster)'));
 assert(app.includes('window.ATLAS_EVIDENCE.hasObservedLinks'));
});

test('unassigned memberships are distinct from edge incidence and isolate visibility',()=>{
 const a={id:'A',cluster:0,degree:1},b={id:'B',cluster:0,degree:0},c={id:'C',cluster:7,degree:0};
 assert.equal(hasObservedLinks(a),true);assert.equal(hasObservedLinks(b),false);assert.equal(hasObservedLinks(c),false);
 assert.equal(hasObservedLinks({id:'D',cluster:0},[{source:'D',target:'E'}]),true);
 assert.equal(hasObservedLinks({id:'F',cluster:9},[{source:'D',target:'E'}]),false);
});

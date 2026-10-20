import test from 'node:test';
import assert from 'node:assert/strict';
import {clusterReliability, hasGeneratedLabel} from './cluster-indicators.mjs';

const graph = {clustering: {algorithm: 'hypergraph'}, reliability: {algorithm: 'hypergraph', preliminary: true, samples: 10, clusters: {
 1: {size: 20, meanJaccard: .8, meanRetention: .9, interval: [.7, .9]},
 2: {size: 8, meanJaccard: .6, meanRetention: .8, interval: [.4, .7]},
 3: {size: 3, meanJaccard: .4, meanRetention: .8, interval: [.2, .6]}
}}};
test('AI marker requires the displayed heading to be the accepted generated label', () => {
 assert.equal(hasGeneratedLabel({heading: 'Theme'}), false);
 assert.equal(hasGeneratedLabel({heading: 'Theme', generated: {heading: 'Theme', status: 'shared-theme'}}), true);
 assert.equal(hasGeneratedLabel({heading: 'Theme', generated: {heading: 'Theme', status: 'mixed-themes'}}), true);
 assert.equal(hasGeneratedLabel({heading: 'Keywords', generated: {heading: 'Theme', status: 'shared-theme'}}), false);
 assert.equal(hasGeneratedLabel({heading: 'Theme', generated: {heading: 'Theme', status: 'limited-evidence'}}), false);
});
test('ratings reuse existing recovery rules and disclose preliminary and tiny-group cautions', () => {
 assert.equal(clusterReliability(graph, 1).dash, 'none');
 assert.equal(clusterReliability(graph, 2).status, 'sensitive');
 assert.equal(clusterReliability(graph, 3).status, 'changing');
 assert.match(clusterReliability(graph, 1).title, /Preliminary/);
 assert.match(clusterReliability(graph, 3).title, /Very small group/);
 assert.match(clusterReliability(graph, 2).title, /not article quality/);
});
test('missing, unlinked, invalid or wrong-algorithm results never get assessed rings', () => {
 for (const rating of [clusterReliability(graph, 0), clusterReliability(graph, 9), clusterReliability({...graph, reliability: null}, 1), clusterReliability({...graph, clustering: {algorithm: 'infomap'}}, 1)]) assert.equal(rating.dash, null);
});
test('rerunning and pending method changes hide old completed ratings', () => {
 for (const reliabilityState of ['running', 'pending']) {
  const rating = clusterReliability({...graph, reliabilityState}, 1);
  assert.equal(rating.status, 'checking'); assert.equal(rating.dash, null);
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretRecovery, recoveryOverview, recoveryMetrics, assessCouplingCandidate, chooseCouplingCandidate} from './evidence-guidance.mjs';

const record = {size: 30, meanJaccard: .8, meanRetention: .9, interval: [.65, .9]};
test('plain-English outcomes distinguish regrouping, lost connections and uncertain boundaries', () => {
 assert.equal(interpretRecovery(record).status, 'holding');
 assert.equal(interpretRecovery({...record, interval: [.3, 1]}).status, 'sensitive');
 assert.match(interpretRecovery({...record, meanJaccard: .3}).explanation, /regroup/);
 assert.match(interpretRecovery({...record, meanRetention: .4}).explanation, /lose their eligible connections/);
 assert.equal(interpretRecovery(null).status, 'unknown');
 assert.equal(interpretRecovery({...record, meanJaccard: .75, meanRetention: .8, interval: [.6, .9]}).status, 'holding');
 assert.equal(interpretRecovery({...record, meanJaccard: .5}).status, 'sensitive');
 assert.match(interpretRecovery({...record, size: 3}).caution, /Very small/);
 assert.match(interpretRecovery(record, 1).caution, /Only one/);
});
test('overview does not let many tiny stable groups outweigh a large unstable group', () => {
 const clusters = {1: {...record, size: 100, meanJaccard: .3}, 2: {...record, size: 3}, 3: {...record, size: 2}};
 const summary = recoveryOverview(clusters);
 assert.equal(summary.heading, 'Treat this map as exploratory'); assert.equal(summary.holdingMembers, 5); assert.equal(summary.members, 105);
 assert.match(recoveryOverview({}).heading, /No linked/);
 const metrics = recoveryMetrics(clusters, 200);
 assert.equal(metrics.coverage, .525); assert.ok(Math.abs(metrics.recovery - 34 / 105) < 1e-10);
});
test('settings selection guards against trivial, sparse or fragile partitions', () => {
 const candidate = {id: 1, coverage: .8, recovery: .8, retention: .9, clusters: 5, edges: 40, resolution: .02, largestShare: .5, fragmentation: {components: 2, introducedTinyNodeFraction: .1}};
 const good = assessCouplingCandidate(candidate); assert.equal(good.admissible, true);
 for (const change of [{coverage: .5}, {recovery: .6}, {retention: .7}, {largestShare: .95}, {clusters: 2}, {fragmentation: {components: 2, introducedTinyNodeFraction: .3}}]) assert.equal(assessCouplingCandidate({...candidate, ...change}).admissible, false);
 const tinyOnly = assessCouplingCandidate({...candidate, id: 2, clusters: 2, recovery: 1});
 assert.equal(chooseCouplingCandidate([good, tinyOnly]).id, 1);
 assert.equal(chooseCouplingCandidate([assessCouplingCandidate({...candidate, edges: 0, coverage: 0})]), null);
 const broader = assessCouplingCandidate({...candidate, id: 3, clusters: 4, recovery: .78});
 assert.equal(chooseCouplingCandidate([good, broader]).id, 3);
});

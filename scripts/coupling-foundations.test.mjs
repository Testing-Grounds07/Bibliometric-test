import test from 'node:test';
import assert from 'node:assert/strict';
import {clusterFoundations} from './coupling-foundations.mjs';

test('foundations count distinct citing members, not pairs, with the full cluster denominator', () => {
 const nodes = [{id: 'a', cluster: 1, references: ['shared', 'shared', 'all', 'unique']}, {id: 'b', cluster: 1, references: ['shared', 'all']}, {id: 'c', cluster: 1, references: ['all']}, {id: 'd', cluster: 1, references: []}, {id: 'outside', cluster: 2, references: ['shared', 'unique']}];
 const before = structuredClone(nodes), result = clusterFoundations(nodes, '1');
 assert.equal(result.members, 4);
 assert.equal(result.withReferences, 3);
 assert.deepEqual(result.references, [{id: 'all', count: 3, share: .75, sources: ['a', 'b', 'c']}, {id: 'shared', count: 2, share: .5, sources: ['a', 'b']}]);
 assert.deepEqual(nodes, before);
});

test('unlinked, absent and single-member groups have no shared foundations', () => {
 const nodes = [{id: 'a', cluster: 0, references: ['r']}, {id: 'b', cluster: 0, references: ['r']}, {id: 'c', cluster: 1, references: ['r']}];
 assert.equal(clusterFoundations(nodes, 0).members, 0);
 assert.deepEqual(clusterFoundations(nodes, 2).references, []);
 assert.deepEqual(clusterFoundations(nodes, 1).references, []);
});

test('duplicate source records cannot inflate counts and ties sort deterministically', () => {
 const article = {id: 'a', cluster: 1, references: ['z', 'a']};
 const result = clusterFoundations([article, article, {id: 'b', cluster: 1, references: ['a', 'z']}], 1);
 assert.equal(result.members, 2);
 assert.deepEqual(result.references.map(reference => [reference.id, reference.count]), [['a', 2], ['z', 2]]);
});

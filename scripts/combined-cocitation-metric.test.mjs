import assert from 'node:assert/strict';
import test from 'node:test';
import {combineOrderEvidence} from './combined-cocitation-metric.mjs';

const pair = {count: 5, articles: ['first', 'second', 'third', 'fourth', 'fifth']};
test('Pair-only connections retain their exact frequency', () => {
  const result = combineOrderEvidence(pair, [], 10);
  assert.equal(result.combinedScore, 5);
  assert.equal(result.higherOrderBonus, 0);
});
test('Nested orders reward each article by its largest order, not by bundle multiplicity', () => {
  const result = combineOrderEvidence(pair, [{order: 3, articles: pair.articles}, {order: 4, articles: pair.articles}], 10);
  assert(Math.abs(result.combinedScore - 5 * (1 + Math.log2(3))) < 1e-12);
  assert.equal(result.maximumSupportedOrder, 4);
});
test('Repeated evidence within an order cannot inflate the score', () => {
  const unique = combineOrderEvidence(pair, [{order: 3, articles: pair.articles}], 4);
  const duplicated = combineOrderEvidence(pair, [{order: 3, articles: [...pair.articles, ...pair.articles]}], 4);
  assert.deepEqual(unique, duplicated);
});
test('Mixed support counts retain an auditable per-article decomposition', () => {
  const result = combineOrderEvidence(pair, [{order: 3, articles: ['first', 'second']}, {order: 4, articles: ['first']}], 4);
  assert(Math.abs(result.combinedScore - (5 + 1 + Math.log2(3))) < 1e-12);
  assert.deepEqual(result.orderProfile.map(row => row.support), [5, 2, 1]);
});
test('An unsupported higher order cannot reintroduce absent source articles', () => {
  assert.throws(() => combineOrderEvidence(pair, [{order: 4, articles: ['first']}], 4), /nested/);
});

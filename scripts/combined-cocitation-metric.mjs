import assert from 'node:assert/strict';

export function combineOrderEvidence(pair, higherOrders, maximumOrder) {
  const articles = new Set(pair.articles);
  assert.equal(articles.size, pair.count);
  const maximumByArticle = Object.fromEntries([...articles].map(article => [article, 2]));
  const byOrder = new Map(higherOrders.map(edge => [edge.order, edge]));
  assert.equal(byOrder.size, higherOrders.length);
  const profile = [{order: 2, support: articles.size}];
  let previous = articles;
  for (let order = 3; order <= maximumOrder; order++) {
    const evidence = new Set(byOrder.get(order)?.articles || []);
    assert([...evidence].every(article => previous.has(article)), 'Higher-order evidence must be nested within lower-order evidence');
    profile.push({order, support: evidence.size});
    for (const article of evidence) maximumByArticle[article] = order;
    previous = evidence;
  }
  const bonus = Object.values(maximumByArticle).reduce((sum, order) => sum + Math.log2(order - 1), 0);
  return {combinedScore: pair.count + bonus, higherOrderBonus: bonus, orderProfile: profile, maximumOrderByArticle: maximumByArticle, maximumSupportedOrder: Math.max(2, ...Object.values(maximumByArticle))};
}

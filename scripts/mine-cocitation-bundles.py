import json
import sys
from pathlib import Path


def mine_closed(postings, minimum_support):
    ordered = sorted(postings, key=lambda item: (-len(postings[item]), item))
    articles = sorted({article for values in postings.values() for article in values})
    article_index = {article: position for position, article in enumerate(articles)}
    masks = [sum(1 << article_index[article] for article in set(postings[item])) for item in ordered]
    results = []

    def visit(closed, support_mask, start):
        for position in range(start, len(ordered)):
            if position in closed:
                continue
            intersection = support_mask & masks[position]
            if intersection.bit_count() < minimum_support:
                continue
            closure = frozenset(candidate for candidate, mask in enumerate(masks) if intersection & mask == intersection)
            if any(candidate < position and candidate not in closed for candidate in closure):
                continue
            if len(closure) >= 3:
                results.append({"members": [ordered[candidate] for candidate in sorted(closure)], "articles": [article for offset, article in enumerate(articles) if intersection & (1 << offset)]})
                if len(results) > 500000:
                    raise RuntimeError('Closed-bundle safety limit exceeded; no partial output is published')
            visit(closure, intersection, position + 1)

    universal = (1 << len(articles)) - 1
    root = frozenset(position for position, mask in enumerate(masks) if mask == universal)
    if len(root) >= 3 and len(articles) >= minimum_support:
        results.append({"members": [ordered[position] for position in sorted(root)], "articles": articles})
    visit(root, universal, 0)
    return results


if __name__ == '__main__':
    graph = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))['cocitation_min10']
    bundles = mine_closed({node['id']: node['articles'] for node in graph['nodes']}, 5)
    bundles.sort(key=lambda bundle: (-len(bundle['members']), -len(bundle['articles']), bundle['members']))
    output = {"minimum_support": 5, "minimum_reference_occurrence": 10, "complete": True, "maximum_order": max((len(bundle['members']) for bundle in bundles), default=2), "bundles": bundles}
    Path(sys.argv[2]).write_text(json.dumps(output, separators=(',', ':')), encoding='utf-8')
    print(json.dumps({key: value for key, value in output.items() if key != 'bundles'} | {"closed_bundles": len(bundles)}))

import importlib.util
import itertools
import random
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('bundle_miner', Path(__file__).with_name('mine-cocitation-bundles.py'))
miner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(miner)


class ClosedBundleTests(unittest.TestCase):
    def check_against_exhaustive_subsets(self, postings, minimum):
        bundles = miner.mine_closed(postings, minimum)
        self.assertEqual(len(bundles), len({tuple(sorted(bundle['members'])) for bundle in bundles}))
        for bundle in bundles:
            evidence = set.intersection(*(set(postings[item]) for item in bundle['members']))
            self.assertEqual(set(bundle['articles']), evidence)
            self.assertGreaterEqual(len(evidence), minimum)
            closure = {item for item, articles in postings.items() if evidence.issubset(articles)}
            self.assertEqual(set(bundle['members']), closure)
        for order in range(3, len(postings) + 1):
            for members in itertools.combinations(postings, order):
                evidence = set.intersection(*(set(postings[item]) for item in members))
                matching = [bundle for bundle in bundles if set(members).issubset(bundle['members'])]
                self.assertEqual(bool(matching), len(evidence) >= minimum)
                if matching:
                    self.assertTrue(any(set(bundle['articles']) == evidence for bundle in matching))

    def test_closed_representation_preserves_every_supported_subset(self):
        generator = random.Random(42)
        for trial in range(40):
            postings = {f'work{item}': {f'article{article}' for article in range(14) if generator.random() < 0.65} for item in range(8)}
            for minimum in [2, 3, 5]:
                with self.subTest(trial=trial, minimum=minimum):
                    self.check_against_exhaustive_subsets(postings, minimum)

    def test_pairwise_triangle_is_not_joint_citation(self):
        postings = {'first': {'ab1', 'ab2', 'ac1', 'ac2'}, 'second': {'ab1', 'ab2', 'bc1', 'bc2'}, 'third': {'ac1', 'ac2', 'bc1', 'bc2'}}
        self.assertEqual(miner.mine_closed(postings, 2), [])

    def test_universal_bundle_and_duplicate_article_ids(self):
        postings = {f'work{item}': ['source1', 'source2', 'source2', 'source3'] for item in range(6)}
        self.check_against_exhaustive_subsets(postings, 3)

    def test_universal_bundle_below_minimum_is_excluded(self):
        self.assertEqual(miner.mine_closed({'first': ['one'], 'second': ['one'], 'third': ['one']}, 5), [])


if __name__ == '__main__':
    unittest.main()

import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location('miner', Path(__file__).with_name('mine-cocitation-bundles.py'))
miner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(miner)
base = json.loads(Path('.trials/conservative-cocitation/expanded-input.json').read_text(encoding='utf-8'))
bundles = miner.mine_closed({node['id']: node['articles'] for node in base['nodes']}, 3)
result = {'bundles': bundles, 'maximumOrder': max((len(bundle['members']) for bundle in bundles), default=2)}
Path('.trials/conservative-cocitation/expanded-bundles.json').write_text(json.dumps(result, separators=(',', ':')), encoding='utf-8')
print(json.dumps({'bundles': len(bundles), 'maximumOrder': result['maximumOrder']}))

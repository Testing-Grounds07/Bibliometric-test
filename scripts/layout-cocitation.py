import json
import sys
from pathlib import Path

sys.path.insert(0, 'C:/Users/Austin/Documents/Codex/2026-10-14/can-you-access-the-k-state/tmp/cocitation_dependencies')
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / '.trials/layout-dependencies'))
import networkx as nx

graphs = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
for name, graph in graphs.items():
    network = nx.Graph()
    network.add_nodes_from(node['id'] for node in graph['nodes'])
    network.add_weighted_edges_from((edge['source'], edge['target'], edge['strength']) for edge in graph['links'])
    components = sorted(nx.connected_components(network), key=len, reverse=True)
    coordinates = {}
    for component_index, members in enumerate(components):
        positions = nx.spring_layout(network.subgraph(members), weight=None, seed=7, iterations=350, method='force')
        center_x = 430 if component_index == 0 and len(components) > 1 else 490 if component_index == 0 else 850
        center_y = 350 if component_index == 0 else 100 + (component_index - 1) * 120
        scale_x = 320 if component_index == 0 else 60
        scale_y = 260 if component_index == 0 else 40
        for identity, position in positions.items():
            coordinates[identity] = (float(position[0]) * scale_x + center_x, float(position[1]) * scale_y + center_y)
    for node in graph['nodes']:
        node['x'], node['y'] = [round(value, 3) for value in coordinates[node['id']]]
    print(json.dumps({'phase': 'layout', 'scope': name, 'nodes': network.number_of_nodes()}), flush=True)
Path(sys.argv[2]).write_text(json.dumps(graphs, separators=(',', ':')), encoding='utf-8')

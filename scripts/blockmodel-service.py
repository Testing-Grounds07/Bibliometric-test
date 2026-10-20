import json
import hmac
import os
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def fit(payload):
    import graph_tool.all as gt
    gt.openmp_set_num_threads(2)
    ids = payload['nodes']
    edges = payload['edges']
    if len(ids) > 5000 or len(edges) > 200000 or len(set(ids)) != len(ids):
        raise ValueError('Network exceeds block-model limits or contains duplicate IDs')
    if any(not isinstance(value, str) or len(value) > 200 for value in ids):
        raise ValueError('Invalid article identifiers')
    positions = {value: index for index, value in enumerate(ids)}
    pairs = set()
    for source, target in edges:
        if source not in positions or target not in positions or source == target:
            raise ValueError('Invalid connection endpoints')
        pairs.add(tuple(sorted((positions[source], positions[target]))))
    network = gt.Graph(directed=False)
    network.add_vertex(len(ids))
    network.add_edge_list(list(pairs))
    starts = payload.get('starts', 3)
    if starts not in (2, 3):
        raise ValueError('Choose two or three optimization starts')
    best = None
    scores = []
    for seed in range(42, 42 + starts):
        gt.seed_rng(seed)
        state = gt.minimize_nested_blockmodel_dl(network, state_args={'deg_corr': True})
        score = float(state.entropy())
        scores.append(score)
        if best is None or score < best.entropy():
            best = state
    hierarchy = []
    for level in range(len(best.get_levels())):
        projected = best.project_level(level).get_blocks()
        memberships = {value: int(projected[index]) + 1 for index, value in enumerate(ids)}
        hierarchy.append({'level': level, 'memberships': memberships, 'clusters': len(set(memberships.values()))})
        if hierarchy[-1]['clusters'] == 1:
            break
    return {'algorithm': 'sbm', 'label': 'Nested block model', 'memberships': hierarchy[0]['memberships'], 'hierarchy': hierarchy, 'selectedLevel': 0, 'quality': min(scores), 'qualityLabel': 'Description length (nats; lower is better for this network)', 'startScores': scores, 'trials': starts, 'engine': 'graph-tool ' + gt.__version__, 'objective': 'Degree-corrected nested stochastic block model; minimum description length', 'limitations': 'Fits binary connection topology. Line intensities remain evidence weights and are not used by this model. Isolated nodes are excluded. A hierarchy can include core-periphery and other block patterns, not only dense thematic communities. Independent starts do not prove a global optimum.'}


lock = threading.Lock()


class Handler(BaseHTTPRequestHandler):
    def respond(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self.respond(200 if self.path == '/health' else 404, {'ready': self.path == '/health', 'serviceAuthentication': bool(os.environ.get('BIBLIOMAP_SERVICE_TOKEN'))})

    def do_POST(self):
        secret = os.environ.get('BIBLIOMAP_SERVICE_TOKEN', '')
        if secret and not hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + secret):
            self.respond(401, {'error': 'Service authentication required'})
            return
        if self.path != '/sbm':
            self.respond(404, {'error': 'Unknown analysis'})
            return
        try:
            length = int(self.headers.get('Content-Length', 0))
            if not 0 < length <= 6000000:
                self.respond(413, {'error': 'Network request is too large'})
                return
            payload = self.rfile.read(length)
            if not lock.acquire(blocking=False):
                self.respond(429, {'error': 'Another block-model fit is running. Please retry shortly.'})
                return
            try:
                result = subprocess.run([sys.executable, __file__, '--fit'], input=payload, capture_output=True, timeout=90, env={**os.environ, 'OMP_NUM_THREADS': '2'})
                if result.returncode:
                    self.respond(422, {'error': 'Block-model inference failed: ' + result.stderr.decode()[-500:]})
                else:
                    self.respond(200, json.loads(result.stdout))
            except subprocess.TimeoutExpired:
                self.respond(408, {'error': 'Block-model fit exceeded 90 seconds. Use a smaller analysis scope.'})
            finally:
                lock.release()
        except (ValueError, KeyError, TypeError) as error:
            self.respond(400, {'error': str(error)})


if __name__ == '__main__':
    if '--fit' in sys.argv:
        print(json.dumps(fit(json.load(sys.stdin))))
    else:
        ThreadingHTTPServer(('0.0.0.0', 8091), Handler).serve_forever()

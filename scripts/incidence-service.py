import json
import hmac
import os
import math
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def fit(payload):
    import igraph as ig
    import leidenalg as la
    ids, groups = payload['nodes'], payload['groups']
    if not isinstance(ids, list) or not isinstance(groups, list) or len(ids) > 10000 or len(groups) > 20000:
        raise ValueError('Hypergraph exceeds incidence limits')
    if any(not isinstance(value, str) or not 0 < len(value) <= 300 for value in ids) or len(set(ids)) != len(ids):
        raise ValueError('Invalid or duplicate article identifiers')
    resolution, trials, seed = payload['resolution'], payload.get('trials', 10), payload.get('seed', 42)
    if not isinstance(resolution, (float, int)) or not math.isfinite(resolution) or resolution <= 0:
        raise ValueError('Invalid bipartite CPM resolution')
    if type(trials) is not int or not 1 <= trials <= 10 or type(seed) is not int or not 1 <= seed <= 2147483637:
        raise ValueError('Invalid optimization starts or seed')
    positions = {value: index for index, value in enumerate(ids)}
    edges, weights = [], []
    for offset, group in enumerate(groups):
        members, weight = group['members'], group['weight']
        if not isinstance(members, list) or any(not isinstance(member, str) or member not in positions for member in members):
            raise ValueError('Unknown hypergraph member')
        if len(members) < 2 or len(set(members)) != len(members) or not isinstance(weight, (float, int)) or not math.isfinite(weight) or weight <= 0:
            raise ValueError('Invalid whole group')
        if len(edges) + len(members) > 200000:
            raise ValueError('Too many incidence memberships; no truncated network was used')
        edges.extend((positions[member], len(ids) + offset) for member in members)
        weights.extend([weight] * len(members))
    if set(positions) != {member for group in groups for member in group['members']}:
        raise ValueError('Unlinked articles must be excluded from incidence inference')
    scale = sum(weights) / len(weights) if weights else 0
    network = ig.Graph(n=len(ids) + len(groups), edges=edges, directed=False)
    network.vs['type'] = [0] * len(ids) + [1] * len(groups)
    network.es['weight'] = [weight / scale for weight in weights]
    best, scores = None, []
    for start in range(seed, seed + trials):
        layers = la.CPMVertexPartition.Bipartite(network, resolution_parameter_01=resolution, resolution_parameter_0=0, resolution_parameter_1=0, weights='weight')
        optimiser = la.Optimiser()
        optimiser.set_rng_seed(start)
        optimiser.optimise_partition_multiplex(layers, layer_weights=[1, -1, -1], n_iterations=-1)
        quality = layers[0].quality() - layers[1].quality() - layers[2].quality()
        scores.append(quality)
        if best is None or quality > best[0]:
            best = (quality, layers[0].membership, start)
    memberships = {}
    for position, article in enumerate(ids):
        memberships.setdefault(best[1][position], []).append(article)
    ordered = sorted(memberships.values(), key=lambda members: (-len(members), members[0]))
    return {'algorithm': 'leiden', 'label': 'Leiden · bipartite CPM', 'networkModel': 'hypergraph', 'modelVersion': 'incidence-v1', 'memberships': {article: position + 1 for position, members in enumerate(ordered) for article in members}, 'clusters': len(ordered), 'resolution': resolution, 'withinClassResolution': [0, 0], 'quality': best[0], 'qualityLabel': 'Bipartite CPM quality (same incidence model and gamma only)', 'objective': 'Bipartite CPM on weighted article–group incidence; zero within-class penalties', 'scale': scale, 'trials': trials, 'seed': best[2], 'startScores': scores, 'engine': 'leidenalg 0.10.2 / igraph ' + ig.__version__, 'groupNodes': len(groups), 'incidences': len(edges)}


lock = threading.Lock()


class Handler(BaseHTTPRequestHandler):
    def respond(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        self.respond(200 if self.path == '/health' else 404, {'ready': self.path == '/health', 'modelVersion': 'incidence-v1', 'serviceAuthentication': bool(os.environ.get('BIBLIOMAP_SERVICE_TOKEN'))})

    def do_POST(self):
        secret = os.environ.get('BIBLIOMAP_SERVICE_TOKEN', '')
        if secret and not hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + secret):
            self.respond(401, {'error': 'Service authentication required'})
            return
        if self.path != '/incidence':
            self.respond(404, {'error': 'Unknown analysis'})
            return
        try:
            length = int(self.headers.get('Content-Length', 0))
            if not 0 < length <= 6000000:
                self.respond(413, {'error': 'Network request is too large'})
                return
            payload = self.rfile.read(length)
            if not lock.acquire(blocking=False):
                self.respond(429, {'error': 'Another bipartite Leiden fit is running. Please retry shortly.'})
                return
            try:
                result = subprocess.run([sys.executable, __file__, '--fit'], input=payload, capture_output=True, timeout=90)
                if result.returncode:
                    self.respond(422, {'error': 'Bipartite Leiden failed. Narrow the scope or check the incidence settings; no pair projection was substituted.'})
                else:
                    self.respond(200, json.loads(result.stdout))
            except subprocess.TimeoutExpired:
                self.respond(408, {'error': 'Bipartite Leiden exceeded 90 seconds. Narrow the scope; no truncated network was used.'})
            finally:
                lock.release()
        except (ValueError, KeyError, TypeError):
            self.respond(400, {'error': 'Invalid incidence request'})


if __name__ == '__main__':
    if '--fit' in sys.argv:
        print(json.dumps(fit(json.load(sys.stdin))))
    else:
        ThreadingHTTPServer(('127.0.0.1', int(os.environ.get('BIBLIOMAP_INCIDENCE_PORT', '8095'))), Handler).serve_forever()

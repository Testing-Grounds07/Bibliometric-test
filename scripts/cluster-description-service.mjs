import http from 'node:http';
import {readFile, writeFile, mkdir, rename, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {equalSecret} from './multiuser/core.mjs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import {DESCRIPTION_VERSION, MODEL_ID, prepareDescription, descriptionMessages, descriptionRepairMessage, groundedSchema, resolveExcerpts, verifiedDescription} from './cluster-description-core.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const publicRoot = path.join(root, 'public/conservative-atlas');
const cacheRoot = path.join(root, '.trials/cluster-descriptions');
const hash = value => createHash('sha256').update(value).digest('hex');
const datasets = {};
const context = {window: {}, atob};
vm.runInNewContext(await readFile(path.join(publicRoot, 'cluster-themes.js'), 'utf8'), context);
const sourceEvidence = JSON.parse(await readFile(path.join(publicRoot, 'source-evidence.json'), 'utf8'));
const expanded = JSON.parse(await readFile(path.join(publicRoot, 'expanded-data.json'), 'utf8'));
for (const kind of ['cocitation', 'coupling']) {
 const raw = await readFile(path.join(publicRoot, kind === 'coupling' ? 'source-cluster-themes.json' : 'cluster-themes.json'), 'utf8');
 datasets[kind] = {data: JSON.parse(raw), revision: hash(raw), ids: new Set((kind === 'coupling' ? sourceEvidence.articles : expanded.base.nodes).map(node => node.id))};
}
const references = Object.fromEntries(sourceEvidence.articles.map(article => [article.id, article.references || []]));
const dynamicDatasets = new Map();
async function datasetFor(input) {
 const baseline = datasets[input.kind];
 if (baseline?.data.sourceCorpusId === input.corpusId) return {...baseline, references};
 if (!['cocitation', 'coupling'].includes(input.kind) || !/^[0-9a-f-]{36}$/.test(input.corpusId || '')) throw new Error('Invalid corpus');
 const folder = path.join(root, '.trials/workspace-corpora', input.corpusId), file = path.join(folder, 'themes.json'), revision = (await stat(file)).mtimeMs;
 const key = input.corpusId + ':' + input.kind, previous = dynamicDatasets.get(key);
 if (previous?.mtime === revision) return previous;
 const raw = await readFile(file, 'utf8'), data = JSON.parse(raw), registry = JSON.parse(await readFile(path.join(folder, 'text-input.json'), 'utf8'));
 if (data.sourceCorpusId !== input.corpusId || registry.sourceCorpusId !== input.corpusId) throw new Error('Corpus evidence mismatch');
 const dataset = {data, revision: hash(raw), mtime: revision, ids: new Set(input.kind === 'coupling' ? registry.sourceIds : registry.referenceIds), references: registry.references};
 dynamicDatasets.set(key, dataset); return dataset;
}
await mkdir(cacheRoot, {recursive: true});
let busy = false;

function canonicalRequest(input, dataset) {
 if (!dataset || input.corpusId !== dataset.data.sourceCorpusId || typeof input.cluster !== 'string' || !Array.isArray(input.nodes) || !input.nodes.length || input.nodes.length > 20000) throw new Error('Invalid cluster scope or corpus');
 const seen = new Set();
 const nodes = input.nodes.map(node => {
  if (!dataset.ids.has(node.id) || seen.has(node.id) || typeof node.cluster !== 'string' || !/^[1-9]\d{0,4}$/.test(node.cluster)) throw new Error('Invalid or duplicate article membership');
  seen.add(node.id); return {id: node.id, cluster: node.cluster};
 }).sort((left, right) => left.id.localeCompare(right.id));
 if (!nodes.some(node => node.cluster === input.cluster)) throw new Error('Selected cluster is empty');
 return {kind: input.kind, corpusId: input.corpusId, cluster: input.cluster, nodes};
}

async function generate(request, signal, dataset) {
 const themes = context.window.ATLAS_THEMES.describe(request.nodes, dataset.data);
 const packet = prepareDescription(request, dataset.data, themes, dataset.references);
 const base = {model: MODEL_ID, version: DESCRIPTION_VERSION, createdAt: new Date().toISOString(), packet, verification: 'Cited IDs and literal excerpts verified; semantic support still requires researcher review. Not a reliability score.'};
 if (packet.coverage.distinctTitles < 2) return {...base, heading: 'Insufficient text evidence', status: 'insufficient-evidence', summary: null, concepts: [], exceptions: [], contrast: null};
 const messages = descriptionMessages(packet);
 for (let attempt = 0; attempt < 2; attempt++) {
  const response = await fetch('http://127.0.0.1:8092/v1/chat/completions', {method: 'POST', signal, headers: {'Content-Type': 'application/json'}, body: JSON.stringify({model: 'bibliomap-cluster-slm', messages, temperature: 0, seed: 42, max_tokens: 2000, response_format: {type: 'json_schema', json_schema: {name: 'cluster_description', strict: true, schema: groundedSchema(packet)}}})});
  if (!response.ok) throw new Error('Local language model is unavailable or busy');
  const completion = await response.json();
  try {
   const result = verifiedDescription(resolveExcerpts(JSON.parse(completion.choices[0].message.content), packet), packet);
   return {...base, ...result, attempts: attempt + 1};
  } catch (error) {
   await writeFile(path.join(cacheRoot, 'rejected-' + hash(JSON.stringify(request)) + '.json'), JSON.stringify({error: error.message, output: completion.choices[0].message.content, packet}, null, 2));
   if (attempt) throw new Error('Generated evidence could not be verified. Keywords remain available.');
   messages.push({role: 'assistant', content: completion.choices[0].message.content}, {role: 'user', content: descriptionRepairMessage(completion.choices[0].message.content, packet, error)});
  }
 }
}

http.createServer(async (request, response) => {
 const send = (status, data) => { if (!response.destroyed) { response.writeHead(status, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}); response.end(JSON.stringify(data)); } };
 if (request.method === 'GET' && request.url === '/health') return send(200, {ready: true, model: MODEL_ID, busy, coverage: Object.fromEntries(Object.entries(datasets).map(([kind, dataset]) => [kind, dataset.data.coverage]))});
 if (request.method !== 'POST' || request.url !== '/describe') return send(404, {error: 'Not found'});
 if (process.env.BIBLIOMAP_SERVICE_TOKEN && !equalSecret(request.headers.authorization, 'Bearer ' + process.env.BIBLIOMAP_SERVICE_TOKEN)) return send(401, {error: 'Service authentication required'});
 const chunks = []; let size = 0;
 try {
  for await (const chunk of request) { size += chunk.length; if (size > 3000000) return send(413, {error: 'Cluster scope is too large'}); chunks.push(chunk); }
  const input = JSON.parse(Buffer.concat(chunks)), dataset = await datasetFor(input), canonical = canonicalRequest(input, dataset);
  const key = hash(JSON.stringify([DESCRIPTION_VERSION, MODEL_ID, dataset.revision, canonical]));
  const file = path.join(cacheRoot, key + '.json');
  if (!input.regenerate) {
   try { return send(200, {...JSON.parse(await readFile(file, 'utf8')), cached: true}); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (busy) return send(429, {error: 'Another cluster is being described. Please retry shortly.'});
  busy = true;
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 180000);
  response.on('close', () => controller.abort());
  try {
   const result = {...await generate(canonical, controller.signal, dataset), cacheKey: key};
   if (!controller.signal.aborted) { await writeFile(file + '.tmp', JSON.stringify(result)); await rename(file + '.tmp', file); }
   send(200, {...result, cached: false});
  } catch (error) { send(503, {error: error.name === 'AbortError' ? 'Description timed out. Keywords remain available.' : error.message}); }
  finally { clearTimeout(timeout); busy = false; }
 } catch { send(400, {error: 'Invalid cluster description request'}); }
}).listen(8093, '127.0.0.1', () => console.log('Grounded cluster descriptions on localhost:8093'));

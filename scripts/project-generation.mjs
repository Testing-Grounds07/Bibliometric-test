import {createHash, randomUUID} from 'node:crypto';
import {readFile, writeFile, mkdir, rename, readdir, copyFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {Worker} from 'node:worker_threads';
import {spawn} from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
export const corpusFolder = id => path.join(root, '.trials/workspace-corpora', id);
export const generationKey = graph => createHash('sha256').update(JSON.stringify([1, graph.threshold, graph.minimumSupport, graph.nodes.map(node => [node.id, node.articles]).sort((left, right) => left[0].localeCompare(right[0]))])).digest('hex');
async function atomic(file, value) { const temporary = file + '.' + randomUUID() + '.tmp'; await writeFile(temporary, JSON.stringify(value)); await rename(temporary, file); }
export async function readGeneration(corpusId, graph) {
 try { return JSON.parse(await readFile(path.join(corpusFolder(corpusId), 'orders-' + generationKey(graph) + '.json'), 'utf8')); }
 catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
const abstract = work => Object.entries(work.abstract_inverted_index || {}).flatMap(([word, offsets]) => offsets.map(offset => [offset, word])).sort((left, right) => left[0] - right[0]).map(([, word]) => word).join(' ');
export async function copyGeneration(sourceId, destinationId) {
 const source = corpusFolder(sourceId), destination = corpusFolder(destinationId);
 let files; try { files = await readdir(source); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
 await mkdir(destination, {recursive: true});
 for (const file of files.filter(file => /^(orders-[0-9a-f]{64}|reference-metadata|themes|text-input)\.json$/.test(file))) {
  if (['themes.json', 'text-input.json'].includes(file)) { const value = JSON.parse(await readFile(path.join(source, file), 'utf8')); value.sourceCorpusId = destinationId; await atomic(path.join(destination, file), value); }
  else await copyFile(path.join(source, file), path.join(destination, file));
 }
}
export function generationText(corpus, graph, metadata, previous) {
 const documents = new Map((previous?.documents || []).map(document => [document.id, document]));
 for (const work of [...corpus.works, ...metadata]) {
  const next = {id: work.id, title: work.display_name || '', abstract: abstract(work)}, old = documents.get(work.id);
  if (!next.title && !next.abstract) continue;
  documents.set(work.id, {id: work.id, title: next.title || old?.title || '', abstract: next.abstract || old?.abstract || ''});
 }
 return {sourceCorpusId: corpus.id, documents: [...documents.values()].sort((left, right) => left.id.localeCompare(right.id)), sourceIds: corpus.works.map(work => work.id), referenceIds: [...new Set([...(previous?.referenceIds || []), ...graph.nodes.map(node => node.id)])].sort(), references: Object.fromEntries(corpus.works.map(work => [work.id, [...new Set(work.referenced_works || [])]]))};
}
async function mine(graph, job) {
 job.controller.signal.throwIfAborted();
 const worker = new Worker(new URL('./project-generation-worker.mjs', import.meta.url), {workerData: {graph}});
 return new Promise((resolve, reject) => {
  let completed = false;
  const abort = () => { worker.terminate(); reject(new Error('Generation cancelled. Previous completed results are retained.')); };
  job.controller.signal.addEventListener('abort', abort, {once: true});
  worker.on('message', message => { if (message.progress) job.message = 'Mining exact combinations · ' + message.progress.bundles.toLocaleString() + ' closed bundles'; if (message.result || message.error) { completed = true; job.controller.signal.removeEventListener('abort', abort); worker.terminate(); message.error ? reject(new Error(message.error)) : resolve(message.result); } });
  worker.on('error', reject); worker.on('exit', code => { if (!completed && !job.controller.signal.aborted) reject(new Error('Higher-order worker stopped (' + code + ').')); });
 });
}
async function keywords(folder, input, job) {
 job.controller.signal.throwIfAborted();
 const output = path.join(folder, 'themes.pending.json'), python = process.env.PYTHON_EXECUTABLE || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
 await atomic(path.join(folder, 'text.pending.json'), input);
 await new Promise((resolve, reject) => {
  const child = spawn(python, ['scripts/build-cluster-themes.py', '--input', path.join(folder, 'text.pending.json'), '--output', output], {cwd: root, windowsHide: true, env: {...process.env, PYTHONIOENCODING: 'utf-8'}});
  let errors = '', timer = setTimeout(() => child.kill(), 1200000);
  const abort = () => child.kill(); job.controller.signal.addEventListener('abort', abort, {once: true});
  child.stdout.on('data', data => { const lines = data.toString().trim().split(/\r?\n/); const line = lines.findLast(value => /^(Embedded|Ranked keywords)/.test(value)); if (line) job.message = line; });
  child.stderr.on('data', data => { errors = (errors + data).slice(-12000); });
  child.on('error', error => { clearTimeout(timer); job.controller.signal.removeEventListener('abort', abort); reject(error); }); child.on('close', code => { clearTimeout(timer); job.controller.signal.removeEventListener('abort', abort); if (code === 0 && !job.controller.signal.aborted) resolve(); else { void writeFile(path.join(folder, 'keywords-error.log'), errors).catch(() => {}); reject(new Error(job.controller.signal.aborted ? 'Generation cancelled. Previous completed results are retained.' : 'Keyword generation failed or reached its time limit. Retry, or use a narrower corpus.')); } });
 });
 job.controller.signal.throwIfAborted();
 const themes = JSON.parse(await readFile(output, 'utf8'));
 if (themes.sourceCorpusId !== input.sourceCorpusId || !themes.documents) throw new Error('Keyword evidence validation failed.');
 await atomic(path.join(folder, 'text-input.json'), input); await rename(output, path.join(folder, 'themes.json'));
}
export async function generateProjectAnalysis(corpus, graph, metadata, job, options = {}) {
 const folder = corpusFolder(corpus.id); await mkdir(folder, {recursive: true});
 let artifact = options.force ? null : await readGeneration(corpus.id, graph);
 if (options.higherOrders !== false && !artifact) {
  job.message = 'Mining exact higher-order co-citation combinations…'; artifact = await mine(graph, job);
  job.controller.signal.throwIfAborted(); artifact.generatedAt = new Date().toISOString();
  await atomic(path.join(folder, 'orders-' + generationKey(graph) + '.json'), artifact);
 }
 if (options.keywords !== false) {
  job.message = 'Preparing titles and available abstracts…';
  let previous; try { previous = JSON.parse(await readFile(path.join(folder, 'text-input.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const input = generationText(corpus, graph, metadata, previous);
  let cached; try { cached = JSON.parse(await readFile(path.join(folder, 'themes.json'), 'utf8')); } catch {}
  if (options.force || !cached?.documents || cached.sourceCorpusId !== corpus.id || JSON.stringify(input) !== JSON.stringify(previous)) await keywords(folder, input, job);
 }
 job.controller.signal.throwIfAborted();
 let themesReady = false; try { themesReady = JSON.parse(await readFile(path.join(folder, 'themes.json'), 'utf8')).sourceCorpusId === corpus.id; } catch {}
 return {corpusId: corpus.id, generationKey: generationKey(graph), maximumOrder: artifact?.maximumOrder || 2, closedBundles: artifact?.bundles.length || 0, higherOrdersReady: !!artifact, themesReady, generatedAt: new Date().toISOString()};
}

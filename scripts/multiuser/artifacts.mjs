import {mkdir, readFile, writeFile, rename, unlink, realpath, readdir, stat} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {canonical, digest, error} from './core.mjs';

export class FileArtifacts {
 constructor(root) { this.root = path.resolve(root); }
 async init(publicRoot) {
  await mkdir(this.root, {recursive: true}); this.root = await realpath(this.root);
  if (publicRoot) { const web = await realpath(publicRoot), relative = path.relative(web, this.root); if (!relative || !relative.startsWith('..') && !path.isAbsolute(relative)) throw error('Artifact storage must be outside the web root.', 500); }
 }
 location(checksum) {
  if (!/^[a-f0-9]{64}$/.test(checksum)) throw error('Invalid artifact checksum.');
  return path.join(this.root, checksum.slice(0, 2), checksum + '.json');
 }
 async put(value) {
  const content = canonical(value), checksum = digest(content), destination = this.location(checksum);
  await mkdir(path.dirname(destination), {recursive: true});
  const temporary = destination + '.' + randomUUID() + '.pending';
  try { await writeFile(temporary, content, {flag: 'wx'}); await rename(temporary, destination); }
  finally { await unlink(temporary).catch(problem => { if (problem.code !== 'ENOENT') throw problem; }); }
  return {checksum, bytes: Buffer.byteLength(content), format: 'json', storage: 'filesystem'};
 }
 async get(checksum) {
  const content = await readFile(this.location(checksum));
  if (digest(content) !== checksum) throw error('Stored artifact failed its integrity check.', 500);
  return JSON.parse(content);
 }
 async files() {
  const result = [];
  for (const folder of await readdir(this.root, {withFileTypes: true})) {
   if (!folder.isDirectory() || !/^[a-f0-9]{2}$/.test(folder.name)) continue;
   for (const file of await readdir(path.join(this.root, folder.name))) if (/^[a-f0-9]{64}\.json$/.test(file)) {
    const checksum = file.slice(0, -5); if (checksum.slice(0, 2) === folder.name) result.push({checksum, bytes: (await stat(this.location(checksum))).size});
   }
  }
  return result;
 }
 async remove(checksum) { await unlink(this.location(checksum)).catch(problem => { if (problem.code !== 'ENOENT') throw problem; }); }
}

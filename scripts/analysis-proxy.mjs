import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {parseWorkspaceRoute} from './workspace-route-path.mjs';

export function publicSupplementTarget(url,method){
 if(method!=='GET'||url.pathname!=='/conservative-atlas/workspace-api/public-collaboration-metadata'||[...url.searchParams.keys()].some(key=>key!=='corpus')||url.searchParams.getAll('corpus').length!==1||! /^[0-9a-f-]{36}$/.test(url.searchParams.get('corpus')||''))return null;
 return '/public-collaboration-metadata?'+new URLSearchParams({corpus:url.searchParams.get('corpus')});
}

export function proxyAnalysis(request, response) {
 const url = new URL(request.url, 'http://localhost'),pathname=url.pathname;
 if(['GET','HEAD'].includes(request.method)&&parseWorkspaceRoute(request.url)){
  readFile(new URL('./site/conservative-atlas/index.html',import.meta.url)).then(content=>{response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});response.end(request.method==='HEAD'?undefined:content);}).catch(()=>{response.writeHead(503);response.end('Workspace is unavailable.');});return true;
 }
 if (pathname.startsWith('/conservative-atlas/workspace-api/')) {
  const supplement=pathname==='/conservative-atlas/workspace-api/public-collaboration-metadata',target=supplement?publicSupplementTarget(url,request.method):pathname.slice('/conservative-atlas/workspace-api'.length);
  const searchExport=/^\/searches\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/export$/.test(target);
  if (supplement?!target:searchExport?request.method!=='GET'||!!url.search:!['GET', 'POST', 'PATCH'].includes(request.method) || !/^\/(projects(?:\/[0-9a-f-]{36})?|search|searches\/[0-9a-f-]{36}|jobs\/[0-9a-f-]{36}(?:\/cancel)?|corpora\/[0-9a-f-]{36}\/themes|generate|map|snapshots(?:\/[0-9a-f-]{36})?|health)$/.test(target)) {
   response.writeHead(400, {'Content-Type': 'application/json'}); response.end(JSON.stringify({error: 'Unsupported project request'})); return true;
  }
  const headers = {'Content-Type': 'application/json'};
  if (request.headers.origin) headers.Origin = request.headers.origin;
  const upstream = http.request({hostname: '127.0.0.1', port: 8094, path: target, method: request.method, headers, timeout: 300000}, result => {
   response.writeHead(result.statusCode, {'Content-Type': 'application/json', 'Cache-Control': 'no-store',...(searchExport?{'X-Content-Type-Options':'nosniff'}:{}),...(searchExport&&result.statusCode===200&&/^attachment; filename="bibliomap-retrieved-sources-[0-9a-f-]{36}\.json"$/.test(result.headers['content-disposition']||'')?{'Content-Disposition':result.headers['content-disposition']}:{})}); result.pipe(response);
  });
  let length = 0, rejected = false;
  request.on('data', chunk => { if(rejected)return;length += chunk.length; if (length > 30000000) { rejected=true;request.unpipe(upstream);if (!response.headersSent) response.writeHead(413, {'Content-Type': 'application/json'}); response.end(JSON.stringify({error: 'Snapshot is too large'}));upstream.destroy(); } });
  upstream.on('timeout', () => upstream.destroy());
  upstream.on('error', () => { if (response.destroyed || response.writableEnded) return; if (!response.headersSent) response.writeHead(503, {'Content-Type': 'application/json'}); response.end(JSON.stringify({error: 'Project service is unavailable. Please retry shortly.'})); });
  response.on('close', () => upstream.destroy()); request.pipe(upstream); return true;
 }
 if (!pathname.startsWith('/conservative-atlas/analysis-api/')) return false;
 const description = pathname === '/conservative-atlas/analysis-api/describe';
 const incidence = pathname === '/conservative-atlas/analysis-api/incidence';
 if ((!description && !incidence && pathname !== '/conservative-atlas/analysis-api/sbm') || request.method !== 'POST' || !request.headers['content-type']?.startsWith('application/json')) {
  response.writeHead(400, {'Content-Type': 'application/json'}); response.end(JSON.stringify({error: 'Unsupported analysis request'})); return true;
 }
 let size = 0, rejected = false;
 const chunks = [];
 request.on('data', chunk => {
  if (rejected) return;
  size += chunk.length;
  if (size > 6000000) { rejected = true; chunks.length = 0; response.writeHead(413, {'Content-Type': 'application/json'}); response.end(JSON.stringify({error: 'Network request is too large'})); return; }
  chunks.push(chunk);
 });
 request.on('end', () => {
  if (rejected) return;
  const upstream = http.request({hostname: '127.0.0.1', port: description ? 8093 : incidence ? 8095 : 8091, path: description ? '/describe' : incidence ? '/incidence' : '/sbm', method: 'POST', headers: {'Content-Type': 'application/json', 'Content-Length': size}, timeout: description ? 185000 : 95000}, result => {
   response.writeHead(result.statusCode, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}); result.pipe(response);
  });
  upstream.on('timeout', () => upstream.destroy(new Error('Analysis timeout')));
  upstream.on('error', () => { if (response.destroyed || response.writableEnded) return; if (!response.headersSent) response.writeHead(503, {'Content-Type': 'application/json'}); response.end(JSON.stringify({error: description ? 'Cluster description service is unavailable. Keywords remain available.' : incidence ? 'Bipartite Leiden service is unavailable. No pair projection was substituted.' : 'Block-model service is unavailable. Please retry later.'})); });
  response.on('close', () => upstream.destroy()); upstream.end(Buffer.concat(chunks));
 });
 return true;
}

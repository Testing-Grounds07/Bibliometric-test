export async function handleGraphApi(store, request, response, parsedUrl, send) {
  const {pathname, query} = parsedUrl;
  if (pathname === '/api/db-integrity' && request.method === 'GET') {
    send(response, 200, 'application/json', JSON.stringify(await store.integrity()));
    return true;
  }
  const match = /^\/api\/(projects|searches|corpora|analyses)(?:\/([0-9a-f-]+))?$/.exec(pathname);
  if (!match) return false;
  const [, kind, id] = match;
  let body = {};
  if (['POST', 'PATCH'].includes(request.method)) {
    let text = '';
    for await (const chunk of request) text += chunk;
    try { body = JSON.parse(text || '{}'); }
    catch { throw Object.assign(new Error('Invalid JSON request'), {status: 400}); }
    if (!body || Array.isArray(body) || typeof body !== 'object') throw Object.assign(new Error('Request must be a JSON object'), {status: 400});
  }
  let data, status = 200;
  if (request.method === 'GET') {
    data = id ? await store.get(kind, id) : {[kind]: await store.list(kind, query.project_id || null)};
    if (!data) { data = {error: 'Not found'}; status = 404; }
  } else if (request.method === 'POST' && !id) {
    data = await store.create(kind, body);
    status = 201;
  } else if (request.method === 'PATCH' && id) {
    data = await store.update(kind, id, body);
    if (!data) { data = {error: 'Not found'}; status = 404; }
  } else if (request.method === 'DELETE' && id) {
    await store.delete(kind, id);
    data = {ok: true};
  } else {
    status = 405;
    data = {error: 'Method not allowed'};
  }
  send(response, status, 'application/json', JSON.stringify(data));
  return true;
}

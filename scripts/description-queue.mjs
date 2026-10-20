export function createDescriptionQueue(execute, changed = () => {}) {
 const records = new Map();
 let scope = '', entries = [], active = null, draining = false;
 const notify = () => changed(entries);
 async function drain() {
  if (draining) return;
  draining = true;
  try {
   while (true) {
    const record = entries.find(record => record.status === 'idle');
    if (!record) break;
    const controller = new AbortController(), startedScope = scope;
    active = {record, controller}; record.status = 'running'; record.error = ''; notify();
    try {
     const result = await execute(record.request, record.regenerate || false, controller.signal);
     if (!controller.signal.aborted && scope === startedScope) { record.result = result; record.status = 'done'; record.regenerate = false; }
    } catch (error) {
     if (!controller.signal.aborted) { record.status = 'error'; record.error = error.message; }
    } finally {
     if (record.status === 'running') record.status = 'idle';
     active = null; notify();
    }
   }
  } finally { draining = false; }
 }
 return {
  seed(request, result) { const key = JSON.stringify(request); if (!records.has(key)) records.set(key, {key, request, status: 'done', result}); },
  activate(key, requests) {
   if (scope !== key) {
    active?.controller.abort(); scope = key;
    entries = requests.map(request => {
     const requestKey = JSON.stringify(request);
     if (!records.has(requestKey)) records.set(requestKey, {key: requestKey, request, status: 'idle', result: null});
     return records.get(requestKey);
    });
   }
   void drain(); return entries;
  },
  stop() { scope = ''; entries = []; active?.controller.abort(); },
  prioritize(record) { if (record.status === 'idle') { entries = [record, ...entries.filter(item => item !== record)]; void drain(); } },
  retry(record, regenerate = false) { if (record.status === 'running') return; record.status = 'idle'; record.regenerate = regenerate; record.error = ''; this.prioritize(record); },
  cancel(record) { record.status = 'cancelled'; record.error = 'Cancelled. Keywords and any previous description remain available.'; if (active?.record === record) active.controller.abort(); notify(); },
  entries: () => entries,
  lookup: request => records.get(JSON.stringify(request)) || null
 };
}

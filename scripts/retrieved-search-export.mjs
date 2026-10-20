const fail = (message, status = 400) => { throw Object.assign(new Error(message), {status}); };

export async function retrievedSearchExport(id, required) {
 if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) fail('Choose a saved search.');
 const search = await required('searches', id);
 if (!search || search.id !== id) fail('Saved search was not found.', 404);
 const project = await required('projects', search.project_id);
 if (!project || project.id !== search.project_id) fail('The saved search project was not found.', 404);
 if (!Array.isArray(search.result_snapshot?.works)) fail('This historical search has no retained source records to export.', 409);
 const pagination = search.result_snapshot.pagination || search.query?.pagination || null;
 return {version:'bibliomap-retrieved-sources-v1',project:{id:project.id,name:project.name},search:{id:search.id,name:search.name,created_at:search.created_at},query:search.query,result_count:search.result_count,result_snapshot:search.result_snapshot,pagination,storedRecords:search.result_snapshot.works.length,cursorCompletionVerified:pagination?.version==='openalex-pagination-v1'&&pagination.terminalCursorNull===true&&pagination.stopReason==='cursor-exhausted'?true:pagination?false:null,scope:'All retained search source records before corpus presets and DOI/title identity cleanup. Repeated exact work IDs were collapsed during retrieval; this is not a raw response-page archive. Historical pagination without an audit remains unverified.'};
}

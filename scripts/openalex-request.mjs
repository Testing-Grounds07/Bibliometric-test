export const OPENALEX_WORK_SELECT = 'id,doi,display_name,publication_date,publication_year,cited_by_count,authorships,primary_location,topics,open_access,referenced_works,referenced_works_count,abstract_inverted_index,keywords,type,language,is_retracted,institutions_distinct_count';

export async function fetchOpenAlexWorks(parameters, options = {}) {
 const headers = {'User-Agent': options.userAgent || 'BiblioMap/0.3'};
 if (options.apiKey) headers.Authorization = 'Bearer ' + options.apiKey;
 const response = await (options.fetch || fetch)('https://api.openalex.org/works?' + new URLSearchParams(parameters), {headers, signal: options.signal || AbortSignal.timeout(45000)});
 if (!response.ok) {
  let metadataFieldError = false;
  if (response.status === 400) try { const body = await response.json(); metadataFieldError = typeof body.message === 'string' && /^[a-z][a-z0-9_]* is not a valid select field\./i.test(body.message); } catch {}
  const message = response.status === 400 ? metadataFieldError ? 'OpenAlex rejected a requested metadata field (400). Ask the administrator to update the metadata field configuration; retrying unchanged will not help.' : 'OpenAlex rejected the search request (400). Check the query and requested metadata configuration before retrying.' : 'OpenAlex request failed (' + response.status + '). ' + ([429, 500, 502, 503, 504].includes(response.status) ? 'Try again later.' : 'Check access and request configuration before retrying.');
  const problem = Object.assign(new Error(message), {status: 502, transient: [429, 500, 502, 503, 504].includes(response.status)}), retry = response.headers.get('retry-after');
  problem.retryAfter = Math.max(0, Number(retry) || Math.ceil((Date.parse(retry) - Date.now()) / 1000) || 0) || (response.status === 429 ? 30 : 0);
  throw problem;
 }
 return response.json();
}

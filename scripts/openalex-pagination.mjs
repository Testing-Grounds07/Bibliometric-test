import {createHash} from 'node:crypto';

const fingerprint = value => createHash('sha256').update(value).digest('hex');
const invalid = message => { throw new Error('OpenAlex pagination could not be verified. ' + message); };

export function createPaginationAudit(previous, legacy = {}) {
 if (previous) {
  if (previous.version !== 'openalex-pagination-v1' || !Array.isArray(previous.pages)) invalid('Restart this retrieval with the current pagination checks.');
  const last = previous.pages.at(-1);
  if (previous.terminalCursorNull && (!last || last.nextCursorFingerprint !== null || previous.stopReason !== 'cursor-exhausted')) invalid('The saved terminal cursor is not supported by its page audit.');
  return structuredClone(previous);
 }
 return {version:'openalex-pagination-v1',rawRows:legacy.rawRows||0,uniqueRecords:legacy.uniqueRecords||0,duplicateRows:(legacy.rawRows||0)-(legacy.uniqueRecords||0),initialTotal:null,firstAuditedTotal:null,latestTotal:legacy.latestTotal??null,countChanged:false,priorPagesUnaudited:legacy.pages||0,pages:[],terminalCursorNull:false,stopReason:'pending',duplicatePolicy:'Repeated exact work IDs collapse to the last returned observation. DOI and title identity cleanup is separate.'};
}

export function acceptPaginationPage(audit, response, requestedCursor, works) {
 if (typeof requestedCursor !== 'string' || !requestedCursor) invalid('The saved cursor is unavailable; restart this retrieval.');
 if (!Array.isArray(response?.results) || !Number.isInteger(response.meta?.count) || response.meta.count < 0 || response.results.some(work => !work || typeof work.id !== 'string' || !work.id.trim())) invalid('The provider returned an invalid page.');
 const next = response.meta.next_cursor;
 if (next !== null && (typeof next !== 'string' || !next.trim())) invalid('The provider did not supply a valid next cursor.');
 const requestedFingerprint = fingerprint(requestedCursor), nextFingerprint = next === null ? null : fingerprint(next);
 if (audit.pages.length && audit.pages.at(-1).nextCursorFingerprint !== requestedFingerprint) invalid('The requested cursor does not match the retained page audit.');
 if (audit.pages.some(page => page.requestCursorFingerprint === requestedFingerprint) || nextFingerprint === requestedFingerprint || nextFingerprint && audit.pages.some(page => page.requestCursorFingerprint === nextFingerprint)) invalid('The provider repeated a cursor; no complete result was published.');
 const before = works.size;
 for (const work of response.results) works.set(work.id, work);
 if (!audit.priorPagesUnaudited) audit.initialTotal ??= response.meta.count;
 audit.firstAuditedTotal ??= response.meta.count;
 audit.countChanged ||= audit.latestTotal !== null && audit.latestTotal !== response.meta.count;
 audit.latestTotal = response.meta.count;
 audit.rawRows += response.results.length;
 audit.uniqueRecords = works.size;
 audit.duplicateRows = audit.rawRows - audit.uniqueRecords;
 audit.pages.push({page:audit.priorPagesUnaudited+audit.pages.length+1,rows:response.results.length,uniqueAdded:works.size-before,total:response.meta.count,requestCursorFingerprint:requestedFingerprint,nextCursorFingerprint:nextFingerprint,responseChecksum:fingerprint(JSON.stringify(response)),checksumDefinition:'SHA-256 of the parsed response serialized as JSON'});
 audit.terminalCursorNull = next === null;
 audit.stopReason = next === null ? 'cursor-exhausted' : 'pending';
 return next;
}

export function finishPaginationAudit(audit, limit) {
 if (!audit.terminalCursorNull && audit.uniqueRecords >= limit) audit.stopReason = 'result-limit';
 return audit;
}

export const DEDUPLICATION_VERSION = 1;

export function normalizedTitle(value) {
 return String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

const titleOf = work => work.display_name || work.title || '';
const authorsOf = work => work.authorships?.map(entry => entry.author?.display_name).filter(Boolean) || (typeof work.authors === 'string' ? work.authors.split(';').map(value => value.trim()).filter(Boolean) : []);
const doiOf = work => String(work.doi || '').toLowerCase().replace(/^https?:\/\/(dx\.)?doi.org\//, '').trim().replace(/^10\.1037\/\//, '10.1037/');
const yearOf = work => work.publication_year || work.year || null;
const family = work => ['book', 'monograph', 'edited-book'].includes(work.type) ? 'book' : work.type || 'unknown';

function nearTitle(first, second) {
 if (first === second) return true;
 if (JSON.stringify(first.match(/\d+/g)) !== JSON.stringify(second.match(/\d+/g))) return false;
 if (Math.min(first.length, second.length) < 60 || Math.abs(first.length - second.length) > 2) return false;
 const firstWords = first.split(' '), secondWords = second.split(' ');
 if (firstWords.length < 8 || firstWords.length !== secondWords.length || firstWords.some((word, position) => /^\d+$/.test(word) && word !== secondWords[position])) return false;
 let previous = Array.from({length: second.length + 1}, (_, position) => position);
 for (let position = 1; position <= first.length; position++) {
  const current = [position];
  for (let offset = 1; offset <= second.length; offset++) current[offset] = Math.min(current[offset - 1] + 1, previous[offset] + 1, previous[offset - 1] + (first[position - 1] === second[offset - 1] ? 0 : 1));
  previous = current;
 }
 return previous[second.length] <= 2;
}

export function duplicateReason(first, second) {
 if (doiOf(first) && doiOf(first) === doiOf(second)) return 'Same DOI';
 const title = normalizedTitle(titleOf(first)), other = normalizedTitle(titleOf(second));
 if (title.length < 20 || title.split(' ').length < 3 || !nearTitle(title, other)) return null;
 if (title !== other && doiOf(first) && doiOf(second)) return null;
 const authors = authorsOf(first).map(normalizedTitle), otherAuthors = authorsOf(second).map(normalizedTitle);
 if (!authors.length || JSON.stringify(authors) !== JSON.stringify(otherAuthors)) return null;
 const kind = family(first), otherKind = family(second);
 const publisherAlias = title === other && [doiOf(first), doiOf(second)].some(doi => doi.startsWith('10.2307/')) && [doiOf(first), doiOf(second)].some(doi => doi.startsWith('10.5465/'));
 if (kind === 'review' || otherKind === 'review' || (!publisherAlias && (kind !== otherKind || kind === 'unknown'))) return null;
 if (!publisherAlias && kind !== 'book' && doiOf(first) && doiOf(second)) return null;
 const year = yearOf(first), otherYear = yearOf(second);
 if (kind !== 'book' && year && otherYear && Math.abs(year - otherYear) > 2) return null;
 return publisherAlias ? 'Matching title, authors and years across JSTOR / Academy of Management DOI aliases' : title === other ? 'Matching normalized title and authors' : 'Near-identical title (at most two character edits) and matching authors';
}

export function deduplicateWorks(works, metadata = []) {
 const records = new Map();
 for (const work of [...metadata, ...works]) records.set(work.id, {...records.get(work.id), ...work});
 const ordered = [...records.values()].sort((first, second) => (yearOf(first) || Infinity) - (yearOf(second) || Infinity) || first.id.localeCompare(second.id));
 const groups = [], buckets = new Map(), doiGroups = new Map(), aliases = {};
 for (const work of ordered) {
  const authors = authorsOf(work).map(normalizedTitle).join('|'), doi = doiOf(work);
  const candidates = new Set([...(buckets.get(authors) || []), ...(doi && doiGroups.has(doi) ? [doiGroups.get(doi)] : [])]);
  let group = [...candidates].find(candidate => candidate.records.every(member => duplicateReason(member, work)));
  if (!group) { group = {canonicalId: work.id, records: []}; groups.push(group); if (authors) { if (!buckets.has(authors)) buckets.set(authors, []); buckets.get(authors).push(group); } }
  group.records.push(work); if (doi) doiGroups.set(doi, group); aliases[work.id] = group.canonicalId;
 }
 const canonical = new Map(), merged = [];
 for (const group of groups) {
  const work = group.records[0], years = [...new Set(group.records.flatMap(record => record.years || [yearOf(record)]).filter(Boolean))].sort((first, second) => first - second);
  const variants = [...new Map(group.records.flatMap(record => record.mergedRecords || [{id: record.id, title: titleOf(record), year: yearOf(record), doi: record.doi || null}]).map(record => [record.id, record])).values()];
  const next = {...work, years, yearLabel: years.join(' / '), variants: [...new Set(variants.map(record => record.id))], mergedRecords: variants, referenced_works: [...new Set(group.records.flatMap(record => record.referenced_works || record.references || []).map(id => aliases[id] || id))]};
  if (variants.length > 1) {
   next.deduplicationNote = `${variants.length} records combined; recorded years: ${next.yearLabel || 'unknown'}. Original IDs and DOIs retained.`;
   merged.push({canonicalId: work.id, years, records: variants, reason: group.records.length > 1 ? duplicateReason(work, group.records[1]) : 'Previously combined records'});
  }
  canonical.set(work.id, next);
 }
 const sourceIds = [...new Set(works.map(work => aliases[work.id]))];
 const result = sourceIds.map(id => canonical.get(id));
 return {works: result, metadata: [...canonical.values()], aliases, audit: {version: DEDUPLICATION_VERSION, policy: 'Conservative title-and-author matching; long-title typo tolerance is two character edits. Books may combine recorded years. Conflicting article DOIs stay separate except matching JSTOR / Academy of Management aliases. Reviews, unknown publication types, conflicting authors, materially different titles and unresolved IDs stay separate without a shared DOI. Counts use distinct canonical source works.', originalSources: works.length, sources: result.length, mergedGroups: merged, metadataRecords: records.size}};
}

export function applyWorkIdentity(works, audit) {
 const aliases = new Map(audit.mergedGroups.flatMap(group => group.records.map(record => [record.id, group.canonicalId])));
 const summaries = new Map(audit.mergedGroups.map(group => [group.canonicalId, group]));
 const grouped = new Map();
 for (const work of works) { const id = aliases.get(work.id) || work.id; if (!grouped.has(id)) grouped.set(id, []); grouped.get(id).push(work); }
 return [...grouped].map(([id, records]) => {
  const first = records.find(record => record.id === id) || records[0], summary = summaries.get(id);
  const years = summary?.years || first.years || [yearOf(first)].filter(Boolean), mergedRecords = summary?.records || first.mergedRecords || [{id, title: titleOf(first), year: yearOf(first), doi: first.doi || null}];
  return {...first, id, years, yearLabel: years.join(' / '), variants: mergedRecords.map(record => record.id), mergedRecords, ...(summary ? {deduplicationNote: `${summary.records.length} records combined; recorded years: ${summary.years.join(' / ') || 'unknown'}. Original IDs and DOIs retained.`} : {}), referenced_works: [...new Set(records.flatMap(record => record.referenced_works || []).map(reference => aliases.get(reference) || reference))]};
 });
}

export function referenceMetadataCandidates(works, threshold, limit = 5000) {
 const counts = new Map(), minimum = Math.max(1, Math.floor(Number(threshold || 10) / 2));
 for (const work of deduplicateWorks(works).works) for (const id of new Set(work.referenced_works || [])) counts.set(id, (counts.get(id) || 0) + 1);
 const candidates = [...counts].filter(([, count]) => count >= minimum).sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]));
 return {ids: candidates.slice(0, limit).map(([id]) => id), candidates: candidates.length, minimumFrequency: minimum, limit};
}

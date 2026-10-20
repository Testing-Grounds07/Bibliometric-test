const minorWords = new Set('a an and as at but by for if in nor of on or per the to up via vs yet'.split(' '));
const preferredCase = new Map(['AI', 'ML', 'NLP', 'LLM', 'SLM', 'CPM', 'SEM', 'PLS', 'PLS-SEM', 'CB-SEM', 'TF-IDF', 'c-TF-IDF', 'HIV', 'COVID', 'COVID-19', 'OECD', 'HRM', 'PRISMA', 'MiniLM', 'KeyBERT', 'BERTopic', 'OpenAlex', 'Neo4j'].map(word => [word.toLowerCase(), word]));
const words = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*(?:[-‑][\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*)*/gu;

export function titleCase(value) {
 return String(value ?? '').split(/([·:;!?/])/u).map(segment => {
  const matches = [...segment.matchAll(words)], allCaps = segment === segment.toUpperCase();
  let position = 0, output = '';
  for (const [index, match] of matches.entries()) {
   const word = match[0], preferred = preferredCase.get(word.toLowerCase());
   const parts = word.split(/([-‑])/u);
   const formatted = preferred || parts.map((part, partIndex) => {
    if (part === '-' || part === '‑') return part;
    const lower = part.toLowerCase(), canonical = preferredCase.get(lower);
    if (canonical) return canonical;
    if (!allCaps && (/^\p{Lu}{2,}$/u.test(part) || /\p{Ll}.*\p{Lu}/u.test(part))) return part;
    const boundary = index === 0 && partIndex === 0 || index === matches.length - 1 && partIndex === parts.length - 1;
    return !boundary && minorWords.has(lower) ? lower : lower.replace(/\p{L}/u, letter => letter.toUpperCase());
   }).join('');
   output += segment.slice(position, match.index) + formatted; position = match.index + word.length;
  }
  return output + segment.slice(position);
 }).join('');
}

if (typeof window !== 'undefined') window.ATLAS_LABELS = {titleCase};

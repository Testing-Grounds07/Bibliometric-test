import base64
from collections import Counter
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import re
import sqlite3
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.trials/semantic-dependencies'))
os.environ.setdefault('HF_HOME', str(ROOT / '.trials/semantic-models'))
os.environ.setdefault('HF_HUB_DISABLE_SYMLINKS_WARNING', '1')
import numpy as np
import torch
from huggingface_hub import HfApi
from keybert import KeyBERT
from sentence_transformers import SentenceTransformer
from sklearn.feature_extraction.text import CountVectorizer, ENGLISH_STOP_WORDS

MODEL = 'sentence-transformers/all-MiniLM-L6-v2'
STOPWORDS = set(ENGLISH_STOP_WORDS)
WORD = re.compile(r"\b[^\W\d_]+(?:[-’'][^\W\d_]+)*\b", re.UNICODE)


def phrases_with_spans(value):
    words = list(WORD.finditer(value))
    result = {}
    for position, first in enumerate(words):
        if first.group().lower() in STOPWORDS or len(first.group()) < 3:
            continue
        for size in range(1, 5):
            group = words[position:position + size]
            if len(group) != size:
                break
            last = group[-1]
            if last.group().lower() in STOPWORDS:
                continue
            if any(not value[left.end():right.start()].isspace() or '\n' in value[left.end():right.start()] for left, right in zip(group, group[1:])):
                continue
            phrase = ' '.join(word.group().lower() for word in group)
            result.setdefault(phrase, []).append((first.start(), last.end()))
    return result


def analyzer(value):
    return [phrase for phrase, spans in phrases_with_spans(value).items() for _ in spans]


def reconstruct(index):
    if not index:
        return ''
    ordered = sorted((position, word) for word, positions in index.items() for position in positions)
    return ' '.join(word for _, word in ordered)


def cache_document_provenance(custom, source_mode):
    if custom:
        return {'documentUnit': 'mixed supplied source and cited-reference documents', 'textScope': 'Supplied titles and available supplied abstracts; missing abstracts are not synthesized.'}
    return {'documentUnit': 'source articles' if source_mode else 'cited references', 'textScope': 'Source titles and available cached OpenAlex abstracts; missing abstracts are not synthesized.' if source_mode else 'Cited-reference titles and available cached OpenAlex abstracts; missing abstracts are not synthesized.'}


def main():
    folder = Path(sys.argv[sys.argv.index('--cache-root') + 1]).resolve() if '--cache-root' in sys.argv else ROOT / '.trials/conservative-cocitation'
    folder.mkdir(parents=True, exist_ok=True)
    custom = json.loads(Path(sys.argv[sys.argv.index('--input') + 1]).read_text(encoding='utf-8')) if '--input' in sys.argv else None
    expanded = {'sourceCorpusId': custom['sourceCorpusId'], 'base': {'nodes': [{'id': document['id']} for document in custom['documents']]}} if custom else json.loads((ROOT / 'public/conservative-atlas/expanded-data.json').read_text(encoding='utf-8'))
    source_mode = '--sources' in sys.argv
    if source_mode and not custom:
        sources = json.loads((ROOT / 'public/conservative-atlas/source-evidence.json').read_text(encoding='utf-8'))
        expanded = {'sourceCorpusId': sources['sourceCorpusId'], 'base': {'nodes': [{'id': article['id'], 'key': article['id']} for article in sources['articles']]}}
    metadata = {} if custom else {work['id']: work for work in json.loads((ROOT / '.trials/adaptive-leadership-full/works.json').read_text(encoding='utf-8'))}
    for pattern in ([] if custom else ['reference-metadata-*.json', 'expanded-metadata-*.json']):
        for path in sorted(folder.glob(pattern)):
            for work in json.loads(path.read_text(encoding='utf-8'))['results']:
                metadata[work['id']] = {**metadata.get(work['id'], {}), **{key: value for key, value in work.items() if value is not None}}
    documents = []
    for node in ([] if custom else expanded['base']['nodes']):
        work = metadata.get(node['key'], {})
        title = (work.get('display_name') or '').strip()
        abstract = reconstruct(work.get('abstract_inverted_index'))
        if title or abstract:
            documents.append({'id': node['id'], 'title': title, 'abstract': abstract})
    if custom:
        documents = [document for document in custom['documents'] if (document.get('title', '') + document.get('abstract', '')).strip()]
    elif source_mode:
        documents = [{'id': article['id'], 'title': article['title'].strip(), 'abstract': reconstruct(metadata.get(article['id'], {}).get('abstract_inverted_index'))} for article in sources['articles'] if article.get('title', '').strip()]
    if not documents:
        raise ValueError('No article titles or abstracts are available for keyword generation.')
    manifest_path = folder / 'theme-model.json'
    requested_revision = sys.argv[sys.argv.index('--model-revision') + 1] if '--model-revision' in sys.argv else None
    manifest = {'model': MODEL, 'revision': requested_revision} if requested_revision else json.loads(manifest_path.read_text()) if manifest_path.exists() else {'model': MODEL, 'revision': HfApi().model_info(MODEL).sha}
    if not manifest_path.exists():
        manifest_path.write_text(json.dumps(manifest), encoding='utf-8')
    torch.set_num_threads(4)
    model = SentenceTransformer(MODEL, revision=manifest['revision'], device='cpu', trust_remote_code=False)
    extractor = KeyBERT(model=model)
    cache = sqlite3.connect(folder / 'theme-embeddings.sqlite')
    cache.execute('CREATE TABLE IF NOT EXISTS embeddings (key TEXT PRIMARY KEY, vector BLOB NOT NULL)')

    def encode_cached(texts):
        keys = [hashlib.sha256((MODEL + manifest['revision'] + text).encode()).hexdigest() for text in texts]
        vectors, missing = {}, {}
        for key, value in zip(keys, texts):
            row = cache.execute('SELECT vector FROM embeddings WHERE key=?', (key,)).fetchone()
            if row:
                vectors[key] = np.frombuffer(row[0], dtype=np.float32)
            else:
                missing[key] = value
        items = list(missing.items())
        for offset in range(0, len(items), 256):
            batch = items[offset:offset + 256]
            encoded = model.encode([value for _, value in batch], normalize_embeddings=True, batch_size=32, show_progress_bar=False)
            for (key, _), vector in zip(batch, encoded):
                vector = np.asarray(vector, dtype=np.float32)
                vectors[key] = vector
                cache.execute('INSERT OR REPLACE INTO embeddings VALUES (?,?)', (key, vector.tobytes()))
            cache.commit()
            print(f'Embedded {min(offset + 256, len(items))}/{len(items)} uncached texts', flush=True)
        return np.asarray([vectors[key] for key in keys])

    texts = [document['title'] + '\n' + document['abstract'] for document in documents]
    chunks, ranges = [], []
    for value in texts:
        tokens = model.tokenizer.encode(value, add_special_tokens=False, truncation=False)
        start = len(chunks)
        chunks.extend(model.tokenizer.decode(tokens[offset:offset + 240]) for offset in range(0, len(tokens), 240))
        ranges.append((start, len(chunks)))
    chunk_vectors = encode_cached(chunks)
    document_vectors = np.asarray([chunk_vectors[start:end].mean(axis=0) for start, end in ranges])
    document_vectors /= np.maximum(np.linalg.norm(document_vectors, axis=1, keepdims=True), 1e-12)
    frequency = Counter(phrase for value in texts for phrase in phrases_with_spans(value))
    title_terms = {phrase for document in documents for phrase in phrases_with_spans(document['title'])}
    vocabulary_terms = sorted(phrase for phrase, count in frequency.items() if count >= 2 or phrase in title_terms)
    vectorizer = CountVectorizer(analyzer=analyzer, lowercase=False, vocabulary=vocabulary_terms)
    if vocabulary_terms:
        vectorizer.fit(texts)
    vocabulary = vectorizer.get_feature_names_out() if vocabulary_terms else []
    word_vectors = encode_cached(list(vocabulary)) if vocabulary_terms else None
    keywords = []
    for offset in range(0, len(texts), 16):
        batch_keywords = extractor.extract_keywords(texts[offset:offset + 16], vectorizer=vectorizer, doc_embeddings=document_vectors[offset:offset + 16], word_embeddings=word_vectors, top_n=20, use_mmr=True, diversity=0.3) if vocabulary_terms else [[] for value in texts[offset:offset + 16]]
        if len(texts[offset:offset + 16]) == 1 and (not batch_keywords or isinstance(batch_keywords[0], tuple)):
            batch_keywords = [batch_keywords]
        keywords.extend(batch_keywords)
        print(f'Ranked keywords for {min(offset + 16, len(texts))}/{len(texts)} documents', flush=True)
    for document, vector, phrases in zip(documents, document_vectors, keywords):
        document['embedding'] = base64.b64encode(np.rint(np.clip(vector, -1, 1) * 127).astype(np.int8).tobytes()).decode()
        document['phrases'] = []
        fields = {field: phrases_with_spans(document[field]) for field in ['title', 'abstract']}
        for phrase, semantic in phrases:
            evidence = [{'field': field, 'start': start, 'end': end} for field, terms in fields.items() for start, end in terms.get(phrase, [])]
            if evidence:
                document['phrases'].append({'text': phrase, 'semantic': float(semantic), 'count': len(evidence), 'evidence': evidence[:3]})
    result = {'version': 1, 'sourceCorpusId': expanded['sourceCorpusId'], **manifest, 'dimensions': 384, 'encoding': 'signed-int8-base64-unit-vector', 'documents': {document['id']: document for document in documents}, 'coverage': {'references': len(expanded['base']['nodes']), 'withText': len(documents), 'withAbstract': sum(bool(document['abstract']) for document in documents)}, 'packages': {name: importlib.metadata.version(name) for name in ['keybert', 'sentence-transformers', 'transformers', 'torch']}, 'method': 'MiniLM chunk-mean document embeddings; KeyBERT MMR (diversity 0.3), up to 20 verbatim 1–4-word candidate phrases per reference. English stop words; no author text. Browser cluster scoring is c-TF-IDF-inspired, weighted by cached phrase relevance and sibling specificity. No generative labels or changes to Leiden membership.'}
    result.update(cache_document_provenance(custom, source_mode))
    output = Path(sys.argv[sys.argv.index('--output') + 1]) if custom else ROOT / ('public/conservative-atlas/source-cluster-themes.json' if source_mode else 'public/conservative-atlas/cluster-themes.json')
    output.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(json.dumps({'output': str(output), 'bytes': output.stat().st_size, **result['coverage']}), flush=True)
    cache.close()


if __name__ == '__main__':
    main()

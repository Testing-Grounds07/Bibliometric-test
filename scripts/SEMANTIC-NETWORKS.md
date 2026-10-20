# Semantic maps

These views share the existing canvas, cluster strip, search, filters, camera and findings. They do not replace citation analyses.

## Three different relationships

- **Literal term co-occurrence:** nodes are observed one-to-three-word phrases. English stop words, numeric-only tokens and punctuation-crossing phrases are excluded. No stemming, generated concepts or synonym merging is performed. Spans use UTF-16 offsets into whitespace-normalized source text. Both raw support and full-count analytical weight count distinct sources containing the two terms.
- **OpenAlex topic co-occurrence:** nodes are retained machine-assigned topic IDs, not author keywords or legacy concepts. Raw support counts distinct sources; analytical weight sums the two topic-confidence products within each source. Retrieval pins the assignments, but their classifier release is unknown unless separately recorded.
- **MiniLM source-text similarity:** nodes are source articles. Edges use cosine similarity of actual cached, normalized 384-dimensional signed-int8 MiniLM vectors. Raw citation support is explicitly null, not one. Node size is equal, not citation impact. The pinned model revision and exact text are required; no bag-of-words fallback or model download occurs in this operation.

Term/topic vocabularies select the explicitly requested number of features by distinct source support. Every supplied source contributes; this is not a source sample. Large inputs fail with a stated budget instead of silently truncating evidence. Exact embedding comparisons support up to 3,000 sources and 100,000 retained lines.

## Text provenance

Source titles and abstracts must exactly match the normalized embedding input. Missing or stale caches are unavailable. Legacy slim source records may omit abstracts that exist in the prepared source cache. The optional **Use prepared cached abstracts** control pins that separate cache and checksum after matching corpus IDs, source IDs and titles; retained abstract mismatches fail. This is supplemental prepared-text evidence, not verification of historical snapshot abstracts. Coverage distinguishes the original records from supplemental text.

Custom keyword preparation records mixed supplied source/reference documents, their supplied text scope, model revision, dimensions and encoding. Private stages authorize existing keyword artifacts, check pinned evidence and text versions, select only source IDs and keep artifacts in their original public/project-private eligibility scope.

## Clustering and validation

These views currently use three-start Leiden CPM on their explicit pair network. Existing mean-edge scaling applies. Citation score/model controls are disabled rather than silently switching back to citations. Feature headings are deterministic observations; feature IDs never enter article/Qwen endpoints. Source-article similarity retains existing source keyword/Qwen explanations with their normal grounding limits.

Citation bootstrap, citation-margin nulls, citation Auto CPM and citation drill-downs are not defined for these graphs. A bounded semantic check instead varies source-support thresholds, topic confidence, title versus available-abstract evidence, or embedding cosine thresholds. It never claims an alternative model was tested. Fixed CPM can confound construction and scale; sensitivity is not significance, a best-setting claim, thematic validity or screening relevance.

## Linked views and persistence

Source coupling versus source embeddings is compared only on exact common source IDs, with unassigned articles treated as separate singletons. Reports include assigned coverage, excluded IDs and trivial-partition warnings. ARI is descriptive agreement, not validation. Reference and source partitions are never compared using ARI.

A retained parent co-citation scope can be crosswalked to a selected semantic cluster through actual source-reference incidence. Supporting-source counts overlap and must not be added. Inspectors expose the source IDs and navigation back to available parent references; complete crosswalks can be exported.

Legacy findings retain semantic construction, text pins, entities and manifests. Protected durable stages retain semantic networks, sensitivity and common-source comparisons with normal authorization, cancellation, jobs and immutable-result handling. Term/topic native nodes are scoped features, never globally registered scholarly works.

Focused checks: `node --test scripts/semantic-network.test.mjs scripts/semantic-cache-schema.test.mjs scripts/semantic-canvas.test.mjs scripts/multiuser/semantic.test.mjs`. Disposable integration tests require the separately configured test database and exclusive worker window; never point them at research data.

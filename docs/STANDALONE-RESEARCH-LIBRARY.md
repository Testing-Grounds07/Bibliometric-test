# Standalone research library

The **Projects** panel in `/conservative-atlas/` keeps all four retained studies in one saved project, **AI project · Leadership research**. Its **Saved maps** section contains all 13 maps, each with an explicit **Open map** button and separate **Notes** disclosure; **Reports & supporting files** contains the four studies’ reports, downloads and review limits. There is no separate study-catalog navigation tool:

- Adaptive leadership: academic themes, including the original bibliographic coupling map.
- Adaptive leadership: network and text comparisons, including reference ablations and retained text-neighbor and seed comparisons.
- Adaptive leadership: seminal articles and foundations, with ten provisional reading priorities, citation/coupling evidence and a separate contextual reference register. This study reuses the original coupling map for context and creates no additional map. It does not establish a definitive historical ranking or merge editions and cited IDs.
- Leadership training: how effectiveness is assessed, a source-based synthesis without a constructed network.

The library includes the original accepted HTML reports, selected tables and source metadata, result ZIPs, curated review provenance, and the authored leadership evaluation PDF. `public/conservative-atlas/ai-research/library.json` records the file hashes, evidence limits, and project/map links. Raw acquired papers, provider logs, credentials, and operator files are excluded.

The public full-text appraisal JSON is an explicitly labelled derivative: acquired-paper quotation spans are omitted, while source hashes, line locators and appraisals are retained. Its curation notice identifies the unchanged original artifact. The result ZIP contains this public derivative, and the original research files remain local.

## Imported maps

All retained studies share one project with 13 saved maps. The original map, search and corpus identities are retained. The seminal-article guide reuses the original coupling map; the training evaluation remains a source-only report and has no invented network. The coupling baseline retains all 951 works, 10,891 edges and 655 isolates. Text maps retain the final 459 eligible works; 461 documents were encoded during the original study. Reference-ablation corpora record only the declared reference deletions. Comparison reports retain their own common-node restrictions.

The combined project retains the original thematic project's identity. The other two empty project containers were removed after their records were moved and backed up. Historical links containing either removed project ID must be reopened through the combined project; the old container IDs do not redirect. Saved map IDs and current report links are retained.

The import preserves original node identities, edge weights, support counts, and engine memberships. Original engine identifiers and community labels remain available separately from display identifiers and colors. Isolates remain in the analytical graph even when hidden by the display filter. Display community labels are not academic theme judgments.

These maps use the original Leiden **modularity** objective and retained seeds and iteration counts. Their networks are frozen: opening them does not retrieve new source records, refit communities, run reliability checks or change the retained scientific result. Matching cached keywords load from the exact saved source corpus; Qwen naming then uses the ordinary automatic queue once navigation has settled on that map. **Reload keywords** retries the bound cache. Existing pause, retry and rerun controls remain available. These are current interpretation overlays, not the original report or its review approval. Malformed or gapped abstracts are omitted with coverage disclosed, and missing text is never filled from another corpus. Native rebuilding and CPM controls remain disabled. Display filters, label modes, zoom and layout remain available. Open an ordinary map to perform a separate native analysis.

## Review and verification

Original reports and supporting artifacts remain unchanged. The import was independently checked against the retained computations, including all 13 edge and membership tables and six complete stored corpora. The six pre-existing projects and their histories were checked for equality before and after the additive import. Browser checks cover the three reports, all 13 maps, library layout on desktop and mobile, and the absence of new computation requests when opening the retained studies.

The original methods and statistical reviews apply only within their recorded scope. Curated public provenance identifies the original review receipts and accepted report hashes; it is not a substitute for human expert assessment. Academic themes and training-effectiveness claims retain the reports' original qualifications.

## Publication and database scope

Git publication includes application code and the selected static research artifacts. It does **not** copy the local Neo4j database. The canonical project and its map URLs in this release identify saved records in the existing local workspace; a separate deployment must import those records before its map links resolve. Static reports and downloads are available independently of those database records.

The secure multiuser entrypoint and independent research connector are documented in [MULTIUSER.md](../MULTIUSER.md) and the [integration results](AI-RESEARCH-IMPLEMENTATION-RESULTS.md). Publishing this branch does not activate institution authentication, connect a user's ChatGPT account, or migrate the existing legacy endpoint to that secure service.

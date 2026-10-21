# Research checks and grounded cluster names

In a saved project, open **Research checks → View current map’s checks**, or **Validation → Results & details → Research checks**. The canvas, original community memberships and original objective remain unchanged. No new diagnostic starts when a map opens.

Applicable cluster tiles also show a separate **Map checks** button. It opens the current map’s matched research results with the selected cluster identified; context-only study checks are hidden in this focused view. The indicator means results are available, not that checks passed or that the individual cluster has a stability grade. Existing cluster stability ratings remain separate. Unlinked records, unmatched/stale evidence and maps without completed checks receive no indicator.

The AI project’s 13 original maps have a derivative retained-check index. It verifies the full graph, original engine memberships (including isolates), exact source/reference IDs, scientific settings and supporting file SHA-256 values. A changed graph or file withholds the retained results. Layout and current interpretative labels do not change this scientific identity. Unrelated projects have no attached original study.

The retained checks cover edge reconstruction, optimizer seeds, coupling thresholds, article restriction, influential-reference deletions, text-neighbour/seed alternatives, vector checks, and citation/text comparisons. Purposive coding, selected full-text appraisal and seminal-candidate discovery are identified as study context where they do not test the displayed map. Current AI labels do not inherit the original reviewers’ approval.

These are **map-level sensitivity results**, not per-cluster bootstrap ratings. Original reference-incidence bootstrap, null significance, human expert approval and validation of current AI names remain unassessed. ARI values always identify their comparison population; dropping isolates or restricting to works still connected changes that population.

## Reusable checks

**Run a research check** offers optimizer seeds, retained-edge thresholds, article-only restriction, reference removal, source-text neighbour counts, comparison with another saved map, exact coupling edge audit, and rank-cutoff discovery diagnostics. Ranking can use exact network strength, observed incoming corpus citations or an explicitly selected retained global citation-count field. Top-10/top-20 outputs include deterministic tie breaks and inclusive boundary-tie alternatives; they do not establish historical priority or scientific quality.

Checks require an undirected pairwise source-work graph with the necessary evidence. Missing publication types, references, exact embedding caches or objective settings make the relevant check unavailable. Publication types for the retained AI project come from its separately hashed original source table. Types are never inferred from titles. Citation counts are observations in the supplied retained field; missing counts must not be replaced by zero. Older application packets may omit types or provenance needed for a particular check.

Some older packets filled unavailable global counts with zero. The browser refuses global ranking on ambiguous `citedBy` zeros unless the bound retained audit proves complete count availability. Explicit raw `cited_by_count` metadata remains subject to the worker’s per-record checks. Strength and observed incoming-citation checks do not depend on this legacy count field.

Fresh community fits explicitly use `ngraph.leiden` 0.3.0 with modularity or the existing native mean-weight CPM scale. They are new app computations, not a replay of the original Python igraph/leidenalg study. Text checks use the exact matched MiniLM cache; the current signed-int8 cache can produce different neighbours from the original float-vector study. Neither implementation is silently substituted for the other.

Workers are bounded to 2,000 works, two million candidate pairs, 200,000 edges, 15 fits and three minutes. Cancel and map changes terminate the worker and discard partial results. Exact memberships, settings, coverage, explicit ARI denominators and input fingerprints accompany completed outputs. Download results or use **Projects → Save current map** to retain new checks in a snapshot. A changed graph withholds stale saved checks. Original snapshots are not overwritten.

Regenerate the retained index only from the original workspace snapshot exports:

```powershell
node scripts/build-retained-research-checks.mjs <directory-containing-original-id-saved-before.json-files>
node --test scripts/retained-research-checks.test.mjs scripts/research-check-methods.test.mjs scripts/canvas-research-checks.test.mjs
```

## Naming update and activation

The revised keyword ranking discounts phrases common across sibling clusters using distinct member support rates. It is an experimental descriptive heuristic, not BERTopic or a significance test. Candidate phrases and counts come from the pinned source text; no research labels or domain-specific word lists act as targets. Member excerpts and sibling summaries are bounded. Different clusters can honestly keep similar broad headings.

The model chooses a brief topic with exact member excerpt citations. Host checks verify literal source integrity and lexical support, then construct the short topic sentence. This prevents an unconstrained model summary from adding unsupported sectors. It still does not prove semantic entailment, handle every negation or validate a substantive academic theme. Mixed and limited-evidence results remain explicit. Automatic naming on a ready saved map is preserved.

A proposed shared heading receives a provisional qualification when a substantive heading word occurs in fewer than two cited member works. Word variants can trigger this conservative check; it does not detect thematic mixture. A broader rejected proposal can fall back to an already checked concept using the existing keyword order. The original model proposal remains available for inspection. If two completed attempts still fail the distinct-source checks, the app keeps its keywords rather than accepting the name. Repair prompts give a short correction cue and at most four title examples; they do not repeat the complete source catalogue already in context.

Browser, public service, protected service worker and keyword cache share version identities. Old service replies and cached headings cannot pass as the new method. For that reason, keep the naming browser assets on the old live version until the naming service has been restarted with the new source. The research-check UI can be deployed independently.

The existing launcher is `scripts/start-cluster-descriptions.ps1`. It starts missing services and does **not** replace an already-running service. After the operator stops only the old naming service on port 8093 and runs the launcher, `/health` must expose the new `descriptionVersion` and `keywordVersion`. Port 8092, the web server and Cloudflare tunnel can remain running. Then publish matching naming assets with the guarded command:

```powershell
node scripts/publish-grounded-naming.mjs 'C:\Users\Austin\Documents\Codex\2026-10-07\ca\outputs\local-web-host\site\conservative-atlas'
```

This command checks the live version before writing, backs up replaced assets and changes only the naming asset references in the existing live HTML. It does not restart services or replace the whole site. Refresh the app afterward; names will load automatically.

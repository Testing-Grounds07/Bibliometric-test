# Scientific evidence, validation and article roles

Cycle A adds compact scientific audit disclosures to the existing canvas and citation history. It does not replace the network, change historical findings, or enable institutional deployment.

## Separate assessments

Evidence coverage, solver completion, resampled structural recovery, construction sensitivity, a statistical null and researcher interpretation remain separate. Missing solver convergence information is reported as unreported. AI descriptions do not validate themes. Unknown reference completeness and unretained authorship-count diagnostics are not reported as zero errors.

The evidence manifest records SHA-256 audit fingerprints for evidence incidence/identity, source and analyzed-node text, network construction, and analytical membership/settings. Display state and ordering do not change these hashes. These audit identifiers are not an authorization capability or a substitute for server-side calculation identity. Legacy implementation versions and retrieval dates remain explicitly unknown. Legacy project saves attach a server-generated manifest from the pinned corpus; durable pipeline results persist manifests and scientific audit attachments. Finding restoration and export recheck project membership through existing APIs.

## Methods

- Expanded roles include degree/strength, weak undirected core numbers, within-community position and participation. A small external connection is not automatically called a cross-community connector. Heuristic role labels are exploratory; low-degree results need caution.
- Citation PageRank follows citing-to-cited links, conserves dangling mass and reports convergence. It is offered only on direct citation networks. Citation-history results apply to the selected analytical history, which may be capped, not the entire catalogue or eligible core.
- Exact normalized Brandes betweenness uses explicitly selected unweighted or inverse-strength path lengths. A bounded worker fails without publishing partial results when scope/operation limits are exceeded. Paths do not establish causal idea transfer.
- Construction comparison builds six full/fractional/raw/cosine/Jaccard/association/support alternatives from source/reference incidence. Raw support is the number of distinct supporting events; fractional contributions remain separate. The selected algorithm runs at fixed settings, without choosing a winner or comparing incompatible objective values. This is construction-and-scale sensitivity, not pure normalization invariance. Leiden mean-weight rescaling does not guarantee equal effective granularity; block models ignore weight differences.
- Fixed-evidence optimization repeats five seeded fits for pairwise Leiden/Infomap, separately from evidence-bootstrap stability. Full-universe ARI treats unassigned nodes as individual singletons. Other methods are explicitly unsupported in this diagnostic rather than substituted.
- Role-rank sensitivity bootstraps source/reference incidence events while keeping communities fixed. Distinct-support thresholds count each retained event once; multiplicity changes weights only. Ties share top-ten credit. It is not thematic or whole-hyperedge role validation.
- The binary-incidence null preserves event sizes and article frequencies exactly using reversible two-edge switches. It reports feasibility, attempted/accepted switches, successive/original overlap and a lag-one statistic. No diagnostic establishes mixing. Frozen margins or inadequate movement yield not-assessed outcomes. Empirical upper-tail probabilities use +1 correction and Holm across all possible pairs. The UI explicitly warns when 50 simulations cannot attain the multiplicity-adjusted threshold; non-significance then provides no reassurance.

## Boundaries and unavailable checks

Deep construction/null/rank comparisons currently operate on pairwise citation-derived projections. Directed citation components, hypergraph trial families and higher-order networks are not silently converted for those checks. Existing higher-order bootstrap remains conditional on discovered candidates: it does not re-mine combinations or validate overlapping hyperedges as independent observations. Full re-mining, metadata-identity uncertainty and human thematic review are not automated in Cycle A.

Limits are 800 nodes, 50,000 incidences and 3 million event-pair contributions for deep projection audits; roles allow 1,500 nodes/100,000 links with an additional exact-path operation budget. No partial analytical universe is silently used. Cancellation and analytical/tab changes prevent stale installation. Authenticated viewers can read/export existing results but cannot launch analytical audit jobs.

## Build and verification

Bundle `scripts/evidence-explorer.mjs`, `scripts/historiography-browser.mjs` and `scripts/science-worker.mjs` into their matching files under `public/conservative-atlas/`. Regenerate the trial workspace with `scripts/build-trial-workspace.mjs` and bundle evidence-explorer to `trial-evidence-explorer.js` as well. New `science.css` is referenced by the shared HTML source. Do not bulk-copy private project artifacts or publish the experimental backend search catalog accidentally; the default catalog still exposes only mixed and Leiden-seeded direct search.

Focused tests: `node --test scripts/scientific-manifest.test.mjs scripts/network-roles.test.mjs scripts/construction-audit.test.mjs scripts/role-sensitivity.test.mjs scripts/optimization-variability.test.mjs scripts/multiuser/science.test.mjs`. Run `scripts/multiuser/integration.test.mjs` only against an explicitly disposable Neo4j database, never current research data. Browser verification uses a loopback preview and a disposable two-user fixture before any coordinated public asset deployment.

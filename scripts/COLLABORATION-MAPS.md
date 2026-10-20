# Work-specific collaboration maps

## Relationships and interpretation

The Collaboration tab builds a declared projection from pinned source works. It reuses the main canvas, cluster strip, filters, search, selection and evidence inspector; it does not replace the original citation, semantic, history, drill-down or hypergraph views.

- Author nodes require retained OpenAlex author IDs. Equal names are not merged; names never create identities.
- Institution nodes require retained OpenAlex institution IDs on a work-specific authorship. They do not use an author's current institution as a historical affiliation.
- Country nodes use recorded authorship countries and institution country codes, deduplicated within a source work. Recorded authorship countries may originate from unmatched raw affiliation addresses.
- A line means that both actors occur on the same work. Co-authorship and co-affiliation do not establish equal contribution, direct interpersonal collaboration, agreement or causal knowledge transfer.
- Node size counts distinct associated source works, not global citations, individual productivity outside the corpus or institutional impact.

## Explicit construction

Full pair counting adds one per observed actor pair per work. Fractional pair counting adds `2/[n(n-1)]`, where `n` is the distinct observed actor set after declared identity and affiliation policies, **before** the minimum-publications cutoff. Filtering actors removes their pair mass; it never redistributes that mass to remaining actors. Raw support always counts distinct source works separately from analytical weight.

The UI starts with at least two observed source works per actor for readability. Set the minimum to one for the complete observed actor universe. This is an analytical threshold, not a display filter or global-citation cutoff. Coverage records excluded actors and work incidences. The ordinary minimum-cluster-size and visibility controls remain display-only.

Institution policy is either direct IDs or an explicit target parent ID supported by the recorded lineage. Lineage contains ancestry, not an ordered immediate-parent chain. No first/last ancestor or name is guessed as a parent. Institutions without matching recorded ancestry remain direct, with missing-lineage diagnostics; this is not a complete organizational rollup.

Large-team exclusion is optional and explicit. It checks the maximum of reported author count, retained authorship-list size and stable observed author IDs. A missing reported count does not establish a small or complete team. Affiliation sensitivity can restrict to single-institution authorships; this applies to both matched-institution and recorded-country contributions.

The declared projection is fitted with three seeded Leiden CPM starts. No citation Auto CPM or unsupported score/search fallback is applied. A cluster is an exploratory structural group, not a validated social or research theme. Immediate headings count source-title words once per associated work. Actor IDs are never passed to Qwen as scholarly works; grounded actor AI descriptions are not implemented.

## Evidence coverage and identity alternatives

Retained lists, missing IDs/affiliations/countries, duplicate IDs, reported counts, potential truncation and recorded lineage are reported separately. Provider list requests may stop at 100 authorships; even a matching count does not prove complete coverage because provider totals can be capped. Zero truncation flags with unknown counts is not reassurance of completeness.

Optional identity scenarios require a human audit note. The controls select observed authors and, for a split, source-work checkboxes; advanced JSON is optional. A merge maps explicitly observed IDs into an existing retained ID; chained/overlapping merges are rejected. A split assigns observed source-work IDs to explicitly named local `audit:` identities. Unassigned works remain with the original identity. Scenarios are deterministic sensitivity alternatives, not automatic disambiguation or invented Monte Carlo probabilities.

Human audit notes, local identity labels and all their derived calculations are project-scoped even when their parent bibliographic evidence is public. Plain public-only mathematical projections may reuse compatible completed calculations across projects without sharing findings or personal workspace state.

Construction checks compare full/fractional counting, publication thresholds, team caps and affiliation policies where applicable. An audited scenario also compares its unmodified identity baseline. Fixed numeric CPM across weight definitions measures construction-plus-scale sensitivity; it is not proof of normalization robustness. No collaboration bipartite statistical null or per-cluster recovery rating is implemented. Citation bootstrap/nulls are explicitly unavailable for actor graphs.

## Ego and linked evidence

One- or two-hop ego views are induced subsets of a completed collaboration graph. They retain parent memberships, identify boundary connections and disclose the parent scope. Creating or returning from an ego view does not fit a new partition or submit a job. New analytical work requires the full map; mathematical roles, if calculated on a full map, are not silently relabeled as ego-network roles.

Associated source IDs and the retained co-citation scope provide an inspectable reference/source crosswalk. Reference and actor partitions are not compared using ARI. Source/citation/semantic relationships are linked through observed work IDs, never merged into an arbitrary blended score.

## Public adaptive supplement and private evidence

Private projects use their authorized pinned works. They never inherit public supplemental metadata merely because some work IDs match.

The old public adaptive source records lack structured actor IDs. An optional separately pinned supplemental sidecar includes only the exact public corpus's 2,855 work IDs/titles and minimized observed authorships, affiliations, countries, lineage, dates and counts. It stays outside the web root and is served only through the configured public-corpus allowlist endpoint. It contains no abstracts, raw affiliation strings, ORCIDs, project notes or other corpora. Its preparation date is not a retrieval date; the original retrieval date remains unknown when not retained.

Generate the minimized sidecar with `node scripts/build-public-collaboration-metadata.mjs`. The legacy service can opt in using `BIBLIOMAP_PUBLIC_COLLABORATION_METADATA` pointing at that private file. The dedicated GET endpoint requires the exact public corpus ID and validates IDs, titles, checksum, envelope, field types and approved fields. It does not broaden project evidence APIs. Institutional/multiuser deployment remains disabled in this milestone.

For restart persistence without changing credential files, `scripts/start-workspace-projects.ps1` optionally reads `.trials/workspace-projects/runtime.json`. It accepts only `publicCollaborationMetadata` (the exact absolute existing sidecar path) and `webRoots` (an array of absolute configured host/site roots); repository `public` is always included in the outside-webroot check. Other keys, malformed types and paths inside any configured public root fail before launch. JSON path strings use escaped backslashes, or forward slashes. The launcher passes the exact path through the child process environment, without parsing it as dotenv; an existing process-level setting retains precedence and the launcher restores its own environment afterward. If the optional configuration is absent, startup is unchanged. Keep immutable checksummed versions and prior backups; never overwrite a pinned sidecar in place. Changes require a normal service restart, not a tunnel restart.

The host also needs the reviewed `scripts/analysis-proxy.mjs` GET-only literal path/query adapter and its existing `workspace-route-path.mjs` import. These are non-static dependencies: copying the canvas bundles alone is insufficient. Coordinate a normal loopback host and legacy service restart after all gates; do not restart the Cloudflare tunnel or change its URL. Preview-route success does not verify the production proxy. Private evidence and the sidecar must never be placed in the static publish list.

## Bounds and verification

Limits are explicit: 50,000 source records, 5,000 retained authorships per source, 500,000 retained authorships total, 10,000 candidate actors, two million per-work pair contributions, 100,000 projected edges and 1,000 ego actors. Over-limit operations fail without sampling or silently discarding evidence.

Focused checks: `node --test scripts/collaboration-networks.test.mjs scripts/collaboration-contracts.test.mjs scripts/public-collaboration-metadata.test.mjs`.

Disposable integration only: configure the explicit separate disposable Neo4j environment and run `node --test --test-concurrency=1 scripts/multiuser/integration.test.mjs scripts/workspace-science.integration.test.mjs`. Never point verification at current research data. Browser acceptance and scoped promotion are separate gates; successful pure or database tests do not claim interactive/physical-device validation.

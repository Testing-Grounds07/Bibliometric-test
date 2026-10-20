# BiblioMap and independent researcher integration

Version 1, 2026-10-20. Branch: `feature/ai-research-integration` in BiblioMap and its sibling `bibliometric-network-researcher`. Status: local0.4.0 implementation accepted; actual institutional/ChatGPT activation and production cutover remain external gates. See [implementation results](AI-RESEARCH-IMPLEMENTATION-RESULTS.md). This plan implements the preceding six-release proposal and design brief v3 sections 7, 9, 11–13, 18–24.

## Product outcome

A researcher can inspect a BiblioMap project from ChatGPT, ask a bounded research question from either interface, review a proposed protocol, execute authorized analyses using the independent engine or BiblioMap, examine actual reviewer findings, and save inspectable results. Selected engine methods are also available through ordinary app controls. The standalone engine continues to operate independently.

## Work and acceptance milestones

| ID | Work | Acceptance evidence |
| --- | --- | --- |
| M0.1 | Preserve existing working trees; create integration branches and baseline records | Branch identities, pre-existing diff, file inventory; no reset or broad staging |
| M0.2 | Reconcile brief, live/local capability differences and dependencies | Current implementation inventory; deployed capabilities remain unverified until queried |
| M1.1 | Define versioned capability, evidence, graph, analysis, review and result exchange contracts | Cross-language fixtures; strict settings, typed entity universes, canonical hashing conventions |
| M1.2 | Define backend selection and compatibility | Unsupported combinations reject; imported, computed and displayed results distinguished |
| M1.3 | Define artifact lineage and cross-backend comparison | Reference observations, aliases, eligibility, isolate membership, dates, settings and code/model identities retained |
| M2.1 | Implement delegated project-scoped access | Issuing user, audience, scope, expiry, revocation and per-call membership verified; service identity grants no user access |
| M2.2 | Implement read-only projects/evidence/methods/results/checks/findings | Bounded paging; opaque IDs; no raw paths, arbitrary queries or legacy bypass |
| M2.3 | Add skill-side adapter and discovery | Explicit configured destination; actual build/principal/limits/engine status; no silent backend fallback |
| M3.1 | Export frozen BiblioMap evidence and import into a bounded engine study | Exact source records and scientific lineage; explicit mapping of non-equivalent fields; immutable parent |
| M3.2 | Submit, track, retry, cancel and recover linked analysis jobs | Single execution owner; replay-safe idempotency; no stale worker publication or false completion |
| M3.3 | Return and inspect results; save findings | Hash-bound graph, metrics, settings, checks and reports; re-opening performs no computation |
| M3.4 | Recompute coupling and compare backends | Same evidence/universe/settings first; independently checked edges; discrepancies explained rather than forced partition equality |
| M4.1 | Add research workspace | Project/question/protocol, bounds, progress, pause/cancel/retry, accessible and technical outputs |
| M4.2 | Display actual research team and review state | Real lead/methods/statistics sessions, executed checks, unresolved objections, candidate bindings and budget telemetry |
| M4.3 | Control source acquisition and appraisal | Bounded providers/sources, source hashes/access status, excerpt locations, extraction fields, contrary evidence; no abstract mislabeled full text |
| M4.4 | Add specialist assignments and evidence synthesis to controller | Separate scoped sessions and artifacts; registered actions; partial coverage and specialist completion explicit |
| M4.5 | Persist review and human interpretation boundaries | No generic validated badge; human expert approval remains not assessed unless actually performed |
| M5.1 | Structural measures and rich-club app controls | Constraint, harmonic/eigenvector and raw rich-club; direction/weight assumptions, convergence and undefined values visible |
| M5.2 | Shared-node citation/text multilayer UI | Exact same-node checks, layer weights/resolutions/seeds; individual-layer comparison and linked evidence |
| M5.3 | Joint temporal UI | Explicit slice definitions/omega, per-slice memberships and continuity; independently fitted windows remain distinct |
| M5.4 | Custom core/periphery UI | Custom objective and degree confounding disclosed; distinct from k-core; fit and block densities inspectable |
| M5.5 | Triad and motif UI | Binary policy, explicit justified null, full tested family, enumeration/swap bounds and mixing limits |
| M5.6 | Link scores and conditional temporal evaluation UI | Scores not probabilities; frozen chronology, full candidate universe and actual as-of evidence; retrospective mode qualified |
| M6.1 | Snapshot expansion and version comparison | Intended/searched/eligible/analyzed/displayed counts; search semantics and resumable caps retained; no false field census |
| M6.2 | Adaptive-leadership pilot | Existing frozen 951-work selection; coupling exchange/compare, extra methods, linked graph/report/finding; no changes to original study |
| M6.3 | Leadership-evaluation research workflow pilot | Acquisition/appraisal/specialist paths exercised on bounded evidence; no comprehensive-review claim |
| M6.4 | Recovery, concurrency, quotas and privacy | Multiuser revocation, cancellation, retries, restart, private-cache isolation, reviewer isolation and bounded resource tests |
| M6.5 | Browser/usability and accessibility | Normal analysis controls and research flow; mobile-sized viewport, keyboard, errors, reports, reopening without jobs |
| M6.6 | Package, stage and rollout readiness | Versioned docs/configuration, frozen manifests, fresh tests, disposable backup/restore rehearsal and rollback instructions |
| M6.7 | External activation and production cutover | Actual institutional accounts, protected deployed service, actual ChatGPT call, matched production backup and reviewed cutover; record pending external requirements separately |

## Architecture decisions

1. Retain the independent engine as a separately versioned runtime. Use a narrow adapter instead of duplicating scientific algorithms in browser code.
2. Extend protected BiblioMap project APIs, evidence storage, jobs and findings. The legacy single-user server is not a delegated private API.
3. Distinguish transport authentication, authenticated user, project permission and operation scope. The current operator MCP bearer is not a tenant delegation mechanism. A browser session may issue a narrowly scoped revocable local grant; public ChatGPT multiuser access requires a supported OAuth resource boundary, not token passthrough.
4. One execution service owns each scientific job. Cross-system records reference the owning job and exact artifacts. UI polling is not a second executor.
5. No inferred equivalence between arbitrary JSON serializations: exchanged manifests specify byte/canonical hash conventions, raw source hashes and semantic comparisons separately.
6. Refresh, source expansion, screening, new computation, importing an existing result, saved findings and display changes are separate operations with separate lineage.
7. Full scholarly records stay in bounded immutable artifacts. Large networks use bounded exchange/streaming rather than unrestricted prompt or HTTP dumps. Restrictions fail explicitly without sampling.
8. Source content is evidence, never operational instruction. Article text and excerpts do not confer permission or semantic validation. Public metadata and restricted full text have separate egress decisions.

## Research before development

Existing reviewed engine packets R5/R12 and their mathematical reference fixtures govern extra methods. Research must precede newly changed scientific behavior, with a decision record linking definition, alternatives, prerequisite checks and claims. Technical integration research uses primary documentation. No new universal scientific threshold is introduced for UI convenience.

Technical sources inspected 2026-10-20:

- [OpenAI plugin authentication](https://developers.openai.com/plugins/build/auth): OAuth resource discovery, PKCE and resource audience requirements; validate on each request. Prefer established identity provider integration for public deployment.
- [OpenAI MCP server building](https://developers.openai.com/plugins/build/mcp-server): enforce request authorization in the server; expose actual authenticated profile where appropriate.
- [MCP authorization specification, 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization): audience binding, distinct upstream authorization and forbidden token passthrough. Match the selected pinned SDK's supported revision instead of assuming latest-spec compatibility.
- [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels): private connectivity differs from public distribution; activation requires an actual successful ChatGPT tool call.

These are implementation requirements, not claims that this account, institution or deployment is activated.

## Development cycles

Developer: existing `/root/developer`, requested sol6.1 high. Reviewer: existing `/root/reviewer`, requested sol6.1 high. Primary agent: research preparation, milestone accounting and end-user usability. Do not substitute a developer self-check for independent review.

Cycle 1: M1–M3 contracts, protected access and first engine round trip. Cycle 2: resolve review/usability findings and build M4 research workspace/controller. Cycle 3: M5 methods with app interactions. Cycle 4: M6 pilots, recovery, packaging and final independent review. Split cycles further whenever feedback warrants it.

For each candidate: preserve changed file hashes and exact test inputs, developer checks, independent findings and dispositions, primary usability evidence, and outstanding limitations. Revisions invalidate affected checks. Proposed tests are not executed tests. A release is accepted only when its applicable gates are met.

## Data and release boundaries

Development uses isolated synthetic/disposable storage. Existing studies, snapshot files, services, tunnel addresses, credentials and production data are preserved. User authorization covers development and reversible local tests; production publishing/authentication cutover is a distinct final action after its concrete release is reviewed. A missing external institutional/account step cannot be represented as passed by a fixture.

No whole-snapshot search or expensive full research run is necessary for each code cycle. Reuse frozen evidence for the pilot; declare bounded cases and perform additional scale checks only where justified. Real model calls retain their actual cost and independent reviewer provenance.

## Completion accounting

The machine-readable ledger is `.trials/ai-research-integration/milestones.json`, with verification and review receipts alongside it. Production/account activation is tracked explicitly from local implementation acceptance. Do not mark the overall goal complete while required implementation or review remains.

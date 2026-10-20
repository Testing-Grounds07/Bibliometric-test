# Multiuser implementation verification

Date: 18 October 2026. All database/browser checks used synthetic literature in a separately provisioned disposable Neo4j container. The production research database, deployed static site and existing Cloudflare tunnel were not migrated, restarted or repointed.

## Automated checks

| Check | Executed outcome |
| --- | --- |
| `node --test scripts/multiuser/*.test.mjs` with the disposable database configured | 23 passed, zero failed or skipped |
| Existing analysis/frontend regression suite: `node --test scripts/*.test.mjs neo4j-store.test.mjs analysis-engine.test.mjs corpus-presets.test.mjs` | 235 passed, one skipped, one existing CSS assertion failed, 237 total |
| `git diff --check` and edited client JavaScript syntax checks | Passed |

The existing regression failure is `scripts/network-appearance.test.mjs:40`, which requires the literal string `@media(min-width:1100px)`. It is unrelated to multiuser behavior and was not changed as part of this work. Raw local test output is in `.trials/multiuser-focused.txt` and `.trials/multiuser-regression.txt`.

Coverage includes signed OIDC identity verification with a mock HTTPS provider, PKCE, nonce/state consumption, verified-recipient invitations, CSRF/origin checks, server logout, final-owner protection, and viewer permissions. The mock provider is not a production institutional integration.

Database/API scenarios verify:

- Two users with equivalent eligible public evidence receive project-local results backed by the same successful calculation and one native graph projection.
- Two independent Node submitting processes resolve the same normal job through transactional calculation locking.
- Private evidence and screening rationales remain project-scoped; known other-project result/evidence/subscription IDs do not authorize reads.
- Members of the same project retain separate workspace revisions and camera/display preferences.
- Membership removal prevents subsequent HTTP polling and export/download requests using an otherwise valid session.
- CPM changes reuse network evidence; forced recomputation creates a separate run without altering the old result.
- Display/workspace saves create zero analytical jobs. Workspace, project and shared-screening edits use explicit revision conflicts.
- Screening creates immutable private derived evidence, preserves its parent, and never silently installs it in another workspace.
- Co-citation, coupling, Infomap, direct hypergraph modularity, higher-order bundles, citation history and method-specific reliability retain persisted outputs.
- Reliability attachments can be pinned to findings and restored only against compatible analysis identities.
- Restarted coordinators reuse completed work. Lease expiry recovers the same checkpoint with a new fence; the previous worker cannot publish.
- Cancelling one subscription leaves another subscriber's job intact. Transient errors retry; validation failures do not publish or retry.
- Retrieval resumes from persisted page checksums/cursors after a simulated upstream interruption, without publishing partial evidence.
- Migration is additive and repeatable, preserves original legacy payloads and IDs, and does not take ownership of another user's newer projects.
- Project deletion/manual cleanup retains dependencies still referenced by a different project.
- Client stages reject late results after the analytical intent or active project changes.

## Observed reuse

The final synthetic run wrote `.trials/multiuser-verification.json`. Counters measure lookup hits and joined active jobs, not estimated wall-clock savings.

| Stage | Completed-result hits | Active-job joins |
| --- | ---: | ---: |
| Whole analysis | 1 | 2 |
| Reference metadata | 6 | 0 |
| Preparation | 7 | 0 |
| Network | 4 | 0 |
| Roles | 0 | 1 |
| Other stages exercised | 0 | 0 |
| Total | 18 | 3 |

A stage hit avoids that stage's execution. A whole-analysis hit also avoids invoking its dependency pipeline; do not interpret the table as 18 distinct whole-analysis runs saved. No elapsed-time or production-scale performance claim is made.

## Browser checks

Used the loopback-only `browser-fixture.mjs` harness with two synthetic accounts, switching sessions sequentially rather than claiming separate simultaneously logged-in browser contexts.

- Each account's project picker contained only its authorized project.
- Saved separate findings/notes; the second account did not list the first account's findings.
- Navigated to a known first-account finding URL as the second account; no private graph or notes were installed. The API integration tests additionally assert the 404 response.
- Switched among co-citation, source coupling and citation history. Co-citation thresholds survived tab changes.
- Changed the algorithm to Infomap and then the network model to incidence hypergraph; the canvas installed the corresponding results automatically.
- Typed a reference threshold without blurring the input: after the debounce, the graph changed from six references to zero; restoring the threshold returned the six-reference incidence map.
- Ran authenticated Leiden incidence against a separate disposable Python service, displayed its true WebGL 3D view, exploded the groups, zoomed and saved a finding.
- Reloaded that finding: 3D mode, exploded layers, camera and completed reliability were restored. Fixed missing method-description metadata so historical runs without those notes remain readable.
- The compact status chip no longer overlaps About. The final Infomap/incidence browser run had no captured console errors.

Screenshots: `.trials/multiuser-browser/project-one.png` (restored exploded 3D finding) and `.trials/multiuser-browser/project-two.png` (independent second-account finding). These show small synthetic graphs, not the research corpus.

## Deployment gates and remaining limitations

1. An institutional OIDC provider/registered callback, exact current public URL, client credentials, service token and explicitly verified owner issuer/subject still need configuration. The secure server fails closed without them. The old live server is not secured by merely adding these source files; it must not remain an alternate public entrypoint during multiuser cutover.
2. Production ownership migration and the paired Neo4j/artifact backup-and-restore rehearsal have not been performed. The automated tests prove additive migration preservation, not an offline database restore. Follow `MULTIUSER.md` against a disposable copy before production cutover.
3. Real institutional two-account login, full-size corpora, sustained multi-process worker throughput, power-loss behavior and live OpenAlex retrieval still require deployment checks. Recovery tests expire leases deterministically; they are not a machine-power-loss experiment.
4. MiniLM/Qwen full inference and the optional block-model engine were not rerun in the new deployment. Pin the documented revisions and restart those services with authentication before enabling them. Missing engines fail explicitly without substituting a different algorithm or discarding the previous map.
5. The shared-screening version API is implemented and tested. A dedicated bulk-screening editor is not added; its derived evidence appears through the existing project evidence list.
6. All workers sharing a database must share its durable artifact storage. A temporary test run with mismatched browser/integration artifact roots correctly failed on missing files; the harness was stopped and the suite rerun successfully. Use separate databases or stop one harness before running another with a different root.
7. Semantic cache directories and old legacy `.trials` files are deliberately excluded from automated cleanup. Cleanup remains a manual administrator operation; no production data was removed.

This is an implemented, synthetically verified deployment foundation, not a claim that the currently published single-user tunnel has already become a production-ready institutional multiuser service.

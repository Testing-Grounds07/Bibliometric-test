# Multiuser BiblioMap

## Deployment boundary

The secure entrypoint is `scripts/multiuser-server.mjs`, normally on **127.0.0.1:8086**. It serves the existing canvas with a project-aware client, protects APIs/downloads, and substitutes an empty bootstrap instead of publishing the adaptive-leadership data to every account. It does not forward to unrestricted legacy CRUD services. Arbitrary static JSON, HTML, source maps and files are unavailable.

**The live single-user server/tunnel is not automatically upgraded or repointed.** The original server is a legacy development entrypoint, not a secure multiuser deployment. Never publish it as an alternate path when granting collaborator access. The new service fails closed without institutional configuration; there is no anonymous/local-password fallback.

Prerequisites: Node 22+ (tested on Node 24), Neo4j 5.26+, durable local storage outside the web root, and an institutional OIDC app registration. Keep the temporary tunnel if desired, but update its exact registered callback and `BIBLIOMAP_PUBLIC_URL` whenever the address changes. No wildcard callbacks.

## Configure and migrate

Use `.env.example`; do not commit credentials or artifact data. Required settings are `BIBLIOMAP_PUBLIC_URL` (HTTPS origin), `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, the existing `NEO4J_*` values and a random `BIBLIOMAP_SERVICE_TOKEN` of at least 32 characters. Register `<public origin>/auth/callback` for Authorization Code flow with `openid email profile`. The provider must supply a verified email for invitation acceptance.

Migration requires `BIBLIOMAP_OWNER_ISSUER`, `BIBLIOMAP_OWNER_SUBJECT`, and `BIBLIOMAP_OWNER_EMAIL`. Obtain the verified subject from the institution; do not substitute an email. Bootstrap is explicit: the first visitor never becomes administrator.

```powershell
npm run admin:multiuser -- migrate
npm run admin:multiuser -- migrate --execute
npm run start:multiuser
```

Preview first, then execute against a reviewed backup after testing a disposable copy. Migration assigns only previously ownerless projects; reruns do not take over other users' newer projects. Original IDs, URLs, corpus payloads, saved analyses, native graphs, bundles and lineage remain. Imported corpus evidence is private. Unverifiable old analyses remain legacy snapshots, not equivalent reusable calculations.

Owners invite people through **Projects → Members & invitations**. Share the seven-day, single-use link with its intended recipient. Acceptance requires the configured issuer and matching verified email. Owner/editor/viewer checks apply on every request, including polling/downloads. Viewers may inspect/export existing results and save personal display preferences, but cannot initiate computation. The last owner cannot be removed/demoted. Site administration does not grant project access through ordinary APIs.

## User behavior and storage

- Opening a project restores the user's own result, filters, camera and tab. Shared updates use revision checks, not silent overwrites.
- Matching completed calculations load automatically; missing settings queue after 500 ms or slider release. The previous map remains until the selected request finishes. Display changes do not create analytical jobs.
- **Analysis history** holds automatic results. **Saved findings** separately pin completed runs, compatible completed checks/descriptions, notes and display state.
- **Refresh literature** creates a new retrieval/evidence version; it does not replace others' views or historical findings. The interactive retrieval cap remains 20,000 and partial downloads are labelled.
- **Recompute analysis** creates a new run of selected analysis stages against pinned evidence, reusing unchanged preparation and preserving prior runs.

Public-only evidence/calculations may be shared across projects without project identities, notes, screening rationales or subscriber counts. Private imports and their derivatives remain project-scoped. Responses expose project-local result/subscription references, never browsable cache directories. Provenance dates are intentionally visible; reuse does not identify its originator.

Evidence reads frozen metadata, not the latest shared `BMWork` properties. Stage keys include canonical inputs, effective settings, seeds, dependency/code hashes and model/prompt/text versions. Compatible topology survives title-only changes. Reference observations and semantic embeddings support paper/text-level reuse; whole-network memberships require exact complete inputs. Refresh creates a new reference-observation epoch.

`BIBLIOMAP_ARTIFACT_ROOT` defaults to `.local-artifacts`; use a stable restricted directory outside `public`. SHA-256 files are checked on read. Neo4j holds scopes, manifests, dependencies, successful runs, native nodes/edges/bundles and project references. Publication is fenced and transactional; failed/partial outputs cannot become successful lookup hits. Different projects can reference one run without duplicating its native graph.

Every worker using the same Neo4j database must use the same durable artifact storage, including recovery workers. Do not run the browser harness and integration suite against one database with different artifact directories: a coordinator could claim another harness's job without its files. Use separate disposable databases, or stop one harness before running the other.

Shared screening uses `GET` / `POST /conservative-atlas/workspace-api/projects/<id>/screening`. A write supplies `{revision,evidenceId,decisions:[{workId,status,note}]}`; statuses are `include`, `exclude`, or `undecided`. Decisions describe that explicitly selected parent snapshot; omitted works remain, excluded works are removed in a new private evidence version. Select the original parent to reconsider a previously excluded work. Stale revisions return 409. Earlier decisions, evidence and findings remain immutable, and no member's personal map changes automatically. The returned `evidenceId` can be used for a new computation. This API is ready for a future dedicated bulk-screening editor; the compact project interface currently lists its resulting evidence versions.

## Workers and optional engines

Defaults: two CPU jobs, one retrieval job, one model job, two lightweight orchestrators. Configure `BIBLIOMAP_CPU_WORKERS`, `BIBLIOMAP_RETRIEVAL_WORKERS`, and `BIBLIOMAP_MODEL_WORKERS`. All processes sharing Neo4j coordinate the same limits, with one CPU job per submitting user and round-robin scheduling.

Jobs/subscriptions/checkpoints survive restarts. Heartbeats run every 15 seconds with 60-second leases. Expired workers cannot publish. Transient failures receive at most three attempts; invalid/configuration failures require explicit retry. Cancelling one subscriber does not interrupt another. OpenAlex uses a shared one-request-per-second limiter and checkpointed pages; partial retrievals are not completed evidence.

Infomap uses its Node/WASM entrypoint. Existing Python incidence/block-model engines require the same service token and must advertise authenticated operation in health responses. Loopback overrides: `BIBLIOMAP_INCIDENCE_URL` and `BIBLIOMAP_BLOCKMODEL_URL`. Missing engines fail explicitly without algorithm substitution. Restart existing engines deliberately with the new environment; an existing Docker container needs recreation to change environment settings.

For semantics, set `BIBLIOMAP_MINILM_REVISION` to a pinned 40-character MiniLM commit and optionally `PYTHON_EXECUTABLE`. Set `BIBLIOMAP_QWEN_REVISION` to `MODEL_ID` in `scripts/cluster-description-core.mjs` and start that exact local model with `BIBLIOMAP_SERVICE_TOKEN` exported; its startup script adds `--api-key`. Unauthenticated model operation is rejected. Semantic SQLite caches are access-scope/model partitioned. Model failures retain the map and previous labels; verified excerpts do not validate themes.

Co-citation Auto CPM audits are reusable. Coupling/incidence Auto uses an explicitly exploratory density/4 start; full method-specific settings scans remain separate actions. Reliability reruns the selected algorithm. SBM uses hierarchy selection, not a CPM scan.

## Lifecycle, backup and cutover

Deleting a project removes private records/state/memberships and references, not shared dependencies. Successful unreferenced artifacts have **manual-only retention**, with no automatic expiry.

```powershell
npm run admin:multiuser -- report
npm run admin:multiuser -- cleanup
npm run admin:multiuser -- cleanup --execute
```

Maintenance requires the configured administrator identity. Preview lists reclaimable artifacts/files/bytes. Execution blocks new writes/claims, refuses active running work, rechecks reference/dependency roots, invalidates reclaimed cache records and removes only unreferenced checksummed files. Stop old processes first. Pending files, semantic caches and legacy `.trials` directories are excluded; inspect them separately. Restart interrupted workers if stale running leases prevent cleanup.

Back up **Neo4j and the entire artifact directory together**, plus legacy `.trials` data until verified migration. Missing/corrupt files produce explicit errors; restore their backup or recompute. The local filesystem adapter can later be replaced by object storage; no extra database/queue service is required.

Cutover: backup → disposable-copy migration → institutional/owner configuration → production migration → authenticated engines → secure server → verify two real institutional accounts → repoint the tunnel. Never roll back by silently reopening unrestricted legacy routes to collaborators. PC shutdown stops availability; durable jobs recover after restart.

Rollback rehearsal must use a disposable copy: stop writers/workers, take a matched Neo4j and artifact-storage backup, migrate the copy, restore both backup components together, and verify original project IDs, corpus checksums, findings and bundle lineage before allowing writes. Production rollback similarly restores the matched pair with all writers stopped; it is not a schema-only downgrade. Retain the previous application release and secrets/configuration securely. The automated migration tests verify additive preservation and rerun safety, not an offline Neo4j backup/restore operation; that operator rehearsal remains a required cutover gate.

## Verification

Run `npm run test:multiuser`. Database tests skip unless `BIBLIOMAP_TEST_URI`, `BIBLIOMAP_TEST_PASSWORD`, and `BIBLIOMAP_TEST_DISPOSABLE=1` point to a **separate disposable Neo4j instance**. Never use research data. Tests use synthetic literature and temporary files.

`scripts/multiuser/browser-fixture.mjs` is a disposable-only loopback browser harness, not imported by production. It refuses the research connection/institutional credentials and provides two synthetic session links. Verify each account sees only its project, then exercise tabs, saved findings, filters and reload; stop the harness afterward.

Actual institutional claims and large-corpus/multi-process throughput remain deployment checks. Synthetic tests cannot prove the chosen institution's configuration or this PC's production capacity. Executed checks and limitations are recorded in `scripts/multiuser/VERIFICATION.md`.

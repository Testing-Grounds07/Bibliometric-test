# Optional independent engine bridge — cycle 1

This development candidate extends only `scripts/multiuser-server.mjs`. It does not enable the legacy server, deploy a service, register institutional OAuth, or change existing evidence. The protected server still requires its configured institutional login. Public ChatGPT OAuth and shared multiuser MCP routing remain pending; this release's MCP connection map is a personal, operator-configured adapter.

## Operator configuration

Set `BIBLIOMAP_RESEARCH_CONFIG` to an operator-owned JSON file before starting the protected server. Without it, research routes fail closed. Example (forward slashes are valid on Windows):

```json
{"python":"C:/path/to/bibliometric-network-researcher/.venv/Scripts/python.exe","engineRoot":"C:/path/to/bibliometric-network-researcher","workspace":"C:/private/bnr-bridge-studies","maxOutputBytes":32000000}
```

The fixed executable invokes only `python -m bnr.bibliomap_worker --workspace <configured workspace>`, with an allowlisted environment and fixed module path. Callers cannot supply commands, paths, SQL, model executables or environments. Executable/source/lockfile and bridge hashes enter admission identity, are rechecked before launch/publication, and are compared with archived executed source. Updating runtime code requires server restart and a new idempotency key.

The bridge permits at most 10,000 selected rows, two files, 2,000,000 pair operations, 1,024MiB sampled Python memory, two threads, 120 seconds per engine step and 256MiB study disk. A 130-second subprocess deadline bounds the entire round trip. JSON input is limited to 16MiB; the exact compressed study archive is limited to 12MiB. Output is bounded by the operator setting (default16MB, maximum32MB). Quota failure is explicit; it never samples away rows or skips validation. The 2M pair ceiling permits the separately measured 1,306,465-operation verifier on the frozen 951-source pilot; it is a software quota, not a scientific threshold.

## Project API

Prefix: `/conservative-atlas/workspace-api/projects/<project UUID>/research/`.

An institutional browser session plus CSRF header may `POST delegations` with `{"scopes":["read","compute"],"expiresInSeconds":900}`. Read grants require viewer membership; compute grants require editor membership. Lifetimes are30–3600 seconds and cannot outlive their issuing session. The secret is returned once; storage contains its hash. `DELETE delegations/<grant hash>` requires its issuing browser user. The token is a session-bound local delegation, **not public OAuth**.

All following operations also accept `Authorization: Bearer <local grant>`; they never accept an operator service token as user permission. Every call verifies issuer, issuing user/session, project, audience, scope, expiry/revocation and current membership. Compute checks repeat before launch, at progress/checkpoints, at least every500ms while the subprocess runs, and in the fenced publication transaction. A browser session may also call them under existing session/CSRF rules.

| Endpoint | Behavior |
| --- | --- |
| `GET capabilities` | Actual configured engine/method availability and authenticated project identity |
| `GET inventory?section=evidence\|results\|jobs&offset=0&limit=25` | Bounded authorized project evidence/results/owned subscription IDs, so a configured connection can discover inputs |
| `GET evidence/<opaque ID>?offset=0&limit=25` | Up to100 original records, immutable parent identity, full-record-set hash and exact page wire/hash; no project notes or screening decisions |
| `POST jobs` | Submit `{evidenceId,idempotencyKey,protocol,network,analysis?,eligibility?}` |
| `GET jobs/<subscription UUID>` | Reauthorized owned subscription status; completed result bytes are verified |
| `POST jobs/<UUID>/cancel` | Cancel that subscription; never another subscriber |
| `GET results/<result ID>` | Existing project result; no recomputation |
| `GET results/<ID>?section=summary\|nodes\|edges\|artifacts&offset=0&limit=25` | Bounded typed result page |
| `GET results/<ID>/artifacts/<index>?offset=0&max_bytes=16000` | Bound report/check text, exact UTF8/base64 bytes, original and chunk hashes; no paths |
| `GET findings?offset=0&limit=25` | Project-authorized saved interpretation text and pinned result IDs |
| `POST findings` | Save `{resultId,name,findings}` as user interpretation, without expert-approval status |
| `POST comparisons` | Explicit `{engineResultId,bibliomapResultId}`; reject different evidence, prepared source/node universes, normalization or thresholds |

Use the engine's `examples/protocol.json` and `examples/coupling.json` as explicit protocol/construction templates. Supported cycle1 network operations are bibliographic coupling, co-citation and direct citation; optional analysis is pairwise Leiden or Infomap under the engine's existing strict operation contracts. Omit analysis for a construction-only report; no community result is invented. Other local engine methods remain available through the standalone engine and await subsequent app integration.

## Scientific exchange and durable ownership

`bnr.bibliomap-exchange.v1` uses `utf8-json-wire-v1`: each `<field>_json` is a JSON **string**, and `<field>_sha256` hashes that string's exact UTF8 bytes. The BiblioMap artifact uses its separate `bm-json-sorted-v1` checksum. JavaScript and Python serialization hashes are never treated as interchangeable. Original frozen `snapshot.works` records cross unchanged, including missing/null/empty reference observations. This version accepts OpenAlex W identifiers/URLs only; arbitrary imported namespaces fail explicitly. Aliases, eligibility-first selected rows, raw indices and no-reference-union decisions remain in the exact engine study artifacts.

Evidence acquisition/query/caps, raw record bytes, declared settings, eligible sources, graph node/entity conventions, edge support/traces, isolates, checks, dependency versions and exact runtime source survive the round trip. A protected result includes a bounded ZIP of the **exact original study bytes**, separate from its outer JSON artifact checksum. Backup of the existing BiblioMap artifact store therefore retains the executed study; the external engine workspace is useful operational evidence but is not the sole backup dependency. ZIP entries, all job/artifact hashes, source hashes, displayed graph/text and archived records are checked before publication and read/replay.

The existing BMJob scheduler owns execution. Submission atomically persists a stable execution ID, request hash and subscription; same key/request returns the same subscription, changed input rejects. Mapping is checkpointed before launch. OS-owned engine locks prevent duplicate execution during lease races. Completed steps replay with integrity checks; crashed/incomplete steps do not silently resume or relaunch. Inspect retained evidence and use a new explicit request key for a new attempt. Existing worker lease fencing prevents stale publication. No automatic mid-native checkpoint recovery is claimed.

Native BiblioMap preparation may apply a preset and alter the eligible corpus. Same project or evidence label is insufficient for backend comparison. A comparison refuses unequal actual eligible source/node sets and incompatible definitions. Result differences do not imply partition/objective equivalence or a scientific winner.

Existing engine findings also reopen through the normal project result/snapshot route using a display-only adapter. Its original construction and optional first requested analysis run remain inspectable; construction-only linked nodes are unassigned rather than hidden as isolates. The current coupling canvas accepts cosine weights only. Raw and association-strength coupling still compute and remain readable through protected result/report APIs, but their canvas request explicitly returns422 instead of labeling those weights as cosine.

## Verification commands and remaining gates

`node --test scripts/multiuser/research.test.mjs` runs pure codec checks and skips the disposable database case without explicit test environment variables. To run the latter set a separate `BIBLIOMAP_TEST_URI`, `BIBLIOMAP_TEST_PASSWORD` and `BIBLIOMAP_TEST_DISPOSABLE=true`; never use production credentials. The test uses actual Neo4j, protected HTTP/session auth, Python engine and official MCP SDK. Engine checks: `.venv/Scripts/python.exe -m pytest tests/test_bibliomap.py -q`.

This is M1–M3 engineering work subject to independent acceptance. Full app UI, specialist acquisition/appraisal, additional ordinary app methods, shared OAuth/tenant routing, deployment/actual ChatGPT activation and the remaining milestone pilots are not represented as completed by these tests.

# Bibliometric Test

OpenAlex-powered bibliometric analysis prototype.

All three retained standalone studies are in one saved **Project**, **AI project · Leadership research**. Open it to find the 13 saved maps and all three studies’ **Reports & supporting files**, including the source-only training evaluation. See the [standalone research library](docs/STANDALONE-RESEARCH-LIBRARY.md) for study scope, review limits and database deployment requirements.

The guided search supports multiple work types and OpenAlex primary research
fields. In corpus refinement, the text filter can target titles, abstracts,
authors, sources, or topics. Bulk include and exclude actions preview every
affected retrieved work before applying and can be undone. Saved search
snapshots keep their query settings; saved corpus versions keep screening
decisions and bulk action criteria separately.

Search requests use the OpenAlex core works corpus explicitly. The separate
corpus selection step defaults to **Balanced Core**: CWTS Core source,
article/review/book chapter in a journal or book series, at least one author
and indexed reference, and no known retraction. **Conservative** also requires
English metadata, a journal article/review and a linked affiliation.
**Inclusive Scholarly** permits conference papers and non-CWTS sources with
scholarly source types; works without indexed references remain discoverable
but cannot contribute reference links to a citation network. DOI benchmark
mode is an optional matching filter. DOI, abstract, ORCID, open-access and
funding fields are not ordinary corpus gates. These presets are transparent
selection rules, not validated Scopus or Web of Science membership classifiers.

The broad search snapshot remains separate from the selected corpus. The
refinement screen shows how many retrieved works pass each preset, why works
are excluded, unavailable metadata, and source-list provenance. Users can
include an individual exception with a recorded override. Preset ID,
version, per-work reasons, overrides, and search date are saved with corpus
versions.
Older corpus versions remain exploratory unless they have a saved preset;
older searches may lack newer OpenAlex fields and show verification flags.
Search type choices still limit discovery, so omitted work types cannot be
recovered by switching presets later. Counts for partially retrieved searches
describe only the works actually downloaded.

Screening progress is tracked independently of preset and manual inclusion.
Filters can show unreviewed works or works missing abstracts or references.
The corpus review screen reports incomplete screening, and saved corpus
versions retain reviewed work IDs. Analysis results show
original communities by default when broader grouping would merge them.
Community review decisions (keep, exclude, undecided) are saved in new analysis
snapshots; they label the review set without changing the computed network.
The analysis page shows corpus reference coverage and the network thresholds.
In the document view, clicking a node or selecting Inspect links from the
ranked review list opens a panel with that work's strongest connections and
their raw strengths. A display-only link threshold reduces visual clutter;
it does not recalculate communities or change the saved network. The link
threshold and other display settings are saved with new analysis snapshots.

The results screen also reports indexed-reference coverage and flags missing
cited-work metadata and matching titles for identity review. Matching titles
from different publication years are kept separate; verified same-year pairs
can be combined in a new analysis run, with the alias mapping saved alongside
that run. A work finder selects matching nodes in the document map. Saved runs
can be compared for work and link overlap when they use the same method.
The current map can be exported as SVG or high-resolution PNG, and a methods
summary records the corpus and network settings. Exports reflect the current
display controls; the saved network itself remains unchanged.

## Run locally

For graph database storage, see [Neo4j setup, graph model, and migration](NEO4J.md).
Neo4j mode retains OpenAlex and all existing bibliometric methods while storing
works, citations, and analysis-specific weighted networks as native graph data.
The instructions below describe the original SQL storage mode.

Requires Node.js 20 or later. Run `npm ci`, then `npm start`, and open
`http://localhost:3000`. Local projects, searches, corpora, and analyses are
saved in `.local-db/`. The app still queries OpenAlex for search results and
work metadata, so searches require an internet connection.

For a hosted deployment, set `NODE_ENV=production` and provide `DATABASE_URL`
for PostgreSQL. Local data is never used when `DATABASE_URL` is set.

## Hypergraph clustering and 3D lab

Hypergraph networks under Leiden and Infomap now preserve whole article groups in an incidence representation. Pairwise and higher-order scoring are unchanged. The optional bipartite Leiden service and separate all-clusters exploded WebGL experiment are documented in [scripts/HYPERGRAPH-WORKFLOW.md](scripts/HYPERGRAPH-WORKFLOW.md).

## Citation history

For invited users, project permissions, immutable evidence, reusable results and durable jobs, see [MULTIUSER.md](MULTIUSER.md). The secure entrypoint is `npm run start:multiuser`; the legacy server and existing tunnel are not automatically migrated or secured.

The Citation history tab adds chronological direct citations, recursive citation cores, top-article ranking, cycle-safe transitive reduction, filtering and project snapshots. See [scripts/HISTORIOGRAPHY.md](scripts/HISTORIOGRAPHY.md) for implementation details. Existing co-citation and coupling defaults are unchanged.

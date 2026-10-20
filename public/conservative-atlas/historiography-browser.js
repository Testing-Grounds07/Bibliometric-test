(() => {
  // scripts/analysis-errors.mjs
  function analysisErrorMessage(problem, fallback = "The analysis worker stopped without an error message. Reload and retry, or choose a smaller source scope.") {
    const candidates = typeof problem === "string" ? [problem] : [problem?.message, problem?.error?.message, problem?.error, problem?.reason];
    for (const candidate of candidates) {
      if (typeof candidate !== "string") continue;
      const message = candidate.trim();
      if (message && !["undefined", "null", "[object Object]"].includes(message)) return message;
    }
    return fallback;
  }

  // scripts/evidence-provenance.mjs
  var canonical = (value) => value && typeof value === "object" ? Array.isArray(value) ? value.map(canonical) : Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
  var equal = (first, second) => JSON.stringify(canonical(first)) === JSON.stringify(canonical(second));
  function immutableEvidenceContext(graph2) {
    const provenance = graph2?.evidenceProvenance, previous = graph2?.scientificManifest;
    const value = provenance?.evidenceId ? provenance : previous?.evidence?.id ? { evidenceId: previous.evidence.id, retrievedAt: previous.evidence.retrievedAt, retrieval: previous.evidence.retrieval, completeness: previous.evidence.completeness, textVersions: previous.dependencies?.textVersions } : null;
    if (!value) return null;
    const context = { evidenceId: value.evidenceId, retrievedAt: value.retrievedAt ?? null, retrieval: value.retrieval ?? null, completeness: value.completeness };
    if (value.textVersions?.evidence !== void 0) context.textVersions = { evidence: value.textVersions.evidence };
    return structuredClone(context);
  }
  function inheritEvidenceContext(target, parent, sourceCorpusId) {
    if (typeof sourceCorpusId !== "string" || !sourceCorpusId) throw Error("The derived view has no verified source corpus. The previous map was retained.");
    if (target.sourceCorpusId && target.sourceCorpusId !== sourceCorpusId || parent?.sourceCorpusId && parent.sourceCorpusId !== sourceCorpusId) throw Error("The derived view and parent belong to different source corpora. The previous map was retained.");
    const context = immutableEvidenceContext(parent), existing = immutableEvidenceContext(target);
    if (context && parent.sourceCorpusId !== sourceCorpusId) throw Error("The pinned parent evidence has no verifiable source-corpus scope. Reopen its saved finding.");
    if (existing) {
      if (target.sourceCorpusId !== sourceCorpusId) throw Error("The derived evidence pin has no verifiable source-corpus scope.");
      if (context && ["evidenceId", "retrievedAt", "retrieval"].some((key) => existing[key] != null && context[key] != null && !equal(existing[key], context[key]))) throw Error("The derived view already identifies different pinned evidence. The previous map was retained.");
      if (existing.textVersions?.evidence != null && context?.textVersions?.evidence != null && !equal(existing.textVersions.evidence, context.textVersions.evidence)) throw Error("The derived view identifies a different retained evidence-text revision. The previous map was retained.");
    }
    return { ...target, sourceCorpusId, externalCorpus: parent?.externalCorpus === true || target.externalCorpus === true, ...existing || context ? { evidenceProvenance: existing || context } : {} };
  }

  // scripts/historiography.mjs
  var HISTORY_DEFAULTS = { core: 0, limit: 100, from: null, through: null, includeUndated: true };
  var citationKey = (edge) => JSON.stringify([edge.source, edge.target]);

  // scripts/scientific-manifest.mjs
  var SCIENCE_VERSION = "bibliomap-science-v1";
  var METHOD_REGISTRY = Object.freeze({
    leiden: { representations: ["pairwise", "higher-order", "hypergraph"], score: "CPM", parameters: ["resolution"], evidenceResampling: true },
    infomap: { representations: ["pairwise", "higher-order", "hypergraph"], score: "Map equation", parameters: ["markovTime"], evidenceResampling: true },
    hypergraph: { representations: ["hypergraph"], score: "Direct hypergraph modularity", parameters: ["hypergraphObjective", "hypergraphResolution", "hypergraphSearch"], evidenceResampling: true },
    sbm: { representations: ["pairwise", "higher-order"], score: "Nested model description length", parameters: ["selectedLevel"], evidenceResampling: true },
    trial: { representations: ["hypergraph"], score: "Family-specific experimental objective", parameters: ["family", "k", "seed", "starts"], evidenceResampling: true },
    direct_citation: { representations: ["directed"], score: null, parameters: ["core", "from", "through", "includeUndated", "limit"], evidenceResampling: false }
  });
  function methodSupport(graph2) {
    if (graph2._backend === "independent-bnr-standalone" && graph2.importedStandalone) {
      const settings2 = graph2.clustering || {}, objective = settings2.objective;
      if (settings2.algorithm !== "leiden" || objective !== "modularity" || graph2.importedStandalone.objective && graph2.importedStandalone.objective !== objective || graph2.directed === true || graph2.networkModel && graph2.networkModel !== "pairwise" || graph2.order != null && graph2.order !== 2) return { supported: false, algorithm: settings2.algorithm || "unspecified", objective: objective || "unspecified", reason: "Unsupported retained standalone objective or representation; no native CPM fallback is permitted." };
      return { supported: true, algorithm: "leiden", representation: "pairwise", score: "Modularity", objective: "modularity", label: "Imported Leiden modularity", seed: Number.isSafeInteger(settings2.seed) ? settings2.seed : null, iterations: Number.isSafeInteger(settings2.iterations) && settings2.iterations > 0 ? settings2.iterations : null, parameters: ["seed", "iterations"], execution: "retained-standalone-import", nativeRecomputation: false, evidenceResampling: false, wholeHyperedgeRoles: false, constructionComparison: false, marginNull: false, reminingAudit: false, semanticSensitivity: false, collaborationSensitivity: false };
    }
    if (graph2.collaboration && (!["author", "institution", "country"].includes(graph2.collaboration.kind) || graph2.entityKind !== graph2.collaboration.kind || graph2.networkModel !== "pairwise" || graph2.order !== 2 || graph2.clustering?.algorithm !== "leiden" || !["full-pair", "fractional-pair"].includes(graph2.collaboration.counting))) return { supported: false, reason: "Unknown collaboration actor construction/search. Only declared pairwise Leiden CPM is implemented." };
    if (graph2.semantic && (!["terms", "topics", "embeddings"].includes(graph2.semantic.kind) || graph2.networkModel !== "pairwise" || graph2.clustering?.algorithm !== "leiden")) return { supported: false, reason: "Unknown or unsupported semantic construction/search. Semantic views currently use pairwise Leiden CPM." };
    const history = graph2.directed === true || graph2.method === "direct_citation" || graph2.canvasKind === "historiography";
    const declared = graph2.clustering?.algorithm;
    const algorithm = history ? "direct_citation" : graph2.trial ? "trial" : declared === "Leiden CPM" ? "leiden" : declared;
    const representation = history ? "directed" : graph2.networkModel === "hypergraph" || algorithm === "hypergraph" ? "hypergraph" : graph2.networkModel === "higher-order" || graph2.order === "all" || Number(graph2.order) > 2 ? "higher-order" : "pairwise";
    const entry = METHOD_REGISTRY[algorithm];
    if (graph2.networkModel && !["pairwise", "hypergraph", "higher-order", ...history ? ["direct-citation"] : []].includes(graph2.networkModel)) return { supported: false, algorithm, representation: graph2.networkModel, reason: "Unknown network representation." };
    if (!entry) return { supported: false, algorithm: algorithm || "unspecified", representation, reason: "Unknown or unspecified method. No algorithm fallback is permitted." };
    if (!entry.representations.includes(representation)) return { supported: false, algorithm, representation, reason: "This score/search does not support the selected representation." };
    if (algorithm === "trial" && !["spectral", "aon", "balanced", "local", "categorical"].includes(graph2.trial?.result?.family)) return { supported: false, algorithm, representation, reason: "Unknown experimental family." };
    if (algorithm === "hypergraph" && (!["linear", "majority", "quadratic", "strict"].includes(graph2.clustering?.hypergraphObjective || "linear") || !["mixed", "leiden-seeded", "group-moves", "annealing"].includes(graph2.clustering?.hypergraphSearch || "mixed"))) return { supported: false, algorithm, representation, reason: "Unknown direct hypergraph objective or search." };
    return { supported: true, algorithm, representation, ...entry, evidenceResampling: !graph2.collaboration && !graph2.temporalSelection && !graph2.semantic && entry.evidenceResampling, wholeHyperedgeRoles: false, constructionComparison: !graph2.collaboration && !graph2.temporalSelection && !graph2.semantic && !history && representation === "pairwise", marginNull: !graph2.collaboration && !graph2.temporalSelection && !graph2.semantic && !history && representation === "pairwise", reminingAudit: false, semanticSensitivity: !!graph2.semantic, collaborationSensitivity: !!graph2.collaboration };
  }
  var hasText = (value) => typeof value === "string" && value.trim() && !/^https?:\/\/openalex\.org\//i.test(value.trim());
  function evidenceCoverage(records = [], options = {}) {
    const works = Array.isArray(records) ? records : Object.values(records || {}), count = works.length;
    const refs = (work) => work.references || work.referenced_works;
    const withReferences = works.filter((work) => Array.isArray(refs(work)) && refs(work).length > 0).length;
    const titles = works.filter((work) => hasText(work.display_name || work.title)).length;
    const abstracts = works.filter((work) => hasText(work.abstract) || Object.keys(work.abstract_inverted_index || {}).length > 0).length;
    const dated = works.filter((work) => /^\d{4}-\d{2}-\d{2}$/.test(work.publication_date || "")).length;
    const years = works.filter((work) => Number.isInteger(work.publication_year ?? work.year)).length;
    const authorshipLength = (work) => Array.isArray(work.authorships) ? work.authorships.length : work.retainedAuthorshipCount;
    const truncated = works.filter((work) => Number.isInteger(work.authors_count) && Number.isInteger(authorshipLength(work)) && work.authors_count > authorshipLength(work)).length;
    const authorCountKnown = works.filter((work) => Number.isInteger(work.authors_count) && Number.isInteger(authorshipLength(work))).length;
    return { records: count, scope: options.scope || "Supplied evidence records", withReferences, referenceCompleteness: "Unknown; empty lists are unavailable evidence, not proven zero bibliographies.", withoutAvailableReferences: count - withReferences, titles, abstracts, exactDates: dated, publicationYears: years, authorCountKnown, potentiallyTruncatedAuthorships: truncated, authorshipTruncation: authorCountKnown ? "Checked only where both authors_count and authorships were retained." : "Not assessable: author-count diagnostics were not retained.", identifiers: works.filter((work) => work.doi).length, topics: works.filter((work) => work.topics?.length).length, affiliations: works.filter((work) => work.authorships?.some((authorship) => authorship.institutions?.length)).length, funding: works.filter((work) => work.funders?.length || work.awards?.length).length, warnings: [!abstracts && count ? "No abstracts in these supplied records; title-only text analyses must be labeled." : null, count && authorCountKnown < count ? "Authorship truncation cannot be checked for every record." : null].filter(Boolean) };
  }
  function canonicalScience(value) {
    if (value === null || typeof value !== "object") {
      if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Nonfinite values cannot identify scientific inputs.");
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) return "[" + value.map((item) => canonicalScience(item === void 0 ? null : item)).join(",") + "]";
    return "{" + Object.keys(value).filter((key) => value[key] !== void 0).sort().map((key) => JSON.stringify(key) + ":" + canonicalScience(value[key])).join(",") + "}";
  }
  async function scienceDigest(value) {
    const encoded = new TextEncoder().encode(canonicalScience(value));
    const bytes = await globalThis.crypto.subtle.digest("SHA-256", encoded);
    return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  var sorted = (values) => [...new Set(values || [])].sort();
  function scientificInputs(graph2, records = [], context = {}) {
    const evidence = (Array.isArray(records) ? records : Object.values(records || {})).map((work) => ({ id: work.id, references: sorted(work.references || work.referenced_works), year: work.publication_year ?? work.year ?? null, publicationDate: work.publication_date || null, variants: sorted(work.variants || work.sourceIds || [work.id]) })).sort((left, right) => left.id.localeCompare(right.id));
    const text = { sources: (Array.isArray(records) ? records : Object.values(records || {})).map((work) => ({ id: work.id, title: work.display_name || work.title || null, abstract: work.abstract || work.abstract_inverted_index || null, topics: work.topics || null })).sort((left, right) => left.id.localeCompare(right.id)), analyzedNodes: graph2.nodes.map((node) => ({ id: node.id, title: node.title || node.label || null, abstract: node.abstract || node.abstract_inverted_index || null })).sort((left, right) => left.id.localeCompare(right.id)) };
    const nodes2 = graph2.nodes.map((node) => ({ id: node.id, references: sorted(node.references), articles: sorted(node.articles), cluster: node.cluster ?? null })).sort((left, right) => left.id.localeCompare(right.id));
    const directed = graph2.directed === true || graph2.method === "direct_citation" || graph2.canvasKind === "historiography";
    const links2 = graph2.links.map((edge) => {
      const ends = directed ? [edge.source, edge.target] : [edge.source, edge.target].sort();
      return { source: ends[0], target: ends[1], rawSupport: Object.hasOwn(edge, "rawSupport") ? edge.rawSupport : edge.count ?? null, weight: edge.strength ?? edge.weight ?? 1, articles: sorted(edge.articles), references: sorted(edge.references) };
    }).sort((left, right) => canonicalScience(left).localeCompare(canonicalScience(right)));
    const hyperedges = (graph2.hyperedges || []).map((edge) => ({ members: sorted(edge.members), articles: sorted(edge.articles), reference: edge.reference || null, weight: edge.weight, support: edge.support ?? edge.articles?.length ?? null })).sort((left, right) => canonicalScience(left).localeCompare(canonicalScience(right)));
    return { version: SCIENCE_VERSION, evidence, text, network: { nodes: nodes2, links: links2, hyperedges, directed, method: graph2.method || graph2.canvasKind || "cocitation", order: graph2.order ?? 2, maximumOrder: graph2.maximumOrder ?? null, threshold: graph2.threshold ?? null, minimumSupport: graph2.minimumSupport ?? graph2.minimumShared ?? null, minimumCosine: graph2.minimumCosine ?? null, normalization: graph2.normalization || context.normalization || "Legacy definition; inspect source analysis", counting: graph2.construction?.counting || graph2.counting || context.counting || "Legacy definition; inspect source analysis", metric: graph2.metric || null }, settings: { ...graph2.clustering, collaboration: graph2.collaboration || null, semantic: graph2.semantic || null, temporal: graph2.temporalSelection || graph2.temporalSeries?.settings || null, bursts: graph2.burstReport?.settings || null, temporalImplementation: graph2.temporalSeries?.implementationVersion || graph2.temporalSeries?.version || null, burstImplementation: graph2.burstReport?.implementationVersion || graph2.burstReport?.version || null, resolution: graph2.resolution ?? null, trial: graph2.trial?.result?.settings || null, history: graph2.historiography?.settings || null }, identity: graph2.deduplication || context.identity || null, versions: context.versions || { implementation: "Legacy/unverified; not eligible for equivalent-computation reuse" } };
  }
  async function createScientificManifest(graph2, records = [], context = {}) {
    const previous = graph2.scientificManifest;
    context = { evidenceId: previous?.evidence?.id || graph2.evidenceId || null, retrievedAt: previous?.evidence?.retrievedAt || graph2.retrievedAt || null, retrieval: previous?.evidence?.retrieval || graph2.retrieval || null, completeness: previous?.evidence?.completeness, versions: previous?.versions, textVersions: previous?.dependencies?.textVersions, ...graph2.evidenceProvenance, ...context };
    const input = scientificInputs(graph2, records, context), support = methodSupport(graph2);
    const [evidence, text, network, analysis] = await Promise.all([scienceDigest({ evidence: input.evidence, identity: input.identity }), scienceDigest({ text: input.text, versions: context.textVersions || null }), scienceDigest({ network: { ...input.network, nodes: input.network.nodes.map(({ cluster, ...node }) => node) }, versions: input.versions }), scienceDigest(input)]);
    return { version: SCIENCE_VERSION, createdAt: (/* @__PURE__ */ new Date()).toISOString(), fingerprints: { algorithm: "SHA-256", evidence, text, network, analysis, eligibility: "Audit fingerprints only. Server authorization, dependency versions and scope decide shared reuse." }, evidence: { id: context.evidenceId || graph2.evidenceId || null, retrievedAt: context.retrievedAt || graph2.retrievedAt || null, retrieval: context.retrieval || graph2.retrieval || null, completeness: context.completeness || "Unknown unless recorded by retrieval", coverage: evidenceCoverage(records) }, method: support, construction: { ...input.network, nodes: void 0, links: void 0, hyperedges: void 0, nodesCount: input.network.nodes.length, linksCount: input.network.links.length, hyperedgesCount: input.network.hyperedges.length, rawSupportMeaning: graph2._backend === "independent-bnr-standalone" && graph2.importedStandalone ? graph2.construction?.method === "bibliographic_coupling" ? "Distinct shared references for each imported bibliographic-coupling edge, not supporting source records." : graph2.construction?.method === "semantic_embeddings" ? "Not defined for imported semantic edges: rawSupport is null. Edge weight is the retained MiniLM cosine, not citation evidence or a count of supporting records." : "Imported raw-support semantics are not specified here; inspect the original construction and retained report." : "Distinct supporting records. Weighted bootstrap multiplicities and fractional contributions are different quantities." }, settings: input.settings, identity: input.identity, versions: input.versions, dependencies: { textVersions: context.textVersions || null, descriptions: "Generated descriptions require their model, prompt, text evidence and sibling memberships; these audit hashes alone do not authorize reuse." }, humanInterpretation: { status: "Not established by mathematical checks", aiDescriptions: "Suggested summaries, not evidence of thematic validity." } };
  }
  function validationDimensions(graph2, coverage, roleResult = null) {
    if (graph2.collaboration) {
      const audit2 = graph2.collaborationSensitivity, metadata = graph2.collaboration.coverage;
      return [{ id: "evidence", label: "Evidence quality", status: "coverage-recorded", outcome: metadata.retainedAuthorshipLists + "/" + metadata.records + " retained authorship lists; " + metadata.potentiallyTruncatedLists + " reported truncation flags; " + metadata.reportedAuthorCountsUnknown + " author counts unknown. " + metadata.completeness }, { id: "solver", label: "Calculation", status: methodSupport(graph2).supported ? "completed" : "unsupported", outcome: "Three seeded Leiden CPM fits of the declared collaboration projection; no global optimum/social-validity guarantee." }, { id: "robustness", label: "Structural robustness", status: "not-assessed", outcome: "No per-cluster collaboration recovery rating. Citation resampling is not applicable." }, { id: "construction", label: "Construction sensitivity", status: audit2?.completed > 0 ? "assessed" : audit2 ? "unavailable" : "not-assessed", outcome: audit2 ? audit2.completed + "/" + audit2.attempted + " alternatives completed. " + audit2.limitation : "Counting/team/affiliation alternatives and human-audited identity scenarios are separate from citation checks." }, { id: "null", label: "Statistical baseline", status: "not-implemented", outcome: "No work\u2013actor bipartite statistical null model is implemented. Construction sensitivity is not significance." }, { id: "interpretation", label: "Researcher interpretation", status: "needs-review", outcome: graph2.collaboration.limitations }];
    }
    const support = methodSupport(graph2), result = graph2.reliability, nullAudit = graph2.scienceAudit?.null;
    const semanticState = graph2.semanticSensitivity?.completed > 0 ? graph2.semanticSensitivity.status === "partial" ? "partial" : "assessed" : graph2.semanticSensitivity ? "unavailable" : "not-assessed";
    return [
      { id: "evidence", label: "Evidence quality", status: coverage.records ? "coverage-recorded" : "unavailable", outcome: coverage.records ? coverage.withReferences + " of " + coverage.records + " records have available references; completeness unknown." : "No source records supplied; coverage cannot be established." },
      { id: "solver", label: "Calculation", status: !support.supported ? "unsupported" : graph2.trial?.result?.converged === false || graph2.clustering?.converged === false ? "limit-reached" : graph2.trial?.result?.converged === true || graph2.clustering?.converged === true ? "completed" : "not-reported", outcome: !support.supported ? support.reason : "Numerical/search completion is not structural stability or global optimality." },
      { id: "robustness", label: "Structural robustness", status: graph2.semantic ? semanticState : result ? result.preliminary ? "preliminary" : "assessed" : "not-assessed", outcome: graph2.semantic ? graph2.semanticSensitivity ? graph2.semanticSensitivity.completed + " of " + graph2.semanticSensitivity.attempted + " attempted variants assessed. " + graph2.semanticSensitivity.limitation : "Text/threshold sensitivity has not been checked. Citation resampling is not applicable to this semantic representation." : result ? result.samples + " evidence resamples. Optimization variability is included unless assessed separately. " + (result.limitations || "") : "Evidence resampling has not completed." },
      { id: "construction", label: "Construction sensitivity", status: graph2.semantic ? semanticState : graph2.scienceAudit?.construction ? "assessed" : "not-assessed", outcome: graph2.semantic ? graph2.semanticSensitivity?.completed > 0 ? "Bounded feature/text/threshold alternatives compared. The cached model stays fixed; this is not model-general robustness." : "No successful semantic comparison yet. Use the text & threshold check; failed variants do not count as evidence. Citation counting/normalization comparisons do not apply." : graph2.scienceAudit?.construction ? "Alternative connection definitions compared; inspect memberships and coverage, not incompatible objective scores." : "Counting, normalization and threshold alternatives have not been compared." },
      { id: "null", label: "Statistical baseline", status: graph2.semantic ? "not-implemented" : nullAudit?.status || "not-assessed", outcome: graph2.semantic ? "No semantic statistical null model is implemented. Citation-margin randomization is not applicable. Sensitivity does not establish significance." : nullAudit?.limitation || "No completed margin-preserving null-model assessment. Stability is not statistical significance." },
      { id: "interpretation", label: "Researcher interpretation", status: "needs-review", outcome: "AI names and role labels are suggestions, not validation of themes, relevance or quality." }
    ];
  }

  // scripts/evidence-metrics.mjs
  function clusterRecovery(original2, sampled) {
    const base = /* @__PURE__ */ new Map(), next = /* @__PURE__ */ new Map();
    for (const [id, cluster] of Object.entries(original2)) if (+cluster > 0) {
      if (!base.has(cluster)) base.set(cluster, /* @__PURE__ */ new Set());
      base.get(cluster).add(id);
    }
    for (const [id, cluster] of Object.entries(sampled)) if (+cluster > 0) {
      if (!next.has(cluster)) next.set(cluster, /* @__PURE__ */ new Set());
      next.get(cluster).add(id);
    }
    const results = {};
    for (const [cluster, members] of base) {
      let best = 0, retained = 0;
      for (const id of members) if (+sampled[id] > 0) retained++;
      for (const candidates of next.values()) {
        let overlap = 0;
        for (const id of members) if (candidates.has(id)) overlap++;
        best = Math.max(best, overlap / (members.size + candidates.size - overlap));
      }
      results[cluster] = { jaccard: best, retention: retained / members.size, size: members.size };
    }
    return results;
  }

  // scripts/community-loader.mjs
  function createCommunityLoader(host2, document2, timeoutMs = 6e4) {
    let pending;
    const ready = () => typeof host2.ATLAS_COMMUNITIES?.start === "function" && typeof host2.ATLAS_COMMUNITIES?.startReliability === "function";
    const attempt = (retry) => new Promise((resolve, reject) => {
      const script = document2.createElement("script");
      const timer = setTimeout(() => finish(new Error("Loading timed out.")), timeoutMs);
      const finish = (error) => {
        clearTimeout(timer);
        script.onload = null;
        script.onerror = null;
        script.remove();
        if (error) reject(error);
        else resolve(host2.ATLAS_COMMUNITIES);
      };
      script.src = "./community-methods.js?v=coupling-errors-2" + (retry ? "&retry=" + Date.now() : "");
      script.async = true;
      script.onload = () => finish(ready() ? null : new Error("The analysis engine did not initialize."));
      script.onerror = () => finish(new Error("The analysis engine could not be downloaded."));
      document2.head.append(script);
    });
    return function loadCommunities2() {
      if (ready()) return Promise.resolve(host2.ATLAS_COMMUNITIES);
      if (!pending) pending = attempt(false).catch(() => attempt(true)).catch(() => {
        throw new Error("Could not load the analysis engine after two attempts. Check your connection, then run the check again.");
      }).finally(() => {
        pending = null;
      });
      return pending;
    };
  }
  var loadCommunities = typeof window === "undefined" ? null : createCommunityLoader(window, document);

  // node_modules/ngraph.leiden/dist/ngraph-leiden.es.js
  var V = { exports: {} };
  var Z;
  function rt() {
    if (Z) return V.exports;
    Z = 1, V.exports = t, V.exports.random = t, V.exports.randomIterator = c;
    function t(e) {
      var s = typeof e == "number" ? e : +/* @__PURE__ */ new Date();
      return new n(s);
    }
    function n(e) {
      this.seed = e;
    }
    n.prototype.next = f, n.prototype.nextDouble = i, n.prototype.uniform = i, n.prototype.gaussian = o, n.prototype.random = i;
    function o() {
      var e, s, y;
      do
        s = this.nextDouble() * 2 - 1, y = this.nextDouble() * 2 - 1, e = s * s + y * y;
      while (e >= 1 || e === 0);
      return s * Math.sqrt(-2 * Math.log(e) / e);
    }
    n.prototype.levy = u;
    function u() {
      var e = 1.5, s = Math.pow(
        r(1 + e) * Math.sin(Math.PI * e / 2) / (r((1 + e) / 2) * e * Math.pow(2, (e - 1) / 2)),
        1 / e
      );
      return this.gaussian() * s / Math.pow(Math.abs(this.gaussian()), 1 / e);
    }
    function r(e) {
      return Math.sqrt(2 * Math.PI / e) * Math.pow(1 / Math.E * (e + 1 / (12 * e - 1 / (10 * e))), e);
    }
    function i() {
      var e = this.seed;
      return e = e + 2127912214 + (e << 12) & 4294967295, e = (e ^ 3345072700 ^ e >>> 19) & 4294967295, e = e + 374761393 + (e << 5) & 4294967295, e = (e + 3550635116 ^ e << 9) & 4294967295, e = e + 4251993797 + (e << 3) & 4294967295, e = (e ^ 3042594569 ^ e >>> 16) & 4294967295, this.seed = e, (e & 268435455) / 268435456;
    }
    function f(e) {
      return Math.floor(this.nextDouble() * e);
    }
    function c(e, s) {
      var y = s || t();
      if (typeof y.next != "function")
        throw new Error("customRandom does not match expected API: next() function is missing");
      return {
        /**
         * Visits every single element of a collection once, in a random order.
         * Note: collection is modified in place.
         */
        forEach: C,
        /**
         * Shuffles array randomly, in place.
         */
        shuffle: I
      };
      function I() {
        var w, h, g;
        for (w = e.length - 1; w > 0; --w)
          h = y.next(w + 1), g = e[h], e[h] = e[w], e[w] = g;
        return e;
      }
      function C(w) {
        var h, g, b;
        for (h = e.length - 1; h > 0; --h)
          g = y.next(h + 1), b = e[g], e[g] = e[h], e[h] = b, w(b);
        e.length && w(e[0]);
      }
    }
    return V.exports;
  }
  var ct = rt();

  // scripts/auto-cpm.mjs
  function agreement(first, second) {
    const ids = Object.keys(first).filter((id) => second[id]), rows = /* @__PURE__ */ new Map(), columns = /* @__PURE__ */ new Map(), cells = /* @__PURE__ */ new Map(), pairs = (count) => count * (count - 1) / 2;
    if (ids.length < 2) return 0;
    for (const id of ids) {
      rows.set(first[id], (rows.get(first[id]) || 0) + 1);
      columns.set(second[id], (columns.get(second[id]) || 0) + 1);
      const key = first[id] + "|" + second[id];
      cells.set(key, (cells.get(key) || 0) + 1);
    }
    const sum = (map) => [...map.values()].reduce((total, count) => total + pairs(count), 0), joint = sum(cells), row = sum(rows), column = sum(columns), expected = row * column / pairs(ids.length), denominator = (row + column) / 2 - expected;
    return denominator ? (joint - expected) / denominator : 1;
  }

  // scripts/optimization-variability.mjs
  async function optimizationVariability(graph2, fit2, progress = () => {
  }, options = {}) {
    const fits = options.fits ?? 5;
    if (fits !== 5) throw new Error("This diagnostic uses five fixed-evidence fits.");
    const results = [];
    for (let position = 0; position < fits; position++) {
      const seed = 20261019 + position * 101;
      progress("Fixed-evidence fit " + (position + 1) + "/" + fits);
      const result = await fit2(structuredClone(graph2), { ...graph2.clustering, resolution: graph2.resolution, trials: 1, seed });
      const memberships = result.memberships || Object.fromEntries(result.nodes.map((node) => [node.id, node.cluster]));
      results.push({ seed, memberships, quality: result.quality ?? result.clustering?.quality ?? null, converged: result.converged ?? result.clustering?.converged ?? null, linked: graph2.nodes.filter((node) => Number(memberships[node.id]) > 0).length });
    }
    const similarities = [];
    const labels = (result) => Object.fromEntries(graph2.nodes.map((node) => [node.id, Number(result.memberships[node.id]) > 0 ? String(result.memberships[node.id]) : "unassigned:" + node.id]));
    for (let left = 0; left < results.length; left++) for (let right = left + 1; right < results.length; right++) similarities.push(graph2.nodes.length < 2 ? 1 : agreement(labels(results[left]), labels(results[right])));
    return { version: "optimization-variability-v1", fits, evidenceFixed: true, results, agreement: { mean: similarities.reduce((sum, value) => sum + value, 0) / similarities.length, minimum: Math.min(...similarities) }, limitation: "Optimization-only variability on unchanged evidence and settings; distinct seeds, one requested start per fit where supported. Engine-specific fixed initialization budgets remain in force. Agreement uses the full supplied article universe, treating unassigned articles as distinct singletons, not one community. This is not evidence-bootstrap stability, an optimum guarantee, statistical significance or thematic validation." };
  }

  // scripts/canvas-science.mjs
  var recordsByGraph = /* @__PURE__ */ new WeakMap();
  var active;
  var element = (tag, text = "") => {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
  };
  var button = (label, callback) => {
    const node = element("button", label);
    node.type = "button";
    node.className = "secondary";
    node.onclick = callback;
    return node;
  };
  var paragraphs = (parent, values) => values.filter(Boolean).forEach((value) => parent.append(element("p", value)));
  var number = (value) => Number.isFinite(value) ? Number(value.toPrecision(4)).toString() : "Not assessed";
  var percent = (value) => Number.isFinite(value) ? (100 * value).toFixed(1) + "%" : "Not assessed";
  async function fullEvidence(record) {
    const packet = await window.ATLAS_EVIDENCE.prepareDataset(), expected = record.graph.sourceCorpusId || window.ATLAS_DATA?.summary?.corpus_id;
    if (expected && packet.sourceCorpusId !== expected) throw new Error("Source evidence does not match this map.");
    record.sources = packet.articles;
    record.fullLoaded = true;
    return packet.articles;
  }
  async function prepareScientificExport(graph2) {
    const record = recordsByGraph.get(graph2), sources = record ? await fullEvidence(record) : Object.values(window.ATLAS_DATA?.articles || {});
    graph2.scientificManifest = await createScientificManifest(graph2, sources);
    return graph2.scientificManifest;
  }
  if (typeof window !== "undefined") window.ATLAS_SCIENCE = { prepareExport: prepareScientificExport, cancel: cancelScience };
  function stop(record) {
    record.ticket++;
    record.worker?.terminate();
    record.worker = null;
    record.fitting?.cancel();
    record.fitting = null;
    record.running = false;
  }
  function cancelScience() {
    if (!active) return;
    const record = recordsByGraph.get(active);
    if (record?.running) {
      stop(record);
      record.status.textContent = "Cancelled. No partial audit installed.";
      draw(record);
    }
  }
  function workerTask(record, kind, options = {}, graph2 = record.graph) {
    if (window.BIBLIOMAP?.active && kind !== "manifest" && kind !== "fit") {
      const stage2 = { roles: "scientific-roles", null: "incidence-null", construction: "construction-comparison", roleSensitivity: "role-sensitivity", optimization: "optimization-variability" }[kind];
      record.fitting = window.BIBLIOMAP.stage(graph2, stage2, options, (message) => {
        record.status.textContent = message;
      });
      return record.fitting.promise.finally(() => {
        record.fitting = null;
      });
    }
    return new Promise((resolve, reject) => {
      const worker2 = new Worker("science-worker.js?v=coupling-errors-2");
      record.worker = worker2;
      worker2.onmessage = (event) => {
        if (record.worker !== worker2) return;
        if (event.data.progress) {
          record.status.textContent = event.data.progress;
          return;
        }
        worker2.terminate();
        if (record.worker === worker2) record.worker = null;
        Object.hasOwn(event.data, "error") ? reject(new Error(analysisErrorMessage(event.data.error))) : resolve(event.data.result);
      };
      worker2.onerror = (event) => {
        worker2.terminate();
        if (record.worker === worker2) record.worker = null;
        reject(new Error(analysisErrorMessage(event)));
      };
      worker2.postMessage({ kind, graph: graph2, records: record.sources, options });
    });
  }
  async function run(record, kind, options = {}) {
    if (record.running) return;
    if (kind !== "manifest" && (record.graph.temporalSelection || record.graph.collaboration?.ego)) {
      record.status.textContent = "Return to the full pinned map before running an audit. Neighborhood/window browsing does not submit new jobs.";
      return;
    }
    if (kind !== "manifest" && window.BIBLIOMAP?.active && window.BIBLIOMAP.canCompute === false) {
      record.status.textContent = "View-only project: ask an editor to run an audit.";
      return;
    }
    const ticket = ++record.ticket;
    record.running = true;
    draw(record);
    record.status.textContent = "Preparing " + kind + "\u2026";
    try {
      if (kind === "manifest") await fullEvidence(record);
      let result;
      if (kind === "optimization" && !window.BIBLIOMAP?.active) {
        const support = methodSupport(record.graph);
        await loadCommunities();
        result = await optimizationVariability(record.graph, async (candidate, settings2) => {
          if (ticket !== record.ticket) throw new Error("Optimization check cancelled.");
          if (support.algorithm === "leiden") return workerTask(record, "fit", { ...settings2, algorithm: "leiden" }, candidate);
          record.fitting = window.ATLAS_COMMUNITIES.start(candidate, support.algorithm, candidate.bundles || [], (message) => {
            if (ticket === record.ticket) record.status.textContent = message;
          }, { ...settings2, networkModel: candidate.networkModel || "pairwise" });
          const fitted = await record.fitting.promise;
          record.fitting = null;
          return fitted;
        }, (message) => {
          record.status.textContent = message;
        });
      } else result = await workerTask(record, kind, options);
      if (ticket !== record.ticket) return;
      if (kind === "construction" && !window.BIBLIOMAP?.active) {
        await loadCommunities();
        if (ticket !== record.ticket) return;
        const support = methodSupport(record.graph), original2 = Object.fromEntries(record.graph.nodes.map((node) => [node.id, node.cluster])), comparisons = [];
        for (const [position, candidate] of result.entries()) {
          record.status.textContent = "Comparing definition " + (position + 1) + "/" + result.length + " with the selected " + support.algorithm + " method\u2026";
          let fitted;
          if (support.algorithm === "leiden") fitted = await workerTask(record, "fit", { ...record.graph.clustering, algorithm: "leiden" }, candidate);
          else {
            record.fitting = window.ATLAS_COMMUNITIES.start(candidate, support.algorithm, [], (message) => {
              if (record.ticket === ticket) record.status.textContent = message;
            }, { ...record.graph.clustering, resolution: record.graph.resolution, networkModel: "pairwise" });
            fitted = await record.fitting.promise;
            record.fitting = null;
          }
          if (ticket !== record.ticket) return;
          const recovery = clusterRecovery(original2, Object.fromEntries(fitted.nodes.map((node) => [node.id, node.cluster]))), clusterValues = Object.values(recovery), total = clusterValues.reduce((sum, value) => sum + value.size, 0);
          const baseEdges = new Set(record.graph.links.map((edge) => JSON.stringify([edge.source, edge.target].sort()))), nextEdges = new Set(candidate.links.map((edge) => JSON.stringify([edge.source, edge.target].sort()))), intersection = [...nextEdges].filter((key) => baseEdges.has(key)).length;
          comparisons.push({ definition: candidate.construction, edges: candidate.links.length, clusters: new Set(fitted.nodes.map((node) => node.cluster).filter((cluster) => cluster > 0)).size, edgeJaccard: intersection / (baseEdges.size + nextEdges.size - intersection || 1), weightedRecovery: total ? clusterValues.reduce((sum, value) => sum + value.jaccard * value.size, 0) / total : null, recovery, settings: { ...record.graph.clustering, resolution: record.graph.resolution }, nonconverged: fitted.clustering?.converged === false });
        }
        result = { version: "construction-comparison-v1", comparisons, limitation: "Construction-and-scale sensitivity at fixed selected settings, not a pure normalization-invariance test. Leiden rescales weights by mean edge weight, but fixed gamma need not imply equivalent effective granularity across weight distributions; no per-definition retuning occurs. Objective values are not compared across definitions. Block-model fits ignore weights. Reference/source universe stays fixed. Higher-order re-mining and ambiguous-identity scenarios are not performed. Recovery is descriptive best-match Jaccard, not chance-adjusted agreement or confidence." };
      }
      if (ticket !== record.ticket) return;
      if (kind === "manifest") {
        record.graph.scientificManifest = result;
        const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: "application/json" })), anchor = element("a");
        anchor.href = url;
        anchor.download = "bibliomap-analysis-manifest.json";
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1e3);
      } else {
        record.graph.scienceAudit = { ...record.graph.scienceAudit, [kind]: result };
        if (kind === "roles" || kind === "null") record[kind] = result;
      }
      record.status.textContent = kind === "manifest" ? "Manifest exported. Audit fingerprints do not authorize shared computation reuse." : "Completed " + kind + ". The map is unchanged.";
    } catch (error) {
      if (ticket === record.ticket) record.status.textContent = "Not completed: " + analysisErrorMessage(error);
    } finally {
      if (ticket === record.ticket) {
        record.running = false;
        draw(record);
      }
    }
  }
  function drawRoles(record, host2) {
    const result = record.roles;
    const noun = ["term", "topic", "author", "institution", "country"].includes(record.graph.entityKind) ? record.graph.entityKind : "article";
    host2.replaceChildren();
    if (!result) {
      host2.append(element("p", "Calculate " + noun + " roles on the full analytical network, not the currently visible subset."));
      return;
    }
    const searchLabel = element("label", "Find " + noun + (noun === "article" ? " by title or author" : " by label")), search2 = element("input");
    search2.type = "search";
    search2.value = record.roleQuery || "";
    search2.setAttribute("aria-label", "Find " + noun + " in roles");
    searchLabel.append(search2);
    const rankLabel = element("label", "Rank by"), rank = element("select");
    rank.setAttribute("aria-label", "Rank " + noun + " roles");
    for (const [value, label] of [...result.directed ? [["pageRank", "Citation PageRank"], ["incoming", "Incoming citations"], ["outgoing", "Outgoing citations"]] : [["externalStrength", "Cross-community weight"], ["participation", "Participation"], ["withinClusterZ", "Within-community position"]], ["core", "Core membership"], ...result.paths ? [["betweenness", "Path brokerage"]] : []]) rank.append(new Option(label, value));
    rankLabel.append(rank);
    const list = element("div");
    if (record.roleRank && [...rank.options].some((option) => option.value === record.roleRank)) rank.value = record.roleRank;
    const redraw = () => {
      record.roleQuery = search2.value;
      record.roleRank = rank.value;
      const query2 = search2.value.trim().toLowerCase(), selected2 = record.graph.nodes.filter((node) => !query2 || [node.title, node.label, node.authors, node.id].filter(Boolean).join(" ").toLowerCase().includes(query2)).sort((left, right) => (result.roles[right.id][rank.value] ?? -Infinity) - (result.roles[left.id][rank.value] ?? -Infinity));
      list.replaceChildren();
      for (const node of selected2.slice(0, 15)) {
        const role = result.roles[node.id], row = element("div");
        row.append(button(node.title || node.label || node.id, () => record.selectNode?.(node.id)));
        paragraphs(row, [role.label + " \xB7 " + rank.selectedOptions[0].textContent + ": " + number(role[rank.value]), role.degree + " neighbors \xB7 " + (result.directed ? role.incoming + " incoming / " + role.outgoing + " outgoing" : "external share " + percent(role.externalShare)) + " \xB7 core " + role.core + (role.degree < 3 ? " \xB7 Few connections: role interpretation is fragile." : "")]);
        list.append(row);
      }
      list.append(element("p", "Showing " + Math.min(15, selected2.length) + " of " + selected2.length + " matching " + (noun === "country" ? "countries" : noun + "s") + ". Labels are exploratory structural descriptions, not validated functional roles."));
    };
    search2.oninput = redraw;
    rank.onchange = redraw;
    host2.append(searchLabel, rankLabel, list);
    paragraphs(host2, [result.scope, result.limitations, result.paths ? "Path distance: " + result.paths.distance + "." : "Path brokerage has not been calculated."]);
    redraw();
  }
  function draw(record) {
    const coverage = evidenceCoverage(record.sources), dimensions = validationDimensions(record.graph, coverage), support = methodSupport(record.graph);
    if (record.coverageBody) record.coverageBody.replaceChildren(element("p", coverage.withReferences + "/" + coverage.records + " records with references \xB7 " + coverage.titles + " titles \xB7 " + coverage.abstracts + " abstracts \xB7 " + coverage.publicationYears + " publication years. Completeness unknown."), element("p", coverage.authorshipTruncation), element("p", coverage.authorCountKnown ? coverage.potentiallyTruncatedAuthorships + " potentially truncated author lists among " + coverage.authorCountKnown + " assessable records; remaining records unknown." : "Potentially truncated author lists: unknown."));
    record.dimensions.replaceChildren();
    for (const dimension of dimensions) {
      const line = element("details");
      line.append(element("summary", dimension.label + " \xB7 " + dimension.status.replaceAll("-", " ")), element("p", dimension.outcome));
      record.dimensions.append(line);
    }
    const readOnly = !!record.graph.temporalSelection || !!record.graph.collaboration?.ego || window.BIBLIOMAP?.active && window.BIBLIOMAP.canCompute === false;
    record.runRoles.disabled = record.running || readOnly;
    record.runPaths.disabled = record.running || readOnly;
    record.manifest.disabled = record.running;
    record.construction.disabled = record.running || readOnly || !support.constructionComparison;
    record.nullButton.disabled = record.running || readOnly || !support.marginNull;
    record.roleSensitivity.disabled = record.running || readOnly || !support.constructionComparison;
    record.optimization.disabled = record.running || readOnly || !support.constructionComparison || !["leiden", "infomap"].includes(support.algorithm);
    record.cancel.hidden = !record.running;
    record.construction.title = support.constructionComparison ? "" : "Available only for supported pairwise co-citation/coupling. No substitute method is run.";
    record.nullButton.title = support.marginNull ? "" : "Whole-hypergraph and directed null assessments are not implemented here.";
    record.unsupported.textContent = support.constructionComparison ? "Definition and rank checks are conditional on retained evidence. Optimization-only repeats currently support pairwise Leiden and Infomap." : "Connection-definition, role-resampling and margin-null comparisons currently support pairwise co-citation/coupling only. They do not substitute another method for directed, higher-order or hypergraph analysis. Article roles remain explicitly pair-based.";
    drawRoles(record, record.rolesHost);
    record.auditResults.replaceChildren();
    if (record.graph.scienceAudit?.construction) {
      const result = record.graph.scienceAudit.construction;
      for (const comparison of result.comparisons) record.auditResults.append(element("p", comparison.definition.counting + " \xB7 " + comparison.definition.normalization + " \xB7 support \u2265" + comparison.definition.minimumSupport + ": " + comparison.clusters + " groups, " + comparison.edges + " connections; edge overlap " + percent(comparison.edgeJaccard) + ", membership recovery " + percent(comparison.weightedRecovery) + (comparison.nonconverged ? " \xB7 solver limit reached" : "")));
      paragraphs(record.auditResults, [result.limitation]);
    }
    if (record.null) {
      const result = record.null;
      paragraphs(record.auditResults, ["Null baseline: " + result.status + " \xB7 " + result.samples + " samples \xB7 both incidence margins preserved. " + result.acceptedSwitches + " accepted switches.", result.multiplicityResolution, result.limitation]);
      const diagnostics = element("details");
      diagnostics.append(element("summary", "Null movement diagnostics and pair outcomes"), element("pre", JSON.stringify({ feasibility: result.feasibility, lagOne: result.lagOne, diagnostics: result.diagnostics, records: result.records }, null, 2)));
      record.auditResults.append(diagnostics);
    }
    if (record.graph.scienceAudit?.roleSensitivity) {
      const result = record.graph.scienceAudit.roleSensitivity;
      paragraphs(record.auditResults, ["Role sensitivity \xB7 " + result.samples + " resamples \xB7 original memberships fixed.", result.limitation]);
      const top = Object.entries(result.ranks).sort(([, left], [, right]) => right.topTen - left.topTen).slice(0, 10);
      for (const [id, rank] of top) {
        const node = record.graph.nodes.find((node2) => node2.id === id);
        paragraphs(record.auditResults, [(node.title || node.label || id) + " \xB7 top-ten credit " + percent(rank.topTen) + " \xB7 average rank percentile " + percent(rank.meanPercentile)]);
      }
    }
    if (record.graph.scienceAudit?.optimization) {
      const result = record.graph.scienceAudit.optimization;
      paragraphs(record.auditResults, ["Fixed-evidence optimization \xB7 " + result.fits + " fits \xB7 mean full-universe ARI " + number(result.agreement.mean) + " \xB7 minimum " + number(result.agreement.minimum), result.limitation]);
    }
  }
  function mountScience(parent, graph2, sources = [], options = {}) {
    if (!graph2?.nodes || !graph2?.links) return;
    if (active !== graph2) {
      cancelScience();
      active = graph2;
    }
    let record = recordsByGraph.get(graph2);
    if (!record) {
      const noun = ["term", "topic", "author", "institution", "country"].includes(graph2.entityKind) ? graph2.entityKind : "article";
      const panel = element("details");
      panel.id = graph2.canvasKind === "historiography" ? "historyScience" : "canvasScience";
      panel.className = "science-panel";
      panel.append(element("summary", "Evidence, validation & " + noun + " roles"));
      const dimensions = element("div"), actions = element("div");
      actions.className = "reliability-controls";
      record = { graph: graph2, panel, sources, dimensions, ticket: 0, selectNode: options.selectNode, roles: graph2.scienceAudit?.roles, null: graph2.scienceAudit?.null };
      record.runRoles = button(noun[0].toUpperCase() + noun.slice(1) + " roles", () => run(record, "roles"));
      record.runPaths = button("Add path brokerage", () => run(record, "roles", { paths: true }));
      record.manifest = button("Export analysis manifest", () => run(record, "manifest", options.context || {}));
      record.construction = button("Compare connection definitions", () => run(record, "construction"));
      record.nullButton = button("Deep null check \xB7 50", () => run(record, "null", { samples: 50 }));
      record.roleSensitivity = button("Role sensitivity \xB7 10", () => run(record, "roleSensitivity", { samples: 10 }));
      record.optimization = button("Repeat optimization \xB7 5", () => run(record, "optimization"));
      record.cancel = button("Cancel audit", () => {
        stop(record);
        record.status.textContent = "Cancelled. No partial audit installed.";
        draw(record);
      });
      record.status = element("p");
      record.status.setAttribute("role", "status");
      record.rolesHost = element("div");
      record.auditResults = element("div");
      record.unsupported = element("p");
      const evidence = element("details");
      record.coverageBody = element("div");
      evidence.append(element("summary", "Metadata coverage"), record.coverageBody);
      const loadMetadata = button("Load full available source metadata", async () => {
        loadMetadata.disabled = true;
        record.status.textContent = "Loading source metadata\u2026";
        try {
          await fullEvidence(record);
          record.status.textContent = "Loaded " + record.sources.length + " source records for " + (record.graph.sourceCorpusId || window.ATLAS_DATA?.summary?.corpus_id || "the current evidence") + ". Unretained fields remain unknown.";
          draw(record);
        } catch (error) {
          record.status.textContent = "Metadata not loaded: " + analysisErrorMessage(error);
        } finally {
          loadMetadata.disabled = false;
        }
      });
      evidence.append(loadMetadata);
      actions.append(record.runRoles, record.runPaths, record.manifest, record.construction, record.nullButton, record.roleSensitivity, record.optimization, record.cancel);
      panel.append(dimensions, evidence, actions, record.unsupported, record.status, record.rolesHost, record.auditResults, element("p", "The map remains unchanged. Deep checks are bounded and conditional on retained evidence. Full higher-order re-mining, identity-uncertainty audits and researcher thematic review are not automated."));
      recordsByGraph.set(graph2, record);
    }
    if (!record.fullLoaded) record.sources = sources;
    record.selectNode = options.selectNode || record.selectNode;
    parent.append(record.panel);
    draw(record);
    return record;
  }

  // scripts/network-roles.mjs
  var ROLE_VERSION = "network-roles-v1";
  function roleNetwork(graph2) {
    const ids = graph2.nodes.map((node) => node.id);
    if (new Set(ids).size !== ids.length || ids.some((id) => typeof id !== "string" || !id)) throw new Error("Roles require unique entity identifiers.");
    const positions = new Map(ids.map((id, position) => [id, position]));
    const directed = graph2.directed === true || graph2.method === "direct_citation" || graph2.canvasKind === "historiography";
    const edges = /* @__PURE__ */ new Map();
    for (const link of graph2.links || []) {
      if (!positions.has(link.source) || !positions.has(link.target)) throw new Error("A role connection refers to an unknown entity.");
      if (link.source === link.target) continue;
      const source = positions.get(link.source), target = positions.get(link.target), strength = directed ? 1 : Number(link.strength);
      if (!Number.isFinite(strength) || strength < 0) throw new Error("Role weights must be finite and nonnegative.");
      if (!strength) continue;
      const pair = directed || source < target ? [source, target] : [target, source], key = pair.join(":");
      if (edges.has(key)) throw new Error("Duplicate analytical connections must be consolidated before role analysis.");
      edges.set(key, { source: pair[0], target: pair[1], strength });
    }
    const adjacent = ids.map(() => []), weak = ids.map(() => /* @__PURE__ */ new Set());
    for (const edge of edges.values()) {
      adjacent[edge.source].push({ target: edge.target, weight: edge.strength });
      if (!directed) adjacent[edge.target].push({ target: edge.source, weight: edge.strength });
      weak[edge.source].add(edge.target);
      weak[edge.target].add(edge.source);
    }
    return { ids, directed, adjacent, weak, edges: [...edges.values()] };
  }
  function coreNumbers(weak) {
    const remaining = new Set(weak.map((_, position) => position)), degrees = weak.map((neighbors) => neighbors.size), core = weak.map(() => 0);
    let level = 0;
    while (remaining.size) {
      let chosen = remaining.values().next().value;
      for (const candidate of remaining) if (degrees[candidate] < degrees[chosen]) chosen = candidate;
      level = Math.max(level, degrees[chosen]);
      core[chosen] = level;
      remaining.delete(chosen);
      for (const neighbor of weak[chosen]) if (remaining.has(neighbor)) degrees[neighbor]--;
    }
    return core;
  }
  function directedPageRank(network, options = {}) {
    if (!network.directed) throw new Error("PageRank is only offered for direct citation networks.");
    const damping = options.damping ?? 0.85, tolerance = options.tolerance ?? 1e-10, maxIterations = options.maxIterations ?? 1e3;
    if (!(damping > 0 && damping < 1) || !(tolerance > 0) || !Number.isInteger(maxIterations) || maxIterations < 1) throw new Error("Invalid PageRank settings.");
    const count = network.ids.length;
    if (!count) return { values: [], converged: true, iterations: 0, residual: 0, damping };
    let values = Array(count).fill(1 / count), residual = Infinity;
    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      const dangling = values.reduce((sum, value, position) => sum + (network.adjacent[position].length ? 0 : value), 0);
      const next = Array(count).fill((1 - damping + damping * dangling) / count);
      network.adjacent.forEach((neighbors, source) => {
        for (const edge of neighbors) next[edge.target] += damping * values[source] / neighbors.length;
      });
      residual = next.reduce((sum, value, position) => sum + Math.abs(value - values[position]), 0);
      values = next;
      if (residual <= tolerance) return { values, converged: true, iterations: iteration, residual, damping };
    }
    return { values, converged: false, iterations: maxIterations, residual, damping };
  }
  function betweenness(network, distance = "inverse-strength", maximumOperations = 3e7) {
    if (!["inverse-strength", "unweighted"].includes(distance)) throw new Error("Choose inverse-strength or unweighted path distance.");
    if (network.directed && distance !== "unweighted") throw new Error("Direct citations use one step per citation, not inverse similarity.");
    const size = network.ids.length, centrality = Array(size).fill(0);
    let operations = 0;
    const push = (heap, item) => {
      heap.push(item);
      let position = heap.length - 1;
      while (position > 0) {
        const parent = Math.floor((position - 1) / 2);
        if (heap[parent].distance <= item.distance) break;
        heap[position] = heap[parent];
        position = parent;
      }
      heap[position] = item;
    };
    const pop = (heap) => {
      const first = heap[0], last = heap.pop();
      if (heap.length) {
        let position = 0;
        while (position * 2 + 1 < heap.length) {
          let child = position * 2 + 1;
          if (child + 1 < heap.length && heap[child + 1].distance < heap[child].distance) child++;
          if (heap[child].distance >= last.distance) break;
          heap[position] = heap[child];
          position = child;
        }
        heap[position] = last;
      }
      return first;
    };
    for (let source = 0; source < size; source++) {
      const lengths = Array(size).fill(Infinity), paths = Array(size).fill(0), predecessors = Array.from({ length: size }, () => []), order = [], visited = /* @__PURE__ */ new Set();
      lengths[source] = 0;
      paths[source] = 1;
      const heap = [{ target: source, distance: 0 }];
      while (heap.length) {
        const nearest = pop(heap).target;
        if (visited.has(nearest)) continue;
        visited.add(nearest);
        order.push(nearest);
        for (const edge of network.adjacent[nearest]) {
          if (++operations > maximumOperations) throw new Error("Exact path analysis exceeded its calculation budget. Narrow the analytical scope; no partial scores were published.");
          const candidate = lengths[nearest] + (distance === "unweighted" ? 1 : 1 / edge.weight), tolerance = 1e-12 * Math.max(Number.MIN_VALUE, Math.abs(candidate), Number.isFinite(lengths[edge.target]) ? lengths[edge.target] : 0);
          if (!Number.isFinite(candidate)) throw new Error("Path weights are outside the supported numeric range.");
          if (candidate < lengths[edge.target] - tolerance) {
            lengths[edge.target] = candidate;
            paths[edge.target] = paths[nearest];
            predecessors[edge.target] = [nearest];
            push(heap, { target: edge.target, distance: candidate });
          } else if (!visited.has(edge.target) && Math.abs(candidate - lengths[edge.target]) <= tolerance) {
            paths[edge.target] += paths[nearest];
            predecessors[edge.target].push(nearest);
          }
          if (!Number.isFinite(paths[edge.target])) throw new Error("Too many equal shortest paths for exact numeric brokerage; no partial scores published.");
        }
      }
      const dependency = Array(size).fill(0);
      for (const target of order.reverse()) {
        for (const previous of predecessors[target]) dependency[previous] += paths[previous] / paths[target] * (1 + dependency[target]);
        if (target !== source) centrality[target] += dependency[target];
      }
    }
    const denominator = size > 2 ? (size - 1) * (size - 2) : 1;
    return { values: centrality.map((value) => value / denominator), distance, normalized: true, operations };
  }
  function analyzeRoles(graph2, options = {}) {
    const network = roleNetwork(graph2);
    if (network.ids.length > 1500 || network.edges.length > 1e5) throw new Error("Role analysis supports at most 1,500 articles and 100,000 connections. Narrow the analytical scope.");
    const cores = coreNumbers(network.weak), roles = Object.fromEntries(network.ids.map((id, position) => [id, { degree: network.weak[position].size, strength: 0, internalStrength: 0, externalStrength: 0, incoming: 0, outgoing: 0, core: cores[position], connections: {} }]));
    const nodes2 = new Map(graph2.nodes.map((node) => [node.id, node]));
    for (const edge of network.edges) {
      const source = network.ids[edge.source], target = network.ids[edge.target];
      if (network.directed) {
        roles[source].outgoing++;
        roles[target].incoming++;
      }
      for (const [id, other] of [[source, target], [target, source]]) {
        const role = roles[id], cluster = Number(nodes2.get(other).cluster) || 0;
        role.strength += edge.strength;
        role.connections[cluster] = (role.connections[cluster] || 0) + edge.strength;
        if (cluster > 0 && cluster === Number(nodes2.get(id).cluster)) role.internalStrength += edge.strength;
        else role.externalStrength += edge.strength;
      }
    }
    const groups = /* @__PURE__ */ new Map();
    for (const node of graph2.nodes) {
      const cluster = Number(node.cluster) || 0;
      if (!groups.has(cluster)) groups.set(cluster, []);
      groups.get(cluster).push(roles[node.id].internalStrength);
    }
    for (const node of graph2.nodes) {
      const role = roles[node.id], cluster = Number(node.cluster) || 0, values = groups.get(cluster), mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      const deviation = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
      role.withinClusterZ = cluster > 0 && deviation > 0 ? (role.internalStrength - mean) / deviation : null;
      role.participation = cluster > 0 && role.strength ? Math.max(0, 1 - Object.values(role.connections).reduce((sum, value) => sum + (value / role.strength) ** 2, 0)) : null;
      role.externalShare = role.strength ? role.externalStrength / role.strength : null;
      role.connectedClusters = Object.keys(role.connections).map(Number).filter((other) => other > 0 && other !== cluster);
      role.label = !role.degree ? "No eligible connections" : network.directed ? "Citation-network position" : cluster <= 0 ? "Outside assigned communities" : role.withinClusterZ >= 2 && role.participation < 0.3 ? "Local hub" : role.connectedClusters.length >= 2 && role.participation >= 0.3 ? "Cross-community connector" : role.externalStrength ? "Some cross-community connections" : "Within-community connections";
    }
    let paths = null, pageRank = null;
    if (options.paths) {
      paths = betweenness(network, network.directed ? "unweighted" : options.distance || "inverse-strength", options.maximumOperations);
      network.ids.forEach((id, position) => {
        roles[id].betweenness = paths.values[position];
      });
    }
    if (network.directed) {
      pageRank = directedPageRank(network, options.pageRank);
      network.ids.forEach((id, position) => {
        roles[id].pageRank = pageRank.values[position];
      });
    }
    return { version: ROLE_VERSION, directed: network.directed, scope: "Full supplied analytical network, before display filtering. Citation history may supply a capped analytical result; this is not catalogue-wide prominence.", roles, paths, pageRank, limitations: "Roles describe connectivity, not quality, relevance, agreement or causal influence. Core numbers ignore direction. Community-role labels are descriptive heuristics, not validated classes. Hypergraph views use pair connections, not whole-hyperedge roles. Inverse-strength distances assume stronger similarities are shorter paths; shortest paths are not observed knowledge-transfer routes." };
  }

  // scripts/historiography-browser.mjs
  var shared = window.atlasSharedCanvas;
  var original = { ...shared };
  var byId = (id) => document.getElementById(id);
  var make = (tag, content = "", className = "") => {
    const node = document.createElement(tag);
    node.textContent = content;
    node.className = className;
    return node;
  };
  var action = (title, handler) => {
    const button2 = make("button", title, "secondary");
    button2.type = "button";
    button2.onclick = handler;
    return button2;
  };
  var tabs = document.querySelector(".workspace-tabs");
  var tab = action("Citation history", () => open());
  tab.id = "workspace-history";
  tab.setAttribute("role", "tab");
  tab.setAttribute("aria-controls", "cocitation-workspace");
  tab.setAttribute("aria-selected", "false");
  tab.tabIndex = -1;
  tabs.append(tab);
  var active2 = false;
  var graph;
  var dataset;
  var parentSnapshot;
  var worker;
  var generation = 0;
  var selected = null;
  var selectedEdge = null;
  var hovered = null;
  var nodes = [];
  var links = [];
  var drawing = false;
  var skipReturn;
  var view = { zoom: 1, tx: 0, ty: 0, reduced: true, query: "", component: "all", hideUnlinked: true, hidden: [], minimum: 1, labels: "important", evidence: false };
  var historyRoleCache = /* @__PURE__ */ new WeakMap();
  var settings = make("section", "", "history-settings");
  settings.id = "historySettings";
  settings.append(make("h3", "Citation history"));
  var explanation = make("p", "Direct citations between source articles. Arrows point to the cited paper; older years are above newer years.", "field-note");
  settings.append(explanation);
  var fields = make("div", "", "history-fields");
  settings.append(fields);
  function field(parent, title, value, minimum2, maximum) {
    const label = make("label", title), input = make("input");
    input.type = "number";
    input.value = value ?? "";
    input.min = minimum2;
    input.max = maximum;
    input.step = "1";
    label.append(input);
    parent.append(label);
    return input;
  }
  var coreInput = field(fields, "Recursive core minimum (k)", 0, 0, 1e3);
  var capInput = field(fields, "Maximum articles displayed", 100, 1, 1e3);
  var fromInput = field(fields, "From year (optional)", null, 1500, 2100);
  var throughInput = field(fields, "Through year (optional)", null, 1500, 2100);
  var undatedLabel = make("label", "", "history-checkbox");
  var undated = make("input");
  undated.type = "checkbox";
  undated.checked = true;
  undatedLabel.append(undated, document.createTextNode("Include undated articles in a separate lane"));
  settings.append(undatedLabel);
  var controls = make("div", "", "history-actions");
  var rebuild = action("Rebuild history", () => build());
  var vogel = action("Vogel-style core \xB7 k=10 / top 100", () => {
    coreInput.value = 10;
    capInput.value = 100;
    build();
  });
  var broad = action("Explore all \xB7 k=0", () => {
    coreInput.value = 0;
    build();
  });
  var cancel = action("Cancel", () => stop2());
  cancel.hidden = true;
  controls.append(rebuild, vogel, broad, cancel);
  settings.append(controls);
  var report = make("p", "", "history-report");
  report.setAttribute("role", "status");
  settings.append(report);
  var audit = make("details");
  var auditSummary = make("summary", "Core, ranking & data coverage");
  var auditBody = make("div");
  audit.append(auditSummary, auditBody);
  settings.append(audit);
  byId("networkSettingsHeading").nextElementSibling.append(settings);
  var display = make("section");
  display.id = "historyDisplay";
  display.append(make("h3", "History display"));
  var reduceLabel = make("label", "", "history-checkbox");
  var reduced = make("input");
  reduced.type = "checkbox";
  reduced.checked = true;
  reduceLabel.append(reduced, document.createTextNode("Hide redundant citation links"));
  display.append(reduceLabel, make("p", "Display only. The complete selected citation network stays in the saved result. Other filters can hide intermediate paths.", "field-note"));
  var componentLabel = make("label", "Citation component");
  var component = make("select");
  component.setAttribute("aria-label", "Citation component");
  componentLabel.append(component);
  display.append(componentLabel);
  var minimum = field(display, "Minimum component size (displayed works)", 1, 1, 1e3);
  var isolateLabel = make("label", "", "history-checkbox");
  var isolate = make("input");
  isolate.type = "checkbox";
  isolate.checked = true;
  isolateLabel.append(isolate, document.createTextNode("Hide articles without displayed citation links"));
  display.append(isolateLabel);
  var hiddenDisclosure = make("details");
  var hiddenChoices = make("div", "", "history-component-choices");
  hiddenDisclosure.append(make("summary", "Show / hide citation components"), hiddenChoices);
  display.append(hiddenDisclosure);
  var labelLabel = make("label", "Article labels");
  var labelMode = make("select");
  labelMode.setAttribute("aria-label", "History article labels");
  for (const [value, title] of [["important", "Important articles"], ["all", "All labels"], ["none", "No labels"]]) labelMode.append(new Option(title, value));
  labelLabel.append(labelMode);
  display.append(labelLabel, make("p", "Colors mark components of the full core, not thematic clusters. The display cap can hide connecting articles. Y positions are years; X positions are illustrative.", "field-note"));
  byId("displayPanel").querySelector(".shell-panel-body").append(display);
  var search = make("section");
  search.id = "historySearch";
  var queryLabel = make("label", "Find a history article");
  var query = make("input");
  query.type = "search";
  query.placeholder = "Title, author, year or OpenAlex ID";
  queryLabel.append(query);
  var searchResults = make("div", "", "history-results");
  search.append(queryLabel, make("p", "Search the selected top articles; increase the display cap to include others.", "field-note"), action("Clear history search", () => {
    query.value = "";
    view.query = "";
    render();
  }), searchResults);
  byId("searchPanel").querySelector(".shell-panel-body").append(search);
  var stage = document.querySelector(".network-stage");
  var host = make("section", "", "history-canvas");
  host.id = "historyCanvas";
  host.setAttribute("aria-label", "Chronological direct citation network");
  host.hidden = true;
  stage.append(host);
  var namespace = "http://www.w3.org/2000/svg";
  var svg = document.createElementNS(namespace, "svg");
  svg.id = "historyNetwork";
  svg.setAttribute("viewBox", "0 0 980 700");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Citation history. Years increase downward; arrows point from citing to cited articles.");
  svg.tabIndex = 0;
  host.append(svg);
  var svgElement = (tag, attributes = {}, parent = svg) => {
    const node = document.createElementNS(namespace, tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    parent.append(node);
    return node;
  };
  var viewport = svgElement("g");
  var historyTable = make("div", "", "history-table");
  historyTable.hidden = true;
  host.append(historyTable);
  var empty = make("div", "", "history-empty");
  empty.hidden = true;
  host.append(empty);
  var hud = make("div", "", "history-hud");
  hud.append(action("+", () => zoom(1.3)), action("\u2212", () => zoom(1 / 1.3)), action("Fit timeline", () => fit()));
  hud.children[0].setAttribute("aria-label", "Zoom in citation history");
  hud.children[1].setAttribute("aria-label", "Zoom out citation history");
  host.append(hud);
  var hint = make("span", "Drag to pan \xB7 pinch / wheel to zoom \xB7 arrows point to cited papers", "history-hint");
  host.append(hint);
  var ownCaption = make("div", "", "map-caption history-caption");
  byId("mapCaption").after(ownCaption);
  var viewSwitch = make("div", "", "history-view-switch");
  var timelineButton = action("Timeline", () => {
    view.evidence = false;
    render();
  });
  var tableButton = action("History evidence", () => {
    view.evidence = true;
    render();
  });
  viewSwitch.append(timelineButton, tableButton);
  byId("view3D").after(viewSwitch);
  var ink = () => getComputedStyle(document.body).getPropertyValue("--ink").trim() || "#202020";
  var muted = () => getComputedStyle(document.body).getPropertyValue("--muted").trim() || "#777777";
  var palette = ["#257b75", "#c77936", "#5c6eac", "#a45070", "#658343", "#8c65a0", "#3c839c", "#aa654e"];
  var color = (node) => node.cluster ? palette[(node.cluster - 1) % palette.length] : "#999999";
  var short = (node) => (node.authors?.split(";")[0] || node.title || node.id).slice(0, 58) + " (" + (node.yearLabel || node.year || "?") + ")";
  function settingsValue() {
    for (const input of [coreInput, capInput, fromInput, throughInput]) if (!input.validity.valid) throw new Error("Check the core, display cap and year settings.");
    return { core: +coreInput.value, limit: +capInput.value, from: fromInput.value === "" ? null : +fromInput.value, through: throughInput.value === "" ? null : +throughInput.value, includeUndated: undated.checked };
  }
  function setSettings(options) {
    coreInput.value = options.core;
    capInput.value = options.limit;
    fromInput.value = options.from ?? "";
    throughInput.value = options.through ?? "";
    undated.checked = options.includeUndated;
  }
  function stop2() {
    generation++;
    worker?.terminate();
    worker = null;
    cancel.hidden = true;
    if (active2) {
      report.textContent = "Cancelled. The previous completed history, if any, is unchanged.";
      byId("analysisNote").textContent = report.textContent;
      if (!graph) {
        empty.hidden = false;
        empty.replaceChildren(make("p", report.textContent), action("Retry history", () => build()), action("Return to previous map", () => deactivate()));
      }
    }
  }
  function historyFailure(problem, retry) {
    const message = "Analysis failed: " + analysisErrorMessage(problem) + (graph ? " Previous completed history retained." : " No history result was installed.");
    report.textContent = message;
    byId("analysisNote").textContent = message;
    byId("status").textContent = message;
    if (!graph) {
      empty.hidden = false;
      empty.replaceChildren(make("h3", "Citation history could not finish"), make("p", message), action("Retry history", retry || (() => build())), action("Return to previous map", () => deactivate()));
    }
    window.atlasWorkspaceShell.refresh();
  }
  function selectHistoryTab() {
    for (const item of tabs.children) {
      const chosen = item === tab;
      item.setAttribute("aria-selected", String(chosen));
      item.tabIndex = chosen ? 0 : -1;
    }
    document.querySelector(".workspace").setAttribute("aria-labelledby", tab.id);
  }
  function activate() {
    const skip = document.querySelector(".skip-link");
    if (!active2) {
      parentSnapshot = original.captureProject();
      skipReturn = { href: skip.getAttribute("href"), handler: skip.onclick };
    }
    active2 = true;
    skip.href = location.pathname + location.search + "#historyNetwork";
    skip.onclick = (event) => {
      event.preventDefault();
      svg.focus();
    };
    document.body.classList.add("history-mode");
    host.hidden = false;
    selectHistoryTab();
    window.ATLAS_HYPERGRAPH_3D?.hide();
    window.ATLAS_EXTENSIONS?.cancel();
    window.ATLAS_EVIDENCE.cancelCanvasReliability();
    window.atlasWorkspaceShell.show(null);
    window.atlasWorkspaceShell.refresh();
    byId("methodTitle").textContent = "Citation history";
    byId("clearInspectSelection").hidden = !selected && !selectedEdge;
  }
  function deactivate() {
    if (!active2) return;
    stop2();
    cancelScience();
    active2 = false;
    const skip = document.querySelector(".skip-link");
    skip.setAttribute("href", skipReturn.href);
    skip.onclick = skipReturn.handler;
    document.body.classList.remove("history-mode", "has-selection");
    host.hidden = true;
    original.restore(parentSnapshot);
    window.atlasWorkspaceShell.refresh();
  }
  async function open(saved = null) {
    if (active2 && !saved) return;
    const cached = !saved && graph && dataset && (dataset.sourceCorpusId === graph.sourceCorpusId || graph.sourceIncidenceHash && graph.sourceIncidenceHash === dataset.incidenceHash);
    if (cached) {
      activate();
      setSettings(graph.historiography.settings);
      install(false);
      return;
    }
    activate();
    if (saved) {
      graph = saved.graph;
      view = { ...view, ...saved.historyView };
      selected = saved.historyView?.selected || null;
      selectedEdge = saved.historyView?.selectedEdge || null;
      setSettings(graph.historiography.settings);
      install(false);
    } else {
      graph = null;
      selected = selectedEdge = null;
      view = { ...view, component: "all", hidden: [], query: "", zoom: 1, tx: 0, ty: 0 };
      svg.replaceChildren(viewport);
      viewport.replaceChildren();
      empty.hidden = false;
      empty.replaceChildren(make("p", "Loading source citation evidence\u2026"));
      report.textContent = "Loading full source reference lists\u2026";
      byId("analysisNote").textContent = "Loading source citation evidence\u2026";
    }
    const ticket = ++generation;
    try {
      const result = await window.ATLAS_EVIDENCE.prepareDataset();
      if (!active2 || ticket !== generation) return;
      dataset = result;
      if (!saved) await build();
    } catch (error) {
      if (active2 && ticket === generation) historyFailure(error, () => {
        deactivate();
        open();
      });
    }
  }
  async function build() {
    if (!dataset || !active2) return;
    let options;
    try {
      options = settingsValue();
    } catch (error) {
      historyFailure(error);
      return;
    }
    stop2();
    const ticket = ++generation;
    report.textContent = "Matching direct citations\u2026";
    byId("analysisNote").textContent = "Analyzing direct citations\u2026";
    cancel.hidden = false;
    if (!graph) {
      empty.hidden = false;
      empty.replaceChildren(make("p", "Building citation history\u2026"));
    }
    if (window.BIBLIOMAP?.active) {
      try {
        const job = window.BIBLIOMAP.stage(original.currentCorpus()?.graph, "history", options, (message) => {
          report.textContent = message;
        });
        worker = { terminate: () => job.cancel() };
        const result = await job.promise;
        if (!active2 || ticket !== generation) return;
        graph = result;
        graph.sourceCorpusId = dataset.sourceCorpusId;
        graph.externalCorpus = true;
        selected = selectedEdge = hovered = null;
        install(true);
        window.dispatchEvent(new CustomEvent("bibliomap:history-ready", { detail: graph }));
      } catch (problem) {
        if (active2 && ticket === generation) historyFailure(problem);
      } finally {
        if (ticket === generation) {
          worker = null;
          cancel.hidden = true;
        }
      }
      return;
    }
    try {
      worker = new Worker("historiography-worker.js?v=coupling-errors-2");
      worker.onmessage = (event) => {
        if (!active2 || ticket !== generation) return;
        if (event.data.progress) {
          report.textContent = event.data.progress;
          return;
        }
        worker.terminate();
        worker = null;
        cancel.hidden = true;
        if (Object.hasOwn(event.data, "error")) {
          historyFailure(event.data.error);
          return;
        }
        try {
          graph = inheritEvidenceContext(event.data.result, original.currentCorpus?.()?.graph || parentSnapshot?.graph, dataset.sourceCorpusId);
        } catch (problem) {
          historyFailure(problem);
          return;
        }
        graph.sourceIncidenceHash = dataset.incidenceHash;
        graph.externalCorpus = !!original.currentCorpus?.();
        graph.deduplication = dataset.deduplication;
        selected = selectedEdge = hovered = null;
        view.query = "";
        view.component = "all";
        view.hidden = [];
        install(true);
      };
      worker.onerror = (event) => {
        if (active2 && ticket === generation) {
          stop2();
          historyFailure(event);
        }
      };
      worker.postMessage({ articles: dataset.articles, options });
    } catch (problem) {
      if (active2 && ticket === generation) {
        stop2();
        historyFailure(problem);
      }
    }
  }
  function install(resetCamera) {
    byId("analysisNote").textContent = "";
    const metadata = graph.historiography, sizes = /* @__PURE__ */ new Map();
    for (const node of graph.nodes) sizes.set(node.cluster, (sizes.get(node.cluster) || 0) + 1);
    component.replaceChildren(new Option("All citation components", "all"), ...[...sizes].filter(([cluster]) => cluster > 0).sort((left, right) => left[0] - right[0]).map(([cluster, count]) => new Option("Component " + cluster + " \xB7 " + count + " displayed articles", String(cluster))));
    hiddenChoices.replaceChildren();
    for (const [cluster, count] of sizes) if (cluster > 0) {
      const label = make("label", "", "history-checkbox"), checkbox = make("input");
      checkbox.type = "checkbox";
      checkbox.dataset.historyComponent = String(cluster);
      checkbox.checked = !view.hidden.includes(cluster);
      checkbox.onchange = () => {
        view.hidden = checkbox.checked ? view.hidden.filter((value) => value !== cluster) : [...view.hidden, cluster];
        render();
      };
      label.append(checkbox, document.createTextNode("Component " + cluster + " \xB7 " + count));
      hiddenChoices.append(label);
    }
    reduced.checked = view.reduced;
    reduced.disabled = false;
    component.value = view.component;
    minimum.value = view.minimum;
    isolate.checked = view.hideUnlinked;
    labelMode.value = view.labels;
    query.value = view.query;
    auditBody.replaceChildren(...[metadata.scopedArticles + " scoped source articles \xB7 " + metadata.withReferences + " with available reference lists; completeness unknown.", metadata.corpusLinks + " distinct within-corpus citations \xB7 " + metadata.coreArticles + " articles in the " + metadata.settings.core + "-core \xB7 top " + graph.nodes.length + " selected.", metadata.ranking + ".", metadata.undatedArticles + " corpus articles lack a year \xB7 " + metadata.selfCitations + " self-links ignored \xB7 " + metadata.duplicateReferences + " repeated reference entries deduplicated.", metadata.futureDatedLinks + " links point to a later recorded publication year; retained and flagged, not silently reversed.", metadata.reduction.removed + " redundant selected links can be hidden. " + (metadata.reduction.hasCycle ? metadata.reduction.cycleArticles + " articles in cyclic groups are protected; only inter-group relations are reduced. " : "") + metadata.reduction.scope + ".", "Source corpus ID: " + graph.sourceCorpusId].map((content) => make("p", content)));
    report.textContent = metadata.coreArticles ? metadata.coreArticles + " core articles \xB7 " + graph.nodes.length + " selected \xB7 " + graph.links.length + " direct citations before display reduction" : "No articles meet the recursive " + metadata.settings.core + "-core. The threshold has not been lowered. Try Explore all or choose a lower k.";
    mountScience(auditBody, graph, dataset?.articles || [], { selectNode: (id) => inspectNode(id) });
    render();
    if (resetCamera) fit();
    if (selected) inspectNode(selected, false);
    else if (selectedEdge) inspectEdge(graph.links.find((edge) => citationKey(edge) === selectedEdge), false);
    else overview();
  }
  function transform() {
    viewport.setAttribute("transform", `translate(${view.tx} ${view.ty}) scale(${view.zoom})`);
    for (const label of viewport.querySelectorAll("[data-history-label]")) {
      label.setAttribute("font-size", 11 / view.zoom);
      label.setAttribute("stroke-width", 3 / view.zoom);
    }
    for (const label of viewport.querySelectorAll("[data-year-label]")) label.setAttribute("font-size", 12 / view.zoom);
    for (const circle of viewport.querySelectorAll(".history-dot")) circle.setAttribute("r", Math.max(3 / view.zoom, Number(circle.dataset.radius)));
    const marker = viewport.querySelector("#historyArrow");
    if (marker) {
      marker.setAttribute("markerWidth", 6 / view.zoom);
      marker.setAttribute("markerHeight", 6 / view.zoom);
    }
  }
  function fit() {
    if (!nodes.length) return;
    const left = Math.min(0, ...nodes.map((node) => node.x)) - 20, right = Math.max(...nodes.map((node) => node.x)) + 180, top = Math.min(...nodes.map((node) => node.y)) - 45, bottom = Math.max(...nodes.map((node) => node.y)) + 65;
    view.zoom = Math.min(1.6, 920 / Math.max(1, right - left), 610 / Math.max(1, bottom - top));
    view.tx = 490 - (left + right) / 2 * view.zoom;
    view.ty = 350 - (top + bottom) / 2 * view.zoom;
    transform();
  }
  function zoom(factor, point2 = { x: 490, y: 350 }) {
    const next = Math.max(0.06, Math.min(12, view.zoom * factor));
    view.tx = point2.x - (point2.x - view.tx) * next / view.zoom;
    view.ty = point2.y - (point2.y - view.ty) * next / view.zoom;
    view.zoom = next;
    transform();
  }
  function render() {
    if (!active2 || !graph || drawing) return;
    drawing = true;
    try {
      for (const checkbox of hiddenChoices.querySelectorAll("input[data-history-component]")) checkbox.checked = !view.hidden.includes(Number(checkbox.dataset.historyComponent));
      const size = /* @__PURE__ */ new Map();
      for (const node of graph.nodes) size.set(node.cluster, (size.get(node.cluster) || 0) + 1);
      nodes = graph.nodes.filter((node) => (!view.hideUnlinked || node.degree > 0) && !view.hidden.includes(node.cluster) && (size.get(node.cluster) || 0) >= view.minimum && (view.component === "all" || String(node.cluster) === view.component));
      const ids = new Set(nodes.map((node) => node.id)), keep = new Set(graph.historiography.reduction.kept);
      links = graph.links.filter((edge) => ids.has(edge.source) && ids.has(edge.target) && (!view.reduced || keep.has(citationKey(edge))));
      viewport.replaceChildren();
      const defs = svgElement("defs", {}, viewport), marker = svgElement("marker", { id: "historyArrow", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: "auto", markerUnits: "userSpaceOnUse" }, defs);
      svgElement("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: muted() }, marker);
      const years = [...new Set(nodes.map((node) => node.year).filter(Number.isInteger))].sort((left, right) => left - right), span = years.length ? years.at(-1) - years[0] : 0, step = span > 60 ? 10 : span > 25 ? 5 : span > 12 ? 2 : 1;
      for (const year of years.filter((year2) => year2 === years[0] || year2 === years.at(-1) || year2 % step === 0)) {
        const row = nodes.find((node) => node.year === year);
        svgElement("line", { x1: 80, x2: 920, y1: row.y, y2: row.y, stroke: muted(), "stroke-opacity": 0.12, "stroke-width": 1 }, viewport);
        svgElement("text", { "data-year-label": year, x: 65, y: row.y + 4, fill: muted(), "font-size": 12, "text-anchor": "end" }, viewport).textContent = year;
      }
      if (nodes.some((node) => !Number.isInteger(node.year))) svgElement("text", { "data-year-label": "unknown", x: 65, y: graph.historiography.layout.unknownYear, fill: muted(), "font-size": 11, "text-anchor": "end" }, viewport).textContent = "Undated";
      const index = new Map(graph.nodes.map((node) => [node.id, node])), matches = (node) => !view.query || [node.label, node.yearLabel, node.year, node.id].join(" ").toLowerCase().includes(view.query.toLowerCase()), related = new Set(selected ? [selected, ...graph.links.filter((edge) => edge.source === selected || edge.target === selected).flatMap((edge) => [edge.source, edge.target])] : []);
      for (const edge of links) {
        const source = index.get(edge.source), target = index.get(edge.target), delta = Math.hypot(target.x - source.x, target.y - source.y) || 1, radius = Math.min(15, 3 + Math.sqrt(target.citations) * 1.6), endX = target.x - (target.x - source.x) / delta * (radius + 3), endY = target.y - (target.y - source.y) / delta * (radius + 3), bend = (source.x + endX) / 2 + (source.year === target.year ? 20 : 25), middle = (source.y + endY) / 2 - (source.year === target.year ? 40 : 0);
        const path = `M ${source.x} ${source.y} Q ${bend} ${middle} ${endX} ${endY}`, focus = selectedEdge === citationKey(edge) || selected && (source.id === selected || target.id === selected), group = svgElement("g", { "data-history-edge": citationKey(edge), tabindex: 0, role: "button", "aria-label": short(source) + " cites " + short(target), opacity: selected && !focus || view.query && !matches(source) && !matches(target) ? 0.08 : 0.75 }, viewport);
        svgElement("path", { d: path, fill: "none", stroke: source.cluster === target.cluster ? color(source) : muted(), "stroke-width": focus ? 2.2 : 1.2, "marker-end": "url(#historyArrow)", "stroke-dasharray": edge.futureDated ? "4 3" : "none" }, group);
        svgElement("path", { d: path, fill: "none", stroke: "transparent", "stroke-width": 13, "pointer-events": "stroke" }, group);
        group.onclick = () => inspectEdge(edge);
        group.onkeydown = (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inspectEdge(edge);
          }
        };
      }
      const important = /* @__PURE__ */ new Set();
      for (const node of nodes.slice().sort((left, right) => right.citations - left.citations)) if (![...important].some((id) => index.get(id).cluster === node.cluster)) important.add(node.id);
      const labelCandidates = [];
      for (const node of nodes) {
        const group = svgElement("g", { "data-history-node": node.id, tabindex: 0, role: "button", "aria-label": short(node) + "; " + node.citations + " incoming core citations", "aria-pressed": String(selected === node.id), transform: `translate(${node.x} ${node.y})`, opacity: !matches(node) || selected && !related.has(node.id) ? 0.18 : 1 }, viewport);
        svgElement("circle", { class: "history-dot", "data-radius": Math.min(15, 3 + Math.sqrt(node.citations) * 1.6), r: Math.min(15, 3 + Math.sqrt(node.citations) * 1.6), fill: color(node), stroke: selected === node.id ? ink() : "white", "stroke-width": selected === node.id ? 2.5 : 1.2 }, group);
        svgElement("title", {}, group).textContent = node.title + "\n" + node.citations + " incoming core citations; " + node.corpusCitations + " incoming scoped-corpus citations";
        group.onclick = () => inspectNode(node.id);
        group.onkeydown = (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inspectNode(node.id);
          }
        };
        group.onpointerenter = (event) => {
          if (event.pointerType !== "touch") {
            hovered = node.id;
            labelVisibility();
          }
        };
        group.onpointerleave = () => {
          hovered = null;
          labelVisibility();
        };
        if (view.labels !== "none" && (view.labels === "all" || selected === node.id || hovered === node.id || important.has(node.id) || node.rank <= 8)) labelCandidates.push(node);
      }
      const labels = [];
      for (const node of labelCandidates.sort((left, right) => Number(right.id === selected) - Number(left.id === selected) || left.rank - right.rank)) {
        const content = short(node), width = Math.min(280, content.length * 6) / view.zoom, box = { left: node.x + 12, right: node.x + 12 + width, top: node.y - 12 / view.zoom, bottom: node.y + 1 };
        if (view.labels !== "all" && node.id !== selected && labels.some((other) => box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top)) continue;
        labels.push(box);
        const label = svgElement("text", { x: node.x + 12, y: node.y - 2, fill: ink(), "font-size": 11, "data-history-label": node.id, "pointer-events": "none", "paint-order": "stroke", stroke: getComputedStyle(document.body).getPropertyValue("--surface").trim() || "#fafafa", "stroke-width": 3 }, viewport);
        label.textContent = content;
      }
      labelVisibility();
      transform();
      svg.style.display = view.evidence ? "none" : "block";
      historyTable.hidden = !view.evidence;
      timelineButton.setAttribute("aria-pressed", String(!view.evidence));
      tableButton.setAttribute("aria-pressed", String(view.evidence));
      empty.hidden = !!nodes.length;
      if (!nodes.length) empty.replaceChildren(make("h3", graph.historiography.coreArticles ? "No articles match these display filters" : "No articles in this citation core"), make("p", graph.historiography.coreArticles ? "Reset the component filter, hidden components or minimum size." : "A recursive k-core is more restrictive than a citation count. No threshold was lowered automatically."), action("Explore all source articles", () => {
        coreInput.value = 0;
        build();
      }), action("Reset history display", () => {
        view.minimum = 1;
        minimum.value = 1;
        view.component = "all";
        component.value = "all";
        view.hidden = [];
        view.hideUnlinked = false;
        isolate.checked = false;
        render();
        fit();
      }));
      historyTable.replaceChildren();
      if (view.evidence) {
        const table = make("table"), caption = make("caption", "History articles ranked by incoming citations from the full core"), head = make("tr");
        head.append(...["Rank", "Article", "Year", "Core citations", "Scoped-corpus citations", "Component"].map((title) => make("th", title)));
        table.append(caption, head);
        for (const node of nodes) {
          const row = make("tr"), title = make("td");
          title.append(action(node.title || node.id, () => inspectNode(node.id)));
          row.append(make("td", node.rank), title, make("td", node.yearLabel || node.year || "Unknown"), make("td", node.citations), make("td", node.corpusCitations), make("td", node.cluster || "Unlinked"));
          table.append(row);
        }
        historyTable.append(table);
      }
      searchResults.replaceChildren(...nodes.filter(matches).slice(0, 100).map((node) => action(short(node) + " \xB7 " + node.citations + " core citations", () => inspectNode(node.id))));
      ownCaption.textContent = "Arrows: citing \u2192 cited paper \xB7 older years above newer years \xB7 node size: incoming citations from the full core \xB7 colors: citation components, not validated themes. " + links.length + " / " + graph.links.length + " selected citation links shown" + (view.reduced ? graph.historiography.reduction.hasCycle ? " \xB7 component-safe reduction; cyclic links protected" : " \xB7 transitive reduction on" : " \xB7 all direct links") + ". X positions do not measure similarity.";
      byId("status").textContent = nodes.length + " / " + graph.nodes.length + " selected history articles \xB7 " + links.length + " citation arrows \xB7 k=" + graph.historiography.settings.core;
      byId("stats").textContent = nodes.length + " history articles / " + links.length + " citation arrows";
      window.atlasWorkspaceShell.refresh();
    } finally {
      drawing = false;
    }
  }
  function labelVisibility() {
    for (const label of viewport.querySelectorAll("[data-history-hover-label]")) label.remove();
    if (hovered && !viewport.querySelector('[data-history-label="' + CSS.escape(hovered) + '"]')) {
      const node = graph.nodes.find((item) => item.id === hovered);
      if (node) svgElement("text", { x: node.x + 12, y: node.y - 2, fill: ink(), "font-size": 11 / view.zoom, "data-history-label": node.id, "data-history-hover-label": true, "pointer-events": "none", "paint-order": "stroke", stroke: getComputedStyle(document.body).getPropertyValue("--surface").trim() || "#fafafa", "stroke-width": 3 / view.zoom }, viewport).textContent = short(node);
    }
    for (const label of viewport.querySelectorAll("[data-history-label]")) label.style.opacity = hovered && label.dataset.historyLabel !== hovered ? "0" : "1";
  }
  function linkFor(parent, article) {
    const link = make("a", article.title || article.label || article.id);
    if (/^https?:\/\//.test(article.id)) link.href = article.id;
    link.target = "_blank";
    link.rel = "noopener";
    parent.append(link);
  }
  function overview() {
    const detail = byId("details");
    detail.replaceChildren(make("h2", "Trace a citation"), make("p", "Select an article to see which corpus papers cite it and which it cites. Select an arrow to inspect that exact citation."), make("p", "This is a chronology of indexed citation evidence, not a causal model of how ideas spread. No thematic clustering or bootstrap reliability is claimed for citation components."));
  }
  function clearSelection() {
    selected = selectedEdge = null;
    document.body.classList.remove("has-selection");
    render();
    overview();
  }
  function inspectNode(id, reveal = true) {
    const node = graph.nodes.find((item) => item.id === id);
    if (!node) return;
    selected = id;
    selectedEdge = null;
    document.body.classList.add("has-selection");
    render();
    if (reveal) window.atlasWorkspaceShell.selected("history-node:" + id);
    const detail = byId("details");
    detail.replaceChildren(make("span", "SOURCE ARTICLE \xB7 CITATION HISTORY", "eyebrow"), make("h2", node.title || node.id), make("p", (node.yearLabel || node.year || "Year unknown") + " \xB7 rank " + node.rank + " \xB7 " + node.citations + " incoming core citations \xB7 " + node.corpusCitations + " incoming scoped-corpus citations"));
    linkFor(detail, node);
    const readOnly = window.BIBLIOMAP?.active && window.BIBLIOMAP.canCompute === false;
    if (!historyRoleCache.has(graph) && !readOnly) historyRoleCache.set(graph, analyzeRoles(graph));
    const role = (graph.scienceAudit?.roles || historyRoleCache.get(graph))?.roles[id];
    if (role) detail.append(make("h3", "Citation-network position"), make("p", "PageRank " + role.pageRank.toFixed(5) + " \xB7 " + role.incoming + " incoming / " + role.outgoing + " outgoing citations \xB7 weak core " + role.core), make("p", "Calculated on the top-selected analytical history, before display reduction and filters. PageRank follows citing-to-cited arrows; it is not catalogue-wide impact, agreement or causal influence."));
    else detail.append(make("p", "Citation roles have not been saved for this view. An editor can calculate them; this project is view-only."));
    for (const [incoming, title] of [[true, "Cited by selected corpus articles"], [false, "References to selected corpus articles"]]) {
      const edges = graph.links.filter((edge) => incoming ? edge.target === id : edge.source === id), section = make("details");
      section.open = true;
      section.append(make("summary", title + " (" + edges.length + ")"));
      for (const edge of edges) {
        const other = graph.nodes.find((item) => item.id === (incoming ? edge.source : edge.target));
        const row = make("p");
        row.append(action(short(other), () => inspectNode(other.id)), document.createTextNode(view.reduced && !graph.historiography.reduction.kept.includes(citationKey(edge)) ? " \xB7 redundant arrow hidden" : ""));
        section.append(row);
      }
      detail.append(section);
    }
    detail.append(make("p", "Neighbor lists use all direct links among the top-selected articles, before display reduction and component filters. Ranking counts use the full eligible core before that selection."));
    const references = make("details");
    references.append(make("summary", "Available reference list (" + (node.references?.length || 0) + ")"));
    for (const reference of node.references || []) {
      const row = make("p");
      linkFor(row, { id: reference, title: dataset?.referenceLabels?.[reference] || reference });
      references.append(row);
    }
    detail.append(references);
  }
  function inspectEdge(edge, reveal = true) {
    if (!edge) {
      clearSelection();
      return;
    }
    selected = null;
    selectedEdge = citationKey(edge);
    document.body.classList.add("has-selection");
    render();
    if (reveal) window.atlasWorkspaceShell.selected("history-edge:" + selectedEdge);
    const source = graph.nodes.find((node) => node.id === edge.source), target = graph.nodes.find((node) => node.id === edge.target), detail = byId("details");
    detail.replaceChildren(make("h2", "One direct citation"), make("h3", "Citing source"), action(short(source), () => inspectNode(source.id)), make("h3", "Cited source"), action(short(target), () => inspectNode(target.id)), make("p", "The available OpenAlex reference list for the citing article contains the cited article ID. This is not a co-citation or shared-reference count."));
    if (edge.futureDated) detail.append(make("p", "Date warning: the cited record has a later publication year. Online-first dates, editions or metadata may explain this; the relationship was retained, not reversed."));
    detail.append(make("p", "Citation does not establish agreement, importance or causal knowledge transfer."));
    const evidence = make("details");
    evidence.append(make("summary", "Citation evidence IDs"), make("p", "Citing: " + source.id), make("p", "Referenced work: " + target.id));
    detail.append(evidence);
  }
  function capture() {
    const base = original.captureProject();
    return { ...base, graph, reference: parentSnapshot.reference || parentSnapshot, state: { ...base.state, method: "historiography", name: "citation-history", selected, selectedEdge }, historyView: { ...view, selected, selectedEdge }, hiddenClusters: new Set(view.hidden) };
  }
  function download(content, type, name) {
    const url = URL.createObjectURL(new Blob([content], { type })), link = make("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
  }
  for (const [id, type] of [["exportData", "json"], ["exportSvg", "svg"]]) byId(id).addEventListener("click", async (event) => {
    if (!active2) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!graph) return;
    const selectedGraph = graph;
    try {
      if (type === "json") graph.scientificManifest = await createScientificManifest(graph, dataset?.articles || []);
      if (graph !== selectedGraph) return;
      if (type === "json") download(JSON.stringify({ version: 1, graph, display: { ...view, selected, selectedEdge }, displayedArticleIds: nodes.map((node) => node.id), displayedCitationKeys: links.map(citationKey), createdAt: (/* @__PURE__ */ new Date()).toISOString() }, null, 2), "application/json", "bibliomap-citation-history.json");
      else download(new XMLSerializer().serializeToString(svg), "image/svg+xml", "bibliomap-citation-history.svg");
    } catch (error) {
      report.textContent = "Export not completed: " + analysisErrorMessage(error);
    }
  }, true);
  reduced.onchange = () => {
    view.reduced = reduced.checked;
    render();
  };
  component.onchange = () => {
    view.component = component.value;
    render();
    fit();
  };
  minimum.onchange = () => {
    view.minimum = Math.max(1, Math.min(1e3, +minimum.value || 1));
    minimum.value = view.minimum;
    render();
  };
  isolate.onchange = () => {
    view.hideUnlinked = isolate.checked;
    render();
  };
  labelMode.onchange = () => {
    view.labels = labelMode.value;
    render();
  };
  query.oninput = () => {
    view.query = query.value.trim();
    render();
  };
  tabs.addEventListener("click", (event) => {
    const target = event.target.closest("[role=tab]");
    if (target && target !== tab) deactivate();
  }, true);
  tab.onkeydown = (event) => {
    const list = [...tabs.children], position = list.indexOf(tab), target = event.key === "ArrowLeft" ? list[(position + list.length - 1) % list.length] : event.key === "ArrowRight" || event.key === "Home" ? list[0] : event.key === "End" ? tab : null;
    if (target) {
      event.preventDefault();
      target.focus();
      target.click();
    }
  };
  shared.captureProject = () => {
    if (active2 && !graph) throw new Error("Wait for citation history to finish before saving.");
    return active2 ? capture() : original.captureProject();
  };
  shared.restore = (snapshot) => {
    if (snapshot.graph.canvasKind === "historiography") {
      open(snapshot);
      return;
    }
    deactivate();
    return original.restore(snapshot);
  };
  shared.graph = () => active2 && graph ? graph : original.graph();
  shared.redraw = () => active2 ? render() : original.redraw();
  shared.clearSelection = () => active2 ? clearSelection() : original.clearSelection();
  shared.installCorpus = (packet, options) => {
    deactivate();
    dataset = graph = null;
    setSettings(HISTORY_DEFAULTS);
    return original.installCorpus(packet, options);
  };
  shared.summary = () => active2 ? { algorithm: "historiography", selection: selected ? "history-node:" + selected : selectedEdge ? "history-edge:" + selectedEdge : null, shown: nodes.length, total: graph?.nodes.length || 0, historyCore: graph?.historiography.settings.core ?? 0, hideUnlinked: view.hideUnlinked, minimumClusterSize: view.minimum, hiddenClusters: view.hidden.length } : original.summary();
  var point = (event) => {
    const rectangle = svg.getBoundingClientRect(), scale = Math.min(rectangle.width / 980, rectangle.height / 700);
    return { x: (event.clientX - rectangle.left - (rectangle.width - scale * 980) / 2) / scale, y: (event.clientY - rectangle.top - (rectangle.height - scale * 700) / 2) / scale };
  };
  var drag;
  var moved = false;
  svg.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch" || event.button !== 0) return;
    drag = { point: point(event), tx: view.tx, ty: view.ty };
    moved = false;
    if (!event.target.closest("[data-history-node],[data-history-edge]")) svg.setPointerCapture(event.pointerId);
  });
  svg.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerType === "touch") return;
    const current = point(event), horizontal = current.x - drag.point.x, vertical = current.y - drag.point.y;
    if (Math.hypot(horizontal, vertical) > 5) moved = true;
    if (moved) {
      view.tx = drag.tx + horizontal;
      view.ty = drag.ty + vertical;
      transform();
    }
  });
  svg.addEventListener("pointerup", (event) => {
    drag = null;
    if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
  });
  svg.addEventListener("pointercancel", () => {
    drag = null;
  });
  svg.addEventListener("click", (event) => {
    if (moved) {
      event.stopImmediatePropagation();
      event.preventDefault();
      moved = false;
    }
  }, true);
  svg.addEventListener("wheel", (event) => {
    event.preventDefault();
    zoom(Math.exp(-Math.max(-150, Math.min(150, event.deltaY)) * 4e-3), point(event));
  }, { passive: false });
  var activateTarget = (target) => {
    const node = target.closest("[data-history-node]"), edge = target.closest("[data-history-edge]");
    if (node) inspectNode(node.dataset.historyNode);
    else if (edge) inspectEdge(graph.links.find((item) => citationKey(item) === edge.dataset.historyEdge));
  };
  window.attachAtlasTouch(svg, { point, camera: () => ({ zoom: view.zoom, tx: view.tx, ty: view.ty }), start: () => {
    drag = null;
  }, move: (next) => {
    Object.assign(view, next);
    transform();
  }, tap: activateTarget, hold: activateTarget });
  svg.addEventListener("keydown", (event) => {
    if (event.key === "Home") fit();
    else if (event.key === "+" || event.key === "=") zoom(1.25);
    else if (event.key === "-") zoom(0.8);
    else if (event.key === "Escape") clearSelection();
    else if (event.key.startsWith("Arrow")) {
      view.tx += event.key === "ArrowLeft" ? 40 : event.key === "ArrowRight" ? -40 : 0;
      view.ty += event.key === "ArrowUp" ? 40 : event.key === "ArrowDown" ? -40 : 0;
      transform();
    } else return;
    event.preventDefault();
  });
  byId("themeToggle").addEventListener("click", () => {
    if (active2) render();
  });
  byId("reset").addEventListener("click", (event) => {
    if (!active2) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    setSettings(HISTORY_DEFAULTS);
    view = { ...view, reduced: true, query: "", component: "all", hidden: [], minimum: 1, hideUnlinked: true, labels: "important", evidence: false };
    build();
  }, true);
  byId("helpButton").addEventListener("click", (event) => {
    if (!active2) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.atlasWorkspaceShell.show("analysis");
    audit.open = true;
    audit.scrollIntoView({ block: "nearest" });
  }, true);
  window.ATLAS_HISTORY = { open, deactivate, graph: () => graph, active: () => active2 };
})();

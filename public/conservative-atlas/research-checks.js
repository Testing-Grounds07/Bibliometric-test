(() => {
  // scripts/retained-research-checks.mjs
  var RETAINED_CHECKS_VERSION = "bibliomap.retained-checks.v1";
  function assertLegacyCountEvidence(graph, records, entry, input) {
    if (input.kind !== "rank-cutoff" || input.options?.rankMetric !== "global-citations" || input.options.globalCitationField !== "citedBy") return;
    const complete = entry?.checks?.some((c) => c.id === "rank-cutoff" && c.result?.audit?.global_count_missing === 0);
    const ids = new Set(graph.nodes.map((n) => n.id));
    if (!complete && records.some((r) => ids.has(r.id) && r.citedBy === 0)) throw Error("This legacy packet has citation-count zeros with unknown missingness provenance. Use strength or incoming citations, or supply explicit raw cited_by_count metadata. Zeros are not assumed to be missing or observed.");
  }
  function researchTypeMap(csv) {
    csv = csv.replace(/^\uFEFF/, "");
    const rows = [];
    let row = [], field = "", quoted = false;
    for (let i = 0; i < csv.length; i++) {
      const c = csv[i];
      if (c === '"') {
        if (quoted && csv[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = !quoted;
      } else if (c === "," && !quoted) {
        row.push(field);
        field = "";
      } else if ((c === "\n" || c === "\r") && !quoted) {
        if (c === "\r" && csv[i + 1] === "\n") i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else field += c;
    }
    if (quoted) throw Error("Incomplete source-type CSV.");
    if (field || row.length) {
      row.push(field);
      rows.push(row);
    }
    const header = rows.shift() || [], id = header.indexOf("id"), type = header.indexOf("type");
    if (id < 0 || type < 0) throw Error("Source-type fields are missing.");
    const out = {};
    for (const r of rows) {
      const key = r[id]?.replace(/^https?:\/\/openalex.org\//, "");
      if (!/^W\d+$/.test(key) || !r[type] || out["https://openalex.org/" + key]) throw Error("Invalid or duplicate source type record.");
      out["https://openalex.org/" + key] = r[type];
    }
    return out;
  }
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().filter((key) => value[key] !== void 0).map((key) => [key, canonical(value[key])]));
    return value;
  }
  function researchGraphIdentity(graph) {
    if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.links)) throw Error("A complete graph is required.");
    const endpoint = (value) => typeof value === "object" ? value.id : value;
    const clustering = graph.clustering ? { ...graph.clustering } : void 0;
    if (clustering) delete clustering.clusters;
    const nodes = graph.nodes.map((n) => ({ id: n.id, cluster: n.cluster, engineCommunity: n.engineCommunity, references: [...n.references || []].sort() })).sort((a, b) => a.id.localeCompare(b.id));
    if (new Set(nodes.map((n) => n.id)).size !== nodes.length) throw Error("Duplicate source IDs.");
    const links = graph.links.map((e) => {
      const pair = [endpoint(e.source), endpoint(e.target)];
      if (!graph.directed) pair.sort();
      return { pair, strength: e.strength, weight: e.weight, count: e.count, rawSupport: e.rawSupport, similarity: e.similarity, references: [...e.references || []].sort() };
    }).sort((a, b) => JSON.stringify(a.pair).localeCompare(JSON.stringify(b.pair)));
    return canonical({ nodes, links, sourceCorpusId: graph.sourceCorpusId, projectId: graph._projectId, method: graph.method, canvasKind: graph.canvasKind, entityKind: graph.entityKind, directed: graph.directed, networkModel: graph.networkModel, order: graph.order, maximumOrder: graph.maximumOrder, hyperedges: graph.hyperedges, construction: graph.construction, normalization: graph.normalization, counting: graph.counting, threshold: graph.threshold, minimumSupport: graph.minimumSupport, minimumShared: graph.minimumShared, minimumCosine: graph.minimumCosine, minimumRetainedWeight: graph.minimumRetainedWeight, resolution: graph.resolution, clustering, appliedSettings: graph.appliedSettings, semantic: graph.semantic, importedStandalone: graph.importedStandalone, evidenceProvenance: graph.evidenceProvenance });
  }
  async function researchGraphDigest(graph) {
    const bytes = new TextEncoder().encode(JSON.stringify(researchGraphIdentity(graph)));
    return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((x) => x.toString(16).padStart(2, "0")).join("");
  }
  async function bindRetainedChecks(graph, manifest, readBytes) {
    if (manifest?.schema_version !== RETAINED_CHECKS_VERSION || !Array.isArray(manifest.maps)) throw Error("Unsupported retained-check index.");
    const candidates = manifest.maps.filter((m) => m.map_key === graph.importedStandalone?.map_key && m.corpus_id === graph.sourceCorpusId && m.project_id === graph._projectId);
    if (!candidates.length) return null;
    const digest = await researchGraphDigest(graph), entry = candidates.find((m) => m.graph_sha256 === digest);
    if (!entry) throw Error("Retained checks withheld: graph, membership, source or settings changed.");
    if (!Array.isArray(entry.artifacts) || !entry.artifacts.length || !Array.isArray(entry.checks)) throw Error("Incomplete retained-check evidence.");
    for (const artifact of entry.artifacts) {
      if (typeof artifact.path !== "string" || !/^ai-research\/[a-zA-Z0-9_./-]+$/.test(artifact.path) || artifact.path.split("/").includes("..") || !/^[a-f0-9]{64}$/.test(artifact.sha256)) throw Error("Invalid retained evidence identity.");
      const bytes = await readBytes(artifact.path), actual = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((x) => x.toString(16).padStart(2, "0")).join("");
      if (actual !== artifact.sha256) throw Error("Retained checks withheld: supporting file identity changed.");
    }
    return structuredClone(entry);
  }

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

  // scripts/scientific-manifest.mjs
  var METHOD_REGISTRY = Object.freeze({
    leiden: { representations: ["pairwise", "higher-order", "hypergraph"], score: "CPM", parameters: ["resolution"], evidenceResampling: true },
    infomap: { representations: ["pairwise", "higher-order", "hypergraph"], score: "Map equation", parameters: ["markovTime"], evidenceResampling: true },
    hypergraph: { representations: ["hypergraph"], score: "Direct hypergraph modularity", parameters: ["hypergraphObjective", "hypergraphResolution", "hypergraphSearch"], evidenceResampling: true },
    sbm: { representations: ["pairwise", "higher-order"], score: "Nested model description length", parameters: ["selectedLevel"], evidenceResampling: true },
    trial: { representations: ["hypergraph"], score: "Family-specific experimental objective", parameters: ["family", "k", "seed", "starts"], evidenceResampling: true },
    direct_citation: { representations: ["directed"], score: null, parameters: ["core", "from", "through", "includeUndated", "limit"], evidenceResampling: false }
  });

  // scripts/semantic-network.mjs
  var stopWords = new Set("a an and are as at be been being by can did do does for from had has have how if in into is it its may more most not of on or our than that the their them there these they this those through to under using was we were what when where which who will with within without would".split(" "));
  var cleanText = (value) => String(value || "").normalize("NFKC").replace(/\s+/g, " ").trim();
  function semanticText(work) {
    const inverted = work.abstract_inverted_index;
    const abstract = work.abstract || (inverted ? Object.entries(inverted).flatMap(([word, offsets]) => offsets.map((offset) => [offset, word])).sort((left, right) => left[0] - right[0]).map(([, word]) => word).join(" ") : "");
    const rawTitle = cleanText(work.display_name || work.title), title = rawTitle === work.id || /^(?:https?:\/\/openalex\.org\/)?W\d+$/i.test(rawTitle) ? "" : rawTitle;
    return { title, abstract: cleanText(abstract) };
  }
  function semanticSettings(options = {}) {
    const settings = { kind: options.kind || "terms", textScope: options.textScope || "titles-abstracts", minimumSupport: Number(options.minimumSupport ?? 3), vocabularyLimit: Number(options.vocabularyLimit ?? 120), minimumScore: Number(options.minimumScore ?? 0.3), minimumSimilarity: Number(options.minimumSimilarity ?? 0.65), resolution: Number(options.resolution ?? 0.02), seed: 42 };
    if (!["terms", "topics", "embeddings"].includes(settings.kind) || !["titles", "titles-abstracts"].includes(settings.textScope)) throw new Error("Unknown semantic representation or text scope.");
    if (!Number.isInteger(settings.minimumSupport) || settings.minimumSupport < 1 || settings.minimumSupport > 1e5 || !Number.isInteger(settings.vocabularyLimit) || settings.vocabularyLimit < 2 || settings.vocabularyLimit > 300 || !Number.isFinite(settings.minimumScore) || settings.minimumScore < 0 || settings.minimumScore > 1 || !Number.isFinite(settings.minimumSimilarity) || settings.minimumSimilarity < 0.1 || settings.minimumSimilarity > 1 || !Number.isFinite(settings.resolution) || settings.resolution <= 0 || settings.resolution > 1) throw new Error("Semantic thresholds are outside the supported range.");
    return settings;
  }
  function validateWorks(works) {
    if (!Array.isArray(works) || !works.length || works.length > 5e4 || works.some((work) => typeof work.id !== "string" || !work.id) || new Set(works.map((work) => work.id)).size !== works.length) throw new Error("Supply 1\u201350,000 distinct evidence records. No records are silently sampled.");
    let characters = 0;
    for (const work of works) {
      const text = semanticText(work), length = text.title.length + text.abstract.length;
      characters += length;
      if (length > 1e5 || characters > 3e7) throw new Error("Text exceeds the bounded extraction budget (100,000 characters per source; 30 million total). Narrow the evidence; no text is silently truncated.");
    }
  }
  function decodeEmbedding(value) {
    if (typeof value !== "string" || !/^[A-Za-z0-9+/]{512}$/.test(value)) throw new Error("Invalid signed-int8 MiniLM vector.");
    const bytes = atob(value), vector = new Float32Array(384);
    let norm = 0;
    for (let position = 0; position < 384; position++) {
      const code = bytes.charCodeAt(position), weight2 = code > 127 ? code - 256 : code;
      vector[position] = weight2;
      norm += weight2 * weight2;
    }
    if (!norm) throw new Error("Zero-norm MiniLM vector.");
    norm = Math.sqrt(norm);
    for (let position = 0; position < 384; position++) vector[position] /= norm;
    return vector;
  }
  function embeddingEvidence(works, cache, options = {}, corpusId) {
    validateWorks(works);
    const settings = semanticSettings({ ...options, kind: "embeddings" });
    if (works.length > 3e3) throw new Error("Exact MiniLM comparison supports up to 3,000 sources. Narrow the source scope; no automatic sampling is used.");
    if (!cache || cache.model !== "sentence-transformers/all-MiniLM-L6-v2" || !/^[a-f0-9]{40}$/.test(cache.revision || "") || cache.dimensions !== 384 || cache.encoding !== "signed-int8-base64-unit-vector" || typeof cache.textScope !== "string" || !cache.textScope.trim()) throw new Error("A real pinned 384-dimensional MiniLM cache is required; no text-overlap fallback is used.");
    if (corpusId && cache.sourceCorpusId !== corpusId) throw new Error("Embedding cache belongs to different evidence.");
    if (settings.textScope !== "titles-abstracts") throw new Error("This cached model was prepared from titles and available abstracts. A title-only model is not interchangeable.");
    let abstracts = 0;
    const records = works.map((work) => {
      const document2 = cache.documents?.[work.id], current = semanticText(work);
      if (!current.title && !current.abstract) throw new Error("No genuine title or abstract text is retained for " + work.id + ".");
      if (!document2 || cleanText(document2.title) !== current.title || cleanText(document2.abstract) !== current.abstract) throw new Error("Embedding text is missing or stale for " + work.id + ". Prepare matching embeddings before running this view.");
      if (current.abstract) abstracts++;
      return { work, vector: decodeEmbedding(document2.embedding) };
    });
    return { records, settings, model: { id: cache.model, revision: cache.revision, dimensions: cache.dimensions, encoding: cache.encoding, textScope: cache.textScope }, coverage: { records: works.length, withText: works.length, withAbstract: abstracts, vectors: records.length, missingVectors: 0, textMatch: "All source titles and abstracts exactly match the normalized cached input." } };
  }

  // scripts/research-check-methods.mjs
  var RESEARCH_CHECK_VERSION = "bibliomap-research-checks-v1";
  var RESEARCH_CHECK_KINDS = Object.freeze(["seed", "threshold", "article-only", "reference-ablation", "text-neighbours", "compare", "edge-audit", "rank-cutoff"]);
  var RESEARCH_CHECK_LIMITS = Object.freeze({ nodes: 2e3, pairs: 2e6, edges: 2e5, fits: 15, milliseconds: 18e4, referenceAssignments: 1e6, referencePairContributions: 1e7, maxLevels: 10, maxLocalPasses: 30 });
  var RESEARCH_CHECK_SEEDS = Object.freeze([11, 23, 37, 53, 71]);
  var fail = (message) => {
    throw new Error(message);
  };
  var recordsArray = (records) => Array.isArray(records) ? records : Object.values(records || {});
  var nodeId = (value) => typeof value === "string" && value.length > 0;
  var referenceId = (value) => /^(?:https?:\/\/openalex\.org\/)?W\d+$/i.test(value) ? "https://openalex.org/" + value.replace(/^https?:\/\/openalex\.org\//i, "").toUpperCase() : value;
  var pairKey = (left, right) => JSON.stringify([left, right].sort());
  var connectedIds = (graph) => new Set(graph.links.flatMap((edge) => [edge.source, edge.target]));
  var weight = (edge) => edge.strength ?? edge.weight;
  var choose2 = (count) => count * (count - 1) / 2;
  function validateCheckOptions(kind, options) {
    if (!options || typeof options !== "object" || Array.isArray(options)) fail("Research-check options must be an object of declared protocol fields.");
    const allowed = /* @__PURE__ */ new Set(["typeMap", ...{ seed: [], threshold: ["thresholds", "minimumRetainedWeight"], "article-only": [], "reference-ablation": ["referenceIds", "minimumShared", "minimumCosine"], "text-neighbours": [], compare: [], "edge-audit": ["minimumShared", "minimumCosine"], "rank-cutoff": ["rankMetric", "globalCitationField"] }[kind] || []]);
    const unsupported = Object.keys(options).filter((key) => !allowed.has(key));
    if (unsupported.length) fail("Unsupported " + kind + " protocol option: " + unsupported.join(", ") + ". No option is silently ignored.");
    if (options.typeMap != null && (typeof options.typeMap !== "object" || Array.isArray(options.typeMap))) fail("Supplemental typeMap must map exact source IDs to explicit publication-type strings.");
  }
  function cosineNormalization(graph) {
    const classify = (value) => {
      if (typeof value !== "string" || !value.trim()) return null;
      const text = value.trim().toLowerCase();
      if (/\b(?:not|non)[ -]?cosine\b/.test(text)) return "other";
      if (/\bcosine\b/.test(text)) return "cosine";
      if (/^raw\b/.test(text)) return "other";
      if (/^(?:raw|none|unnormalized|no normalization|count|counts|raw co-occurrence|classifier-score-products|association[ -]strength|jaccard|fractional|shared[ -]reference[ -]counts?)$/.test(text)) return "other";
      return "description";
    };
    const operative = classify(graph.construction?.normalization), declaration = classify(graph.normalization), semanticCosine = graph.semantic?.kind === "embeddings";
    if (operative && operative !== "description" && declaration && declaration !== "description" && operative !== declaration || semanticCosine && (operative === "other" || declaration === "other")) fail("Conflicting declared edge normalizations; the check cannot choose a construction silently.");
    if (operative === "description" && (declaration === "cosine" || semanticCosine)) fail("The operative construction normalization is unknown; a cosine display declaration cannot override it.");
    return operative === "cosine" || declaration === "cosine" || semanticCosine;
  }
  function validateGraph(graph, requireObjective = true) {
    if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.links) || !graph.nodes.length) fail("A nonempty retained analytical graph is required.");
    if (graph.nodes.length > RESEARCH_CHECK_LIMITS.nodes || graph.links.length > RESEARCH_CHECK_LIMITS.edges) fail("Graph exceeds the 2,000-node or 200,000-edge diagnostic budget; no sampling is used.");
    if (graph.temporalSelection || graph.collaboration || graph.directed || graph.method === "direct_citation" || graph.canvasKind === "historiography" || ["author", "institution", "country", "term", "topic", "cited-work"].includes(graph.entityKind) || graph.semantic?.kind && graph.semantic.kind !== "embeddings" || graph.trial || graph.networkModel && graph.networkModel !== "pairwise" || graph.order != null && graph.order !== 2 || graph.hyperedges?.length) fail("Only undirected pairwise source-work graphs are supported; temporal, actor and hypergraph representations require their own checks.");
    const coupling = graph.method === "coupling" || graph.canvasKind === "coupling" || graph.construction?.method === "bibliographic_coupling";
    const semantic = graph.semantic?.kind === "embeddings" || graph.construction?.method === "semantic_embeddings";
    if (!coupling && !semantic && graph.entityKind !== "source") fail("The graph must explicitly declare a source-work universe. Cited-reference, term and actor partitions are not interchangeable.");
    const ids = /* @__PURE__ */ new Set();
    for (const node of graph.nodes) {
      if (!nodeId(node.id) || ids.has(node.id)) fail("Every graph node must have a distinct exact string ID.");
      ids.add(node.id);
    }
    const pairs = /* @__PURE__ */ new Set();
    for (const edge of graph.links) {
      if (!ids.has(edge.source) || !ids.has(edge.target) || edge.source === edge.target || !Number.isFinite(weight(edge)) || weight(edge) <= 0) fail("Edges require distinct retained endpoints and explicit finite positive raw weights.");
      const key = pairKey(edge.source, edge.target);
      if (pairs.has(key)) fail("Duplicate undirected edges are unsupported; no silent aggregation is permitted.");
      pairs.add(key);
    }
    let settings = null;
    if (requireObjective) {
      const algorithm = graph.clustering?.algorithm, objective = String(graph.clustering?.objective || "").toLowerCase();
      if (algorithm !== "leiden" || !["modularity", "cpm"].includes(objective)) fail("Only explicitly declared Leiden modularity or CPM can be refitted; no fallback objective is permitted.");
      const declaredResolution = graph.clustering?.resolution ?? graph.resolution;
      if (objective === "cpm" && (!Number.isFinite(declaredResolution) || declaredResolution <= 0)) fail("CPM requires its retained positive resolution/gamma.");
      if (objective === "modularity" && declaredResolution != null && declaredResolution !== 1) fail("Non-unit generalized modularity resolution is not supported by this bounded implementation.");
      settings = { algorithm: "leiden", objective, resolution: objective === "cpm" ? declaredResolution : 1, weightPolicy: objective === "cpm" ? "Native BiblioMap CPM: raw edge weights divided by this variant mean positive edge weight; gamma unchanged." : "Exact raw edge weights, unchanged; unit-resolution modularity.", maxLevels: RESEARCH_CHECK_LIMITS.maxLevels, maxLocalPasses: RESEARCH_CHECK_LIMITS.maxLocalPasses, startsPerSeed: 1 };
      if (objective === "cpm" && graph.importedStandalone) fail("Imported CPM scale is unspecified; native mean-weight CPM scaling cannot be assumed.");
    }
    return { ids, coupling, semantic, settings };
  }
  function sourceRecords(graph, records) {
    const supplied = recordsArray(records), lookup = /* @__PURE__ */ new Map();
    for (const record of supplied) {
      if (!nodeId(record?.id) || lookup.has(record.id)) fail("Source evidence must have distinct exact string IDs.");
      lookup.set(record.id, record);
    }
    const missing = graph.nodes.filter((node) => !lookup.has(node.id)).map((node) => node.id);
    if (missing.length) fail(missing.length + " graph nodes have no matching exact source record; source IDs are never inferred.");
    return { selected: graph.nodes.map((node) => lookup.get(node.id)), supplied: supplied.length, extra: supplied.length - graph.nodes.length };
  }
  function semanticSourceRecords(graph, records) {
    const source = sourceRecords(graph, records);
    return { ...source, selected: source.selected.map((record) => {
      if (typeof record.abstract_inverted_index !== "string") return record;
      let parsed;
      try {
        parsed = JSON.parse(record.abstract_inverted_index);
      } catch {
        fail("Retained abstract inverted-index JSON is malformed for " + record.id);
      }
      if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object" || Object.values(parsed).some((offsets) => !Array.isArray(offsets) || offsets.some((offset) => !Number.isInteger(offset) || offset < 0))) fail("Retained abstract inverted-index offsets are invalid for " + record.id);
      return { ...record, abstract_inverted_index: parsed };
    }) };
  }
  function referencesFor(graph, records) {
    const source = sourceRecords(graph, records), postings = /* @__PURE__ */ new Map();
    let assignments = 0;
    const works = source.selected.map((record) => {
      const values = record.references ?? record.referenced_works;
      if (!Array.isArray(values) || values.some((value) => !nodeId(value))) fail("Explicit reference lists are required for every source. Missing lists are unknown coverage, not empty lists.");
      const references = [...new Set(values.map(referenceId))];
      assignments += references.length;
      if (assignments > RESEARCH_CHECK_LIMITS.referenceAssignments) fail("Reference incidence exceeds one million assignments.");
      for (const id of references) postings.set(id, (postings.get(id) || 0) + 1);
      return { ...record, references };
    });
    const contributions = [...postings.values()].reduce((sum, count) => sum + choose2(count), 0);
    if (contributions > RESEARCH_CHECK_LIMITS.referencePairContributions) fail("Reference reconstruction exceeds ten million pair contributions; no partial reconstruction is permitted.");
    return { ...source, works, assignments, contributions, emptyLists: works.filter((work) => !work.references.length).length };
  }
  function couplingSettings(graph, options) {
    if (!(graph.method === "coupling" || graph.canvasKind === "coupling" || graph.construction?.method === "bibliographic_coupling") || !cosineNormalization(graph)) fail("This check requires explicitly declared source-work cosine bibliographic coupling.");
    const minimumShared = options.minimumShared ?? graph.minimumShared, minimumCosine = options.minimumCosine ?? graph.minimumCosine;
    if (!Number.isInteger(minimumShared) || minimumShared < 1 || !Number.isFinite(minimumCosine) || minimumCosine < 0 || minimumCosine > 1) fail("Retained minimumShared and minimumCosine construction thresholds are required.");
    if (options.minimumShared != null && options.minimumShared !== graph.minimumShared || options.minimumCosine != null && options.minimumCosine !== graph.minimumCosine) fail("Construction thresholds must equal the retained baseline settings.");
    return { minimumShared, minimumCosine };
  }
  function articleSelection(graph, records, options) {
    const source = sourceRecords(graph, records), typeMap = options.typeMap || {}, missing = [], types = {}, articles = [];
    for (const record of source.selected) {
      const declared = record.type ?? record.publication_type, supplemental = typeMap[record.id];
      if (declared != null && supplemental != null && declared !== supplemental) fail("Supplemental publication type conflicts with retained source type: " + record.id);
      const type = declared ?? supplemental;
      if (typeof type !== "string" || !type.trim()) missing.push(record.id);
      else {
        types[type] = (types[type] || 0) + 1;
        if (type === "article") articles.push(record.id);
      }
    }
    if (missing.length) fail(missing.length + " source publication types are missing; article-only restriction cannot infer types from titles or venues.");
    if (!articles.length) fail("No source records have the exact declared publication type article.");
    return { ...source, ids: articles, types, supplementalTypes: source.selected.filter((record) => record.type == null && record.publication_type == null).length };
  }
  function thresholdPlan(graph, options) {
    const cosine = cosineNormalization(graph);
    const declaredFloors = [graph.minimumRetainedWeight, ...cosine ? [graph.minimumCosine, graph.semantic?.minimumSimilarity] : []].filter((value) => value != null);
    if (declaredFloors.some((value) => !Number.isFinite(value) || value < 0)) fail("The declared retained edge floor is invalid.");
    const knownFloor = declaredFloors.length ? Math.max(...declaredFloors) : null;
    if (options.minimumRetainedWeight != null && knownFloor != null && options.minimumRetainedWeight < knownFloor) fail("An override cannot weaken the graph's declared minimum retained edge weight.");
    const minimumRetained = options.minimumRetainedWeight ?? knownFloor;
    if (!Number.isFinite(minimumRetained) || minimumRetained < 0) fail("Declare the minimum retained edge weight; missing edges below the retained scope cannot be reconstructed by filtering.");
    const requested = options.thresholds ?? [0, 0.05, 0.1];
    if (!Array.isArray(requested) || !requested.length || requested.length > 3 || requested.some((value) => !Number.isFinite(value) || value < 0 || cosine && value > 1) || new Set(requested).size !== requested.length) fail("Supply one to three distinct exact nonnegative edge thresholds.");
    const thresholds = requested.filter((value) => value >= minimumRetained), unavailable = requested.filter((value) => value < minimumRetained).map((value) => ({ threshold: value, reason: "Below the retained minimum; missing edges cannot be added by this check." }));
    if (!thresholds.length) fail("All requested thresholds fall below the retained edge scope.");
    if (options.thresholds && unavailable.length) fail("An explicitly requested threshold is below the retained edge scope.");
    return { thresholds, unavailable, minimumRetained, metric: cosine ? "retained exact cosine edge weight" : "retained exact edge weight", fixedNodeUniverse: true };
  }
  function rankScores(graph, records, options) {
    const metric = options.rankMetric ?? "strength";
    if (!["strength", "incoming", "global-citations"].includes(metric)) fail("Unknown rank metric. Choose strength, incoming or global-citations; no fallback score is permitted.");
    if (metric !== "global-citations" && options.globalCitationField != null) fail("globalCitationField applies only to the global-citations metric.");
    const scores = new Map(graph.nodes.map((node) => [node.id, 0]));
    let definition, diagnostics;
    if (metric === "strength") {
      for (const edge of graph.links) for (const id of [edge.source, edge.target]) scores.set(id, scores.get(id) + weight(edge));
      if ([...scores.values()].some((score) => !Number.isFinite(score))) fail("Retained edge strength sum exceeds finite numeric precision.");
      definition = "Sum of exact retained positive undirected edge weights incident to each source work; graph-local strength, not a citation count.";
      diagnostics = { sourceRecordsRequired: false, retainedEdges: graph.links.length, edgeWeightsChanged: false };
    } else {
      const source = sourceRecords(graph, records);
      if (metric === "global-citations") {
        const field = options.globalCitationField;
        if (!["cited_by_count", "citedBy"].includes(field)) fail("Global citation ranking requires explicit globalCitationField: cited_by_count or citedBy. Node citations are not assumed to be global counts.");
        const missing = source.selected.filter((record) => !Object.hasOwn(record, field) || !Number.isSafeInteger(record[field]) || record[field] < 0);
        if (missing.length) fail(missing.length + " selected source works lack an explicit nonnegative integer " + field + " value; unknown global citations cannot be replaced by zero.");
        for (const record of source.selected) scores.set(record.id, record[field]);
        definition = "Exact retained source-record field " + field + "; observed database-wide cited-by count at its retained observation, not a current or historical-priority claim.";
        diagnostics = { field, valuesAvailable: source.selected.length, sourceRecordsSupplied: source.supplied, sourceRecordsOutsideNodeUniverse: source.extra, observationDate: "Not inferred; inspect pinned source retrieval provenance." };
      } else {
        const lookup = /* @__PURE__ */ new Map();
        let assignments = 0, selfMatches = 0, matchedReferences = 0, emptyLists = 0, unmatchedReferences = 0;
        for (const node of graph.nodes) {
          const key = referenceId(node.id);
          if (lookup.has(key)) fail("Source-work IDs have ambiguous OpenAlex aliases; local incoming citations cannot infer a merge.");
          lookup.set(key, node.id);
        }
        for (const record of source.selected) {
          const values = record.references ?? record.referenced_works;
          if (!Array.isArray(values) || values.some((value) => !nodeId(value))) fail("Every selected source needs an explicit reference list for observed incoming citation counts; missing lists are unknown coverage.");
          const refs = new Set(values.map(referenceId));
          assignments += refs.size;
          if (!refs.size) emptyLists++;
          if (assignments > RESEARCH_CHECK_LIMITS.referenceAssignments) fail("Observed incoming citation counting exceeds one million distinct source-reference assignments.");
          for (const ref of refs) {
            const target = lookup.get(ref);
            if (!target) {
              unmatchedReferences++;
              continue;
            }
            if (target === record.id) {
              selfMatches++;
              continue;
            }
            scores.set(target, scores.get(target) + 1);
            matchedReferences++;
          }
        }
        definition = "Number of distinct other selected source works whose explicit retained reference lists cite this exact selected source-work ID; OpenAlex W/HTTP/HTTPS aliases only, with exact self-matches excluded.";
        diagnostics = { citingSourceUniverse: graph.nodes.map((node) => node.id), sourceRecordsSupplied: source.supplied, sourceRecordsOutsideNodeUniverse: source.extra, distinctSourceReferenceAssignments: assignments, matchedNonSelfReferences: matchedReferences, unmatchedReferences, excludedSelfMatches: selfMatches, emptyReferenceLists: emptyLists, bibliographyCompleteness: "Unknown. Explicit empty lists remain observed unavailable bibliography coverage; no missing citations are imputed." };
      }
    }
    return { metric, scores, definition, diagnostics };
  }
  function preflightResearchCheck(input) {
    const { kind, graph, records, cache, comparisonGraph, options = {} } = input || {};
    if (!RESEARCH_CHECK_KINDS.includes(kind)) fail("Unknown research check kind.");
    validateCheckOptions(kind, options);
    const base = validateGraph(graph, !["compare", "edge-audit", "rank-cutoff"].includes(kind));
    if (!["edge-audit", "rank-cutoff"].includes(kind)) researchCheckMemberships(graph);
    const pairs = choose2(graph.nodes.length);
    if (pairs > RESEARCH_CHECK_LIMITS.pairs) fail("Candidate universe exceeds two million pairs.");
    let fits = kind === "seed" || kind === "article-only" ? 5 : 0, details = {};
    if (kind === "threshold") {
      details = thresholdPlan(graph, options);
      fits = details.thresholds.length * 5;
    }
    if (kind === "article-only") {
      const selected = articleSelection(graph, records, options);
      details = { retainedArticleIds: selected.ids, typeCounts: selected.types, supplementalTypes: selected.supplementalTypes, removed: graph.nodes.length - selected.ids.length };
    }
    if (kind === "edge-audit" || kind === "reference-ablation") {
      const settings = couplingSettings(graph, options), evidence = referencesFor(graph, records);
      details = { ...settings, referenceAssignments: evidence.assignments, referencePairContributions: evidence.contributions, emptyReferenceLists: evidence.emptyLists, referenceIdentityPolicy: "Exact distinct references; OpenAlex W IDs/HTTP/HTTPS aliases reversibly normalized to HTTPS OpenAlex W IDs." };
      if (kind === "reference-ablation") {
        const ids = options.referenceIds;
        if (!Array.isArray(ids) || !ids.length || ids.length > 2 || ids.some((id) => !nodeId(id)) || new Set(ids.map(referenceId)).size !== ids.length) fail("Select one or two explicit distinct reference IDs for ablation.");
        const canonical2 = ids.map(referenceId);
        if (canonical2.some((id) => !evidence.works.some((work) => work.references.includes(id)))) fail("An ablated reference ID is absent from the exact retained source incidence.");
        details.referenceIds = canonical2;
        details.variants = canonical2.map((id) => [id]);
        if (canonical2.length === 2) details.variants.push(canonical2);
        fits = details.variants.length * 5;
      }
    }
    if (kind === "text-neighbours") {
      if (!base.semantic || graph.semantic?.kind !== "embeddings") fail("Text-neighbour checks require a source MiniLM cosine graph.");
      const source = semanticSourceRecords(graph, records), evidence = embeddingEvidence(source.selected, cache, { textScope: "titles-abstracts" }, graph.sourceCorpusId);
      const model = graph.semantic.model;
      if (!model || model.id !== evidence.model.id || model.revision !== evidence.model.revision || model.dimensions !== evidence.model.dimensions) fail("The cache model/revision/dimensions do not match the retained semantic graph.");
      details = { kValues: [5, 10, 15], mode: "symmetric union of strictly positive top-k neighbours; ties by exact source ID", model: evidence.model, coverage: evidence.coverage, vectorDimensions: 384, vectorProducts: pairs * 384 };
      fits = 15;
    }
    if (kind === "compare") {
      validateGraph(comparisonGraph, false);
      researchCheckMemberships(comparisonGraph);
      details = { secondNodes: comparisonGraph.nodes.length, secondEdges: comparisonGraph.links.length };
    }
    if (kind === "rank-cutoff") {
      const rank = rankScores(graph, records, options);
      details = { rankMetric: rank.metric, definition: rank.definition, cutoffs: [10, 20], diagnostics: rank.diagnostics, communityOptimizerExecuted: false };
    }
    if (fits > RESEARCH_CHECK_LIMITS.fits) fail("Check exceeds fifteen fixed-seed fits.");
    return { version: RESEARCH_CHECK_VERSION, kind, available: true, settings: base.settings, budget: { nodes: graph.nodes.length, edges: graph.links.length, candidatePairs: pairs, fits, maximumMilliseconds: RESEARCH_CHECK_LIMITS.milliseconds, limits: { ...RESEARCH_CHECK_LIMITS } }, details };
  }
  function researchCheckMemberships(graph) {
    const connected = connectedIds(graph), memberships = {};
    for (const node of graph.nodes) {
      const engine = node.engineCommunity;
      if (typeof engine === "string" && engine.length || Number.isFinite(engine)) memberships[node.id] = "engine:" + engine;
      else if (connected.has(node.id) && (typeof node.cluster === "string" && node.cluster.length || Number.isFinite(node.cluster) && node.cluster > 0)) memberships[node.id] = "cluster:" + node.cluster;
      else if (!connected.has(node.id)) memberships[node.id] = "singleton:" + node.id;
      else fail("A connected source has no retained partition membership: " + node.id);
    }
    return memberships;
  }

  // scripts/cluster-research-indicators.mjs
  function clusterMapChecks(graph, cluster, { entry = null, digest = null } = {}) {
    if (!graph || !(Number(cluster) > 0)) return null;
    const members = graph.nodes.filter((n) => String(n.cluster) === String(cluster));
    if (!members.length) return null;
    const matched = digest && entry?.graph_sha256 === digest && entry.corpus_id === graph.sourceCorpusId && entry.project_id === graph._projectId && entry.map_key === graph.importedStandalone?.map_key;
    const retained = (matched ? entry.checks : []).filter((c) => c.relationship === "Includes this map or its explicitly named baseline comparison");
    const fresh = (graph.researchCheckRuns || []).filter((r) => digest && r.graph_sha256 === digest && r.result?.version === RESEARCH_CHECK_VERSION && r.result.status === "completed" && r.result.executed === true);
    if (!retained.length && !fresh.length) return null;
    return { cluster: String(cluster), members: members.length, retainedCount: retained.length, freshCount: fresh.length, label: "Map checks \xB7 " + (retained.length + fresh.length), detail: `Cluster ${cluster}: ${retained.length} retained whole-map checks and ${fresh.length} fresh diagnostic results. These are map-level results, not a stability rating for this cluster.` };
  }
  function clearClusterMapChecks(root) {
    for (const wrapper of root.querySelectorAll(".cluster-research-tile")) {
      const button = wrapper.querySelector(".cluster-button");
      if (button) wrapper.replaceWith(button);
      else wrapper.remove();
    }
  }
  function syncClusterMapChecks(root, graph, state, onOpen) {
    for (const button of root.querySelectorAll(".cluster-buttons .cluster-button[data-cluster]")) {
      const cluster = button.dataset.cluster, info = clusterMapChecks(graph, cluster, state);
      let wrapper = button.parentElement?.classList.contains("cluster-research-tile") ? button.parentElement : null;
      if (!info) {
        if (wrapper) wrapper.replaceWith(button);
        continue;
      }
      if (!wrapper) {
        const focused = root.activeElement === button;
        wrapper = root.createElement("div");
        wrapper.className = "cluster-research-tile";
        button.before(wrapper);
        wrapper.append(button);
        if (focused) button.focus({ preventScroll: true });
      }
      let link = wrapper.querySelector(".cluster-map-checks");
      if (!link) {
        link = root.createElement("button");
        link.type = "button";
        link.className = "cluster-map-checks";
        wrapper.append(link);
      }
      if (link.textContent !== info.label) link.textContent = info.label;
      link.title = info.detail;
      link.setAttribute("aria-label", "View map-level research checks for cluster " + cluster);
      link.setAttribute("aria-controls", "researchChecks");
      link.onclick = (event) => {
        event.stopPropagation();
        onOpen(graph, cluster);
      };
    }
  }

  // scripts/canvas-research-checks.mjs
  if (typeof window !== "undefined" && window.atlasSharedCanvas && window.atlasWorkspaceShell) {
    let resetTileContext = function() {
      tileContext.hidden = true;
      tileContext.textContent = "";
      panel.querySelector("summary").removeAttribute("aria-describedby");
      for (const row of retained.querySelectorAll("[data-study-context]")) row.hidden = false;
    }, showChecks = function(graph = null, cluster = null) {
      if (graph) {
        if (graph !== boundGraph || window.atlasSharedCanvas.graph() !== graph) return;
        if (JSON.stringify(researchGraphIdentity(graph)) !== lastIdentity) {
          clearClusterMapChecks(document);
          resetTileContext();
          window.ATLAS_RESEARCH_CHECKS.sync();
          return;
        }
        const info = clusterMapChecks(graph, cluster, { entry, digest: boundDigest });
        if (!info) return;
        tileContext.textContent = `Cluster ${cluster} \xB7 ${info.members} works. These checks apply to the whole map, not a stability rating for this cluster. A global agreement score does not establish how this individual cluster holds together.`;
        tileContext.hidden = false;
        panel.querySelector("summary").setAttribute("aria-describedby", tileContext.id);
        for (const row of retained.querySelectorAll("[data-study-context]")) row.hidden = true;
      } else resetTileContext();
      window.atlasWorkspaceShell.show("analysis");
      panel.open = true;
      panel.querySelector("summary").focus({ preventScroll: true });
      panel.scrollIntoView({ block: "nearest" });
    }, tileIndicators = function(identity = null) {
      const graph = window.atlasSharedCanvas.graph();
      if (graph !== boundGraph || (identity || JSON.stringify(researchGraphIdentity(graph))) !== lastIdentity) return clearClusterMapChecks(document);
      syncClusterMapChecks(document, graph, { entry, digest: boundDigest }, showChecks);
    }, stop = function(message = "Cancelled. No partial result was saved.") {
      worker?.terminate();
      worker = null;
      clearTimeout(timer);
      cancel.hidden = true;
      run.disabled = false;
      progress.textContent = message;
    }, link = function(path, label) {
      const a = make("a", label);
      a.href = new URL(path, base).href;
      a.target = "_blank";
      a.rel = "noopener";
      return a;
    }, download = function(value, name) {
      const button = make("button", "Download results");
      button.type = "button";
      button.onclick = () => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" })), a = make("a");
        a.href = url;
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1e3);
      };
      return button;
    }, renderRetained = function() {
      retained.replaceChildren();
      if (!entry) return;
      retained.append(make("h3", "Retained research results"), make("p", `${entry.nodes} works \xB7 ${entry.edges.toLocaleString()} edges \xB7 ${entry.isolates} isolates. Exact saved graph and supporting files matched.`));
      retained.append(make("p", "ARI (adjusted Rand index) compares two groupings on the same named works: 1 means identical, values near 0 mean little agreement beyond chance. It is not a cluster stability rating."));
      for (const check of entry.checks) {
        const row = make("details");
        if (check.relationship.startsWith("Study context")) row.dataset.studyContext = "true";
        row.append(make("summary", (check.relationship.startsWith("Study context") ? "Study context \xB7 " : "") + check.title), make("p", check.relationship), make("p", check.scope), make("p", check.summary), link(check.artifact, "Read original numerical results"));
        const raw = make("pre", JSON.stringify(check.result, null, 2));
        row.append(raw);
        retained.append(row);
      }
      const limits = make("details");
      limits.append(make("summary", "Not assessed by the original research"));
      for (const item of entry.not_assessed) limits.append(make("p", item));
      retained.append(limits);
      const appraisal = make("div");
      appraisal.dataset.studyContext = "true";
      appraisal.append(make("p", entry.source_appraisal.scope), link(entry.source_appraisal.report, "Read source appraisal and interpretation"));
      retained.append(appraisal, download(entry, "retained-research-checks.json"));
    }, renderRuns = function(graph) {
      outputs.replaceChildren();
      const matching = (graph.researchCheckRuns || []).filter((item) => item.graph_sha256 === boundDigest);
      for (const item of matching) {
        const row = make("details");
        row.append(make("summary", names[item.result.kind] + " \xB7 " + new Date(item.result.createdAt).toLocaleString()), make("p", "Fresh app diagnostic, separate from the retained original study. Saved with this map only when you use Save current map."));
        const settings = item.result.actualSettings;
        row.append(make("p", typeof item.result.implementation === "string" ? item.result.implementation : JSON.stringify(item.result.implementation)), make("p", "Settings: " + JSON.stringify(settings)));
        const agreement = (host, value) => {
          for (const [key, label] of [["commonFullUniverse", "All common works"], ["baselineConnectedCommonUniverse", "Common works connected in the baseline"], ["bothConnectedCommonUniverse", "Common works connected in both maps"]]) {
            const v = value?.[key];
            if (v) host.append(make("p", `${label}: ${v.count} works; ARI ${v.adjustedRandIndex === null ? "not defined for fewer than two works" : v.adjustedRandIndex.toFixed(3)}.`));
          }
        };
        const variants = item.result.variants || [];
        for (const variant of variants) {
          const d = make("details");
          d.append(make("summary", variant.definition.label || JSON.stringify(variant.definition)));
          for (const fit of variant.runs || []) {
            d.append(make("p", `Seed ${fit.seed} \xB7 ${fit.connectedCommunities} connected groups \xB7 ${fit.isolates} isolates \xB7 ${fit.edges} edges`));
            if (fit.comparison) agreement(d, fit.comparison);
          }
          row.append(d);
        }
        if (item.result.results) {
          const r = item.result.results;
          if (item.result.kind === "compare") agreement(row, r.comparison);
          if (item.result.kind === "edge-audit") row.append(make("p", r.status === "verified" ? `Edge audit verified ${r.expectedEdges} expected edges with zero discrepancies.` : `Edge audit found ${r.mismatchCount} discrepancies. Inspect the exact results before interpreting this construction.`));
          if (item.result.kind === "rank-cutoff") row.append(make("p", r.definition));
          const exact = make("details");
          exact.append(make("summary", "Exact numerical results and populations"), make("pre", JSON.stringify(r, null, 2)));
          row.append(exact);
        }
        for (const limit of item.result.limitations || []) row.append(make("p", limit));
        row.append(download(item.result, "research-check-" + item.result.kind + ".json"));
        outputs.append(row);
      }
      if ((graph.researchCheckRuns || []).length > matching.length) outputs.append(make("p", "Some saved app checks were withheld because their graph identity no longer matches."));
    }, options = function() {
      return { ...select.value === "article-only" && typeMap ? { typeMap } : {}, ...select.value === "reference-ablation" ? { referenceIds: reference.value.split(",").map((x) => x.trim()).filter(Boolean) } : {}, ...select.value === "rank-cutoff" ? { rankMetric: rank.value, ...rank.value === "global-citations" ? { globalCitationField: countField.value } : {} } : {} };
    }, checkInput = function(graph = boundGraph) {
      const input = { kind: select.value, graph, records, cache, comparisonGraph, options: options() };
      assertLegacyCountEvidence(graph, records, entry, input);
      return input;
    }, readiness = function() {
      reference.hidden = select.value !== "reference-ablation";
      comparison.hidden = select.value !== "compare";
      rank.hidden = select.value !== "rank-cutoff";
      countField.hidden = rank.hidden || rank.value !== "global-citations";
      if (worker) {
        run.disabled = true;
        return;
      }
      try {
        const p = preflightResearchCheck(checkInput());
        reason.textContent = `${p.budget.nodes.toLocaleString()} works; up to ${p.budget.fits} fits. Exact retained evidence, no sampling. Maximum 3 minutes; Cancel stops the worker.`;
        run.disabled = false;
      } catch (e) {
        reason.textContent = e.message;
        run.disabled = true;
      }
    };
    const make = (tag, text = "") => {
      const n = document.createElement(tag);
      n.textContent = text;
      return n;
    }, base = new URL("/conservative-atlas/", location.href);
    const panel = make("details");
    panel.id = "researchChecks";
    panel.className = "research-checks";
    panel.append(make("summary", "Research checks"));
    const status = make("p");
    status.setAttribute("role", "status");
    const tileContext = make("p");
    tileContext.id = "clusterResearchCheckContext";
    tileContext.className = "cluster-check-context";
    tileContext.hidden = true;
    const retained = make("div"), fresh = make("details");
    fresh.append(make("summary", "Run a research check"));
    panel.append(status, tileContext, retained, fresh);
    document.querySelector("#analysisPanel .shell-panel-body")?.append(panel);
    const notice = make("p", "These checks compare maps and constructions. They do not give per-cluster confidence, approve AI names or establish article quality. Opening a saved map does not rerun them.");
    fresh.append(notice);
    const select = make("select");
    select.id = "researchCheckKind";
    select.setAttribute("aria-label", "Research check");
    const names = { "seed": "Optimizer seeds", "threshold": "Edge thresholds", "article-only": "Article-only restriction", "reference-ablation": "Remove influential references", "text-neighbours": "Text neighbour counts", "compare": "Compare another saved map", "edge-audit": "Audit coupling edges", "rank-cutoff": "Candidate rank cutoffs" };
    for (const [value, label] of Object.entries(names)) select.append(new Option(label, value));
    const reference = make("input");
    reference.id = "researchCheckReferences";
    reference.placeholder = "One or two OpenAlex reference IDs, separated by commas";
    reference.setAttribute("aria-label", "References to remove");
    const comparison = make("select");
    comparison.id = "researchCheckComparison";
    comparison.setAttribute("aria-label", "Saved map to compare");
    const rank = make("select");
    rank.id = "researchCheckRankMetric";
    rank.setAttribute("aria-label", "Ranking measure");
    for (const [value, label] of [["strength", "Coupling / network strength"], ["incoming", "Observed citations from this corpus"], ["global-citations", "Retained global citation counts"]]) rank.append(new Option(label, value));
    const countField = make("select");
    countField.id = "researchCheckCountField";
    countField.setAttribute("aria-label", "Source field containing global citation counts");
    for (const value of ["citedBy", "cited_by_count"]) countField.append(new Option("Source field: " + value, value));
    const reason = make("p"), run = make("button", "Run check"), cancel = make("button", "Cancel check"), progress = make("p"), outputs = make("div");
    run.type = cancel.type = "button";
    cancel.hidden = true;
    progress.setAttribute("role", "status");
    fresh.append(select, reference, comparison, rank, countField, reason, run, cancel, progress, outputs);
    let manifestPromise, entry = null, boundGraph = null, boundDigest = null, lastIdentity = "", ticket = 0, comparisonTicket = 0, choiceTicket = 0, worker = null, timer = null, records = [], cache = null, typeMap = null, comparisonGraph = null, projectMaps = [], pending = null;
    const verified = /* @__PURE__ */ new Map();
    document.getElementById("validationResultsDetails")?.addEventListener("click", resetTileContext);
    const projectSection = make("details");
    projectSection.id = "projectResearchChecks";
    projectSection.className = "project-section project-disclosure";
    projectSection.hidden = true;
    const projectBody = make("div");
    projectBody.className = "project-section-body";
    projectSection.append(make("summary", "Research checks"), projectBody);
    document.getElementById("projectResearchReports")?.after(projectSection);
    let projectEpoch = 0;
    async function projectChecks(projectId) {
      const epoch = ++projectEpoch;
      projectSection.hidden = true;
      if (!projectId) return;
      try {
        const manifest = await readManifest();
        if (epoch !== projectEpoch) return;
        const maps = manifest.maps.filter((m) => m.project_id === projectId);
        if (!maps.length) return;
        projectBody.replaceChildren(make("p", `Original research checks are indexed for ${maps.length} saved maps in this project. Opening a map verifies its exact graph and supporting files before showing results.`));
        const button = make("button", "View current map\u2019s checks");
        button.type = "button";
        button.onclick = () => showChecks();
        projectBody.append(button, make("p", "Includes optimizer seeds, construction thresholds, article restriction, influential-reference removals, text/citation comparisons and candidate-discovery checks. Source appraisal and review limits are retained separately."));
        projectSection.hidden = false;
      } catch {
      }
    }
    async function bytes(path) {
      if (!verified.has(path)) verified.set(path, fetch(new URL(path, base), { cache: "no-cache" }).then(async (r) => {
        if (!r.ok) throw Error("Supporting research file could not be loaded.");
        const data = await r.arrayBuffer();
        if (data.byteLength > 8e6) throw Error("Supporting file exceeds display budget.");
        return data;
      }).catch((e) => {
        verified.delete(path);
        throw e;
      }));
      return verified.get(path);
    }
    const readManifest = () => manifestPromise || (manifestPromise = fetch(new URL("ai-research/research-checks-v1.json", base), { cache: "no-cache" }).then(async (r) => {
      if (!r.ok) throw Error("Retained checks could not be loaded.");
      const raw = await r.text();
      if (raw.length > 3e6) throw Error("Research index exceeds its display budget.");
      return JSON.parse(raw);
    }).catch((e) => {
      manifestPromise = null;
      throw e;
    }));
    async function sources(graph) {
      const packet = window.atlasSharedCanvas.currentCorpus?.();
      if (packet?.evidence?.articles) {
        if (packet.corpusId !== graph.sourceCorpusId || packet.evidence.sourceCorpusId !== graph.sourceCorpusId) throw Error("Current source packet does not match this graph.");
        return Object.values(packet.evidence.articles);
      }
      const dataset = await window.ATLAS_EVIDENCE.prepareDataset();
      if (dataset.sourceCorpusId !== graph.sourceCorpusId) throw Error("Current source evidence does not match this graph.");
      return Object.values(dataset.articles || {});
    }
    async function sync() {
      const graph = window.atlasSharedCanvas.graph();
      if (!graph?.nodes) return;
      let identity;
      try {
        identity = JSON.stringify(researchGraphIdentity(graph));
      } catch {
        return;
      }
      if (graph === boundGraph && identity === lastIdentity) {
        tileIndicators(identity);
        return;
      }
      const id = ++ticket;
      if (worker) stop("Map changed. The check was cancelled; no partial result was saved.");
      clearClusterMapChecks(document);
      resetTileContext();
      boundDigest = null;
      boundGraph = graph;
      lastIdentity = identity;
      entry = null;
      cache = null;
      typeMap = null;
      comparisonGraph = null;
      records = [];
      choiceTicket++;
      comparisonTicket++;
      retained.replaceChildren();
      outputs.replaceChildren();
      status.textContent = graph.importedStandalone ? "Matching retained research checks\u2026" : "No retained original study is attached to this map.";
      run.disabled = true;
      try {
        const digest = await researchGraphDigest(graph);
        const manifest = await readManifest();
        const found = await bindRetainedChecks(graph, manifest, bytes);
        if (id !== ticket) return;
        boundDigest = digest;
        entry = found;
        status.textContent = entry ? "Retained map-level checks available. Per-cluster stability was not assessed." : "No retained original study is attached to this map. Run compatible app checks below.";
        renderRetained();
        let types = null;
        if (entry) {
          const file = entry.artifacts.find((a) => a.path.endsWith("/work-theme-map.csv"));
          if (file) types = researchTypeMap(new TextDecoder().decode(await bytes(file.path)));
        }
        const source = await sources(graph);
        if (id !== ticket || graph !== boundGraph) return;
        records = source;
        typeMap = types;
        renderRuns(graph);
        readiness();
        tileIndicators();
        window.atlasWorkspaceShell.refresh();
      } catch (e) {
        if (id !== ticket) return;
        entry = null;
        retained.replaceChildren();
        status.textContent = e.message;
        let source = [];
        try {
          source = await sources(graph);
        } catch {
        }
        if (id === ticket && graph === boundGraph) {
          const digest = await researchGraphDigest(graph);
          if (id !== ticket || graph !== boundGraph) return;
          boundDigest = digest;
          records = source;
          renderRuns(graph);
          readiness();
          tileIndicators();
          window.atlasWorkspaceShell.refresh();
        }
      }
    }
    select.onchange = async () => {
      const epoch = ++choiceTicket, g = boundGraph, projectId = window.ATLAS_PROJECTS?.activeProject()?.id;
      comparisonTicket++;
      comparisonGraph = null;
      readiness();
      if (select.value === "text-neighbours" && !cache) {
        progress.textContent = "Loading exact embedding cache\u2026";
        try {
          const r = await fetch(new URL("workspace-api/corpora/" + encodeURIComponent(g.sourceCorpusId) + "/themes", base));
          if (!r.ok) throw Error("Embedding cache unavailable.");
          const data = await r.json();
          if (g !== boundGraph || epoch !== choiceTicket) return;
          cache = data;
          progress.textContent = "Embedding cache loaded; preflight checks its exact text and model identity.";
        } catch (e) {
          if (epoch === choiceTicket) progress.textContent = e.message;
        }
        readiness();
      }
      if (select.value === "compare") {
        comparison.replaceChildren(new Option("Loading saved maps\u2026", ""));
        try {
          if (!projectId) throw Error("Open a project first.");
          const r = await fetch(new URL("workspace-api/projects/" + projectId, base));
          if (!r.ok) throw Error("Could not load saved maps.");
          const data = await r.json();
          if (epoch !== choiceTicket || g !== boundGraph || window.ATLAS_PROJECTS?.activeProject()?.id !== projectId) return;
          projectMaps = data.analyses || [];
          comparison.replaceChildren(new Option("Choose saved map\u2026", ""), ...projectMaps.map((m) => new Option(m.name, m.id)));
        } catch (e) {
          if (epoch === choiceTicket) progress.textContent = e.message;
        }
      }
    };
    comparison.onchange = async () => {
      const epoch = ++comparisonTicket, choice = choiceTicket, selected = comparison.value, g = boundGraph;
      comparisonGraph = null;
      readiness();
      if (!selected) return;
      try {
        const r = await fetch(new URL("workspace-api/snapshots/" + encodeURIComponent(selected), base));
        if (!r.ok) throw Error("Could not load comparison snapshot.");
        const packet = await r.json();
        if (g !== boundGraph || epoch !== comparisonTicket || choice !== choiceTicket || selected !== comparison.value) return;
        comparisonGraph = packet.snapshot.graph;
        readiness();
      } catch (e) {
        if (epoch === comparisonTicket) progress.textContent = e.message;
      }
    };
    reference.oninput = readiness;
    rank.onchange = readiness;
    countField.onchange = readiness;
    cancel.onclick = () => stop();
    run.onclick = async () => {
      if (worker || !boundGraph || window.atlasSharedCanvas.graph() !== boundGraph) return;
      const graph = boundGraph, digest = await researchGraphDigest(graph);
      if (worker || graph !== boundGraph || window.atlasSharedCanvas.graph() !== graph) return;
      if (digest !== boundDigest) {
        lastIdentity = "";
        await sync();
        return;
      }
      let input;
      try {
        input = checkInput(structuredClone(graph));
        preflightResearchCheck(input);
      } catch (e) {
        progress.textContent = e.message;
        return;
      }
      worker = new Worker(new URL("research-check-worker.js?v=research-checks-1", base));
      const active = worker;
      run.disabled = true;
      cancel.hidden = false;
      progress.textContent = "Starting bounded research check\u2026";
      timer = setTimeout(() => stop("Time budget reached. No partial result was saved."), RESEARCH_CHECK_LIMITS.milliseconds);
      let publishing = false;
      active.onmessage = async (event) => {
        if (worker !== active || publishing) return;
        const data = event.data;
        if (data.progress) {
          progress.textContent = data.progress.message;
          return;
        }
        if (data.error) {
          stop("Check failed: " + data.error);
          return;
        }
        if (data.result) {
          const result = data.result;
          if (result.version !== RESEARCH_CHECK_VERSION || result.kind !== input.kind || result.status !== "completed" || result.executed !== true || !Array.isArray(result.variants) || !Number.isFinite(Date.parse(result.createdAt)) || typeof result.inputFingerprint !== "string") {
            stop("Check result was withheld: worker protocol or version mismatch.");
            return;
          }
          publishing = true;
          progress.textContent = "Checking completed result identity\u2026";
          const currentDigest = await researchGraphDigest(graph);
          if (worker !== active) return;
          if (graph !== boundGraph || window.atlasSharedCanvas.graph() !== graph || currentDigest !== digest) {
            stop("Map changed. Completed result withheld.");
            return;
          }
          stop("Completed. Save current map to retain this app check, or download its results.");
          graph.researchCheckRuns = [...(graph.researchCheckRuns || []).filter((r) => r.graph_sha256 === digest).slice(-9), { graph_sha256: digest, result }];
          renderRuns(graph);
          readiness();
          window.atlasWorkspaceShell.refresh();
        }
      };
      active.onerror = (e) => stop("Check failed: " + e.message);
      active.postMessage(input);
    };
    window.ATLAS_RESEARCH_CHECKS = { sync() {
      if (!pending) pending = setTimeout(() => {
        pending = null;
        sync();
      }, 150);
    }, summary(graph) {
      return graph === boundGraph && entry ? { label: "Research checks", detail: "Matched retained map-level sensitivity checks. No per-cluster bootstrap rating." } : null;
    }, current: () => entry };
    window.addEventListener("atlas:project-opening", () => {
      projectEpoch++;
      projectSection.hidden = true;
    });
    for (const name of ["atlas:project-opened", "atlas:project-reports-ready"]) window.addEventListener(name, (event) => projectChecks(event.detail?.projectId));
    projectChecks(window.ATLAS_PROJECTS?.activeProject()?.id);
    for (const name of ["atlas:map-opened", "atlas:project-opening", "atlas:project-opened"]) window.addEventListener(name, () => {
      ticket++;
      choiceTicket++;
      comparisonTicket++;
      if (worker) stop("Map or project changed. The check was cancelled; no partial result was saved.");
      clearClusterMapChecks(document);
      resetTileContext();
      entry = null;
      boundDigest = null;
      lastIdentity = "";
      run.disabled = true;
      window.ATLAS_RESEARCH_CHECKS.sync();
    });
    window.ATLAS_RESEARCH_CHECKS.sync();
  }
})();
//# sourceMappingURL=research-checks.js.map

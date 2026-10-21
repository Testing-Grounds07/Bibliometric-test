(() => {
  // scripts/imported-theme-evidence.mjs
  var approved = /* @__PURE__ */ new WeakMap();
  var standaloneImport = (graph3) => !!graph3?.importedStandalone && graph3._backend === "independent-bnr-standalone";
  async function textDigest(value) {
    return [...new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  function strictSourceText(record3) {
    const title = typeof (record3.display_name ?? record3.title) === "string" ? record3.display_name ?? record3.title : "";
    let index = record3.abstract_inverted_index;
    if (typeof index === "string") {
      try {
        index = JSON.parse(index);
      } catch {
        return { title: title === record3.id ? "" : title, abstract: "", abstractStatus: "invalid_json_abstract_omitted" };
      }
    }
    const result = { title: title === record3.id ? "" : title, abstract: "", abstractStatus: "missing_abstract" };
    if (index == null) return result;
    if (typeof index !== "object" || Array.isArray(index)) return { ...result, abstractStatus: "invalid_abstract_omitted" };
    const words2 = /* @__PURE__ */ new Map();
    for (const [word, positions] of Object.entries(index)) {
      if (!word || !Array.isArray(positions) || !positions.length) return { ...result, abstractStatus: "invalid_abstract_omitted" };
      for (const position of positions) {
        if (!Number.isSafeInteger(position) || position < 0 || position > 2e5 || words2.has(position)) return { ...result, abstractStatus: "invalid_abstract_omitted" };
        words2.set(position, word);
      }
    }
    if (!words2.size) return result;
    for (let position = 0; position < words2.size; position++) if (!words2.has(position)) return { ...result, abstractStatus: "gapped_abstract_omitted" };
    return { ...result, abstract: [...words2].sort((a, b) => a[0] - b[0]).map(([, word]) => word).join(" "), abstractStatus: "retained_contiguous_abstract" };
  }
  async function importedTextInput(corpusId, articles) {
    if (typeof corpusId !== "string" || !Array.isArray(articles) || !articles.length || articles.length > 2e4) throw Error("Pinned source-text input is unavailable.");
    const seen = /* @__PURE__ */ new Set(), references = {};
    const documents = articles.map((record3) => {
      if (typeof record3?.id !== "string" || seen.has(record3.id)) throw Error("Pinned source IDs are missing or duplicated.");
      seen.add(record3.id);
      references[record3.id] = Array.isArray(record3.references) ? record3.references : Array.isArray(record3.referenced_works) ? record3.referenced_works : [];
      return { id: record3.id, ...strictSourceText(record3) };
    }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const sourceIds = documents.map((document2) => document2.id), textCoverage = { sources: documents.length, withTitle: documents.filter((d) => d.title).length, withAbstract: documents.filter((d) => d.abstract).length, omittedInvalidAbstracts: documents.filter((d) => d.abstractStatus.includes("omitted")).length, withoutText: documents.filter((d) => !d.title && !d.abstract).length };
    return { sourceCorpusId: corpusId, sourceIds, referenceIds: [], references, documents, importedSourceText: { schema_version: "bibliomap.imported-source-text.v1", sourceIds, textSha256: await textDigest(JSON.stringify(documents)), coverage: textCoverage, scope: "Exact retained source titles and contiguous available abstracts. Invalid or gapped abstracts omitted explicitly; no previous/reference-cache filling, no new retrieval. Current interpretative overlay; not approval by the retained study reviewers." } };
  }
  async function bindImportedThemes(graph3, data, packet) {
    approved.delete(graph3);
    if (!standaloneImport(graph3) || graph3.collaboration || graph3.temporalSelection || graph3.semantic && graph3.entityKind !== "source" || !packet || packet.corpusId !== graph3.sourceCorpusId || packet.evidence?.sourceCorpusId !== packet.corpusId || data?.sourceCorpusId !== packet.corpusId) throw Error("Keyword evidence does not match this saved source corpus.");
    const input = await importedTextInput(packet.corpusId, packet.evidence.articles), sourceIds = new Set(input.sourceIds);
    if (!Array.isArray(graph3.nodes) || graph3.nodes.some((node2) => !sourceIds.has(node2.id))) throw Error("Displayed nodes are not all members of the pinned source corpus.");
    const value = await validateImportedCache(data, input);
    approved.set(graph3, value);
    return value;
  }
  async function validateImportedCache(data, input) {
    const binding = data?.importedSourceText;
    if (!binding || data.sourceCorpusId !== input.sourceCorpusId || JSON.stringify(binding) !== JSON.stringify(input.importedSourceText) || binding.textSha256 !== await textDigest(JSON.stringify(input.documents))) throw Error("Keyword cache lacks the exact pinned source-text binding.");
    const expected = input.documents.filter((document2) => document2.title || document2.abstract), cached = data.documents;
    if (!cached || typeof cached !== "object" || Array.isArray(cached) || Object.keys(cached).length !== expected.length || !expected.length) throw Error("Keyword cache has missing, foreign or unavailable source text.");
    if (data.dimensions !== 384 || typeof data.model !== "string" || !/^[a-f0-9]{40,64}$/i.test(data.revision || "")) throw Error("Keyword model identity or dimensions are not pinned.");
    for (const document2 of expected) {
      const actual = cached[document2.id];
      if (!actual || actual.id !== document2.id || actual.title !== document2.title || actual.abstract !== document2.abstract || typeof actual.embedding !== "string" || atob(actual.embedding).length !== data.dimensions || !Array.isArray(actual.phrases)) throw Error("Keyword cache text or embeddings do not match the pinned sources.");
      for (const phrase of actual.phrases) {
        if (typeof phrase.text !== "string" || !phrase.text.trim() || phrase.text.length > 500 || !Number.isFinite(phrase.semantic) || !Number.isInteger(phrase.count) || phrase.count < 1 || !Array.isArray(phrase.evidence) || !phrase.evidence.length || phrase.evidence.length > 3) throw Error("Invalid keyword evidence.");
        for (const span of phrase.evidence) {
          const text = document2[span.field];
          if (!["title", "abstract"].includes(span.field) || !Number.isInteger(span.start) || !Number.isInteger(span.end) || span.start < 0 || span.end <= span.start || span.end > Array.from(text).length) throw Error("Keyword evidence has invalid source offsets.");
          if (Array.from(text).slice(span.start, span.end).join("").toLowerCase().replace(/\s+/g, " ") !== phrase.text.toLowerCase()) throw Error("Keyword phrase does not match its literal source span.");
        }
      }
    }
    return { schema_version: "bibliomap.imported-theme-binding.v1", corpusId: input.sourceCorpusId, textSha256: binding.textSha256, cacheProjectionSha256: await textDigest(JSON.stringify(data)) };
  }
  function importedThemeBinding(graph3) {
    return approved.get(graph3) || null;
  }
  function clearImportedThemes(graph3) {
    approved.delete(graph3);
  }

  // scripts/clustering-concepts.mjs
  var CLUSTERING_SCORES = [
    { value: "cpm", label: "CPM", algorithm: "leiden" },
    { value: "map-equation", label: "Map equation", algorithm: "infomap" },
    { value: "hypergraph-modularity", label: "Hypergraph modularity", algorithm: "hypergraph" },
    { value: "description-length", label: "Model description length", algorithm: "sbm" }
  ];
  function scoreForAlgorithm(algorithm3) {
    return CLUSTERING_SCORES.find((score) => score.algorithm === algorithm3) || CLUSTERING_SCORES[0];
  }
  function searchesForScore(score, { experimental = false } = {}) {
    if (score === "hypergraph-modularity") return [
      { value: "mixed", label: "Local moves \xB7 mixed starts" },
      { value: "leiden-seeded", label: "Local moves \xB7 Leiden starts" },
      ...experimental ? [
        { value: "group-moves", label: "Group moves \xB7 experimental" },
        { value: "annealing", label: "Annealing \xB7 experimental" }
      ] : []
    ];
    if (score === "map-equation") return [{ value: "infomap", label: "Infomap" }];
    if (score === "description-length") return [{ value: "sbm", label: "Nested SBM fitting" }];
    return [{ value: "leiden", label: "Leiden" }];
  }
  function clusteringConcepts(graph3 = {}) {
    if (graph3.clustering?.objective === "joint_CPM") return { algorithm: "leiden_joint_layers", score: "joint_CPM", scoreTitle: "Joint layer CPM", searchTitle: "Joint Leiden", clusterLabel: graph3.clustering.label, formula: "Sum of explicitly weighted layer CPM objectives plus declared same-ID coupling for adjacent temporal slices.", scoreSummary: "Membership is from the exact selected joint run. The displayed edges are one named layer; they are not the whole joint objective.", example: "A node can share a joint group despite different citation and text neighborhoods. Publication slices are retrospective cohorts, not historical citation snapshots.", searchSteps: ["Fit the declared layers and exact seeds with joint Leiden.", "Compare separate individual-layer fits in Methods."], searchSummary: "Requested finite iterations and seeds do not establish a global optimum.", tuning: "Resolutions, layer weights and temporal coupling are explicit modeling choices; no automatic parameter winner is selected.", validity: "Joint membership does not validate substantive themes, persistence, or causal claims. Independent scientific appraisal remains outstanding." };
    if (graph3._backend?.startsWith("independent-bnr") && graph3.clustering?.algorithm === "not_requested") return { algorithm: "not_requested", score: "not_requested", scoreTitle: "Not requested", searchTitle: "Not requested", clusterLabel: "Construction only \xB7 communities not requested", formula: "No community objective was fitted.", scoreSummary: "Connections retain the declared imported graph definition. Unassigned nodes may have observed connections.", example: "A linked source can be unassigned when community detection was not requested.", searchSteps: [], searchSummary: "No optimizer was executed for this result.", tuning: "A new explicitly requested analysis is required to fit communities.", validity: "Construction checks do not establish themes or scientific expert approval." };
    if (graph3.trial) {
      const definition = graph3.trial.result.definition;
      return { algorithm: "trial", score: graph3.trial.result.family, scoreTitle: definition.score, searchTitle: definition.search, clusterLabel: definition.name, formula: definition.score, scoreSummary: definition.help, example: "Whole supported combinations provide the evidence. Pair lines remain citation evidence, not this method\u2019s score.", searchSteps: [definition.search], searchSummary: graph3.trial.result.limitations, tuning: "Trial parameters are explicit. Reliability reruns this same method; Auto CPM and automatic trial settings selection are not implemented.", validity: "Numerical convergence, structural reliability and AI thematic suggestions are separate checks." };
    }
    const algorithm3 = ["infomap", "hypergraph", "sbm"].includes(graph3.clustering?.algorithm) ? graph3.clustering.algorithm : "leiden";
    const score = scoreForAlgorithm(algorithm3), incidence = graph3.networkModel === "hypergraph" && graph3.clustering?.modelVersion === "incidence-v1";
    const strategy = searchesForScore("hypergraph-modularity", { experimental: true }).some((search) => search.value === graph3.clustering?.hypergraphSearch) ? graph3.clustering.hypergraphSearch : "mixed";
    const coupling2 = graph3.canvasKind === "coupling" || graph3.method === "coupling";
    const common = {
      algorithm: algorithm3,
      score: score.value,
      scoreTitle: score.label,
      incidence,
      search: algorithm3 === "hypergraph" ? strategy : algorithm3,
      tuning: "Auto compares settings, repeated starts and resampled evidence. This is outside the search that fits one setting. No stable range means no clear recommendation\u2014not a forced winner.",
      validity: "A high score is not stability, article quality, or thematic validity. Reliability reruns the same score and search on changed evidence."
    };
    if (graph3.collaboration) return { ...common, searchTitle: "Leiden", clusterLabel: "Collaboration CPM / Leiden", formula: "Reward within-group projected connections minus a resolution-dependent group-size cost.", scoreSummary: "CPM uses explicit " + graph3.counting + " work\u2013actor projections; raw support separately counts distinct source works.", example: "Full and fractional pair weights encode different assumptions. Fixed numeric CPM across them measures construction-plus-scale sensitivity.", searchSteps: ["Retain unique stable actors within each source work under declared publication/affiliation policies.", "Construct explicit pair weights from observed work-specific authorships or affiliations.", "Run three seeded Leiden CPM starts and retain the best fixed-definition fit."], searchSummary: "Detected groups are not verified social relationships or research themes.", tuning: "Use Collaboration for actor kind, counting, recorded ancestry rollup, publication/team/affiliation alternatives and explicit human-audited identity scenarios. Citation Auto CPM does not apply.", validity: "Metadata missingness and identity disambiguation remain research limitations. No collaboration statistical null is implemented." };
    if (graph3.semantic) return { ...common, searchTitle: "Leiden", clusterLabel: "Semantic CPM / Leiden", formula: "Reward within-group connections minus a resolution-dependent group-size cost.", scoreSummary: "CPM uses this explicit " + graph3.normalization + " semantic network, not citation overlap. Weights are scaled by their analytical mean before fitting.", example: "Terms, classifier topics and source-text similarity are different observed relationships. The same numeric CPM need not mean the same grouping scale across them.", searchSteps: ["Construct the selected semantic connections from pinned text or classifier evidence.", "Run three seeded Leiden starts at this CPM.", "Keep the highest-scoring partition at this fixed definition."], searchSummary: "Leiden searches CPM; no global optimum or meaningful-theme guarantee is claimed.", tuning: "Use Semantic maps to change text, vocabulary, classifier confidence, cosine or CPM. The semantic sensitivity check varies bounded definitions; citation bootstrap and citation Auto CPM do not apply.", validity: "Text/threshold sensitivity, optimizer completion and AI thematic suggestions are different checks. No semantic statistical null is implemented." };
    if (algorithm3 === "hypergraph") return {
      ...common,
      searchTitle: searchesForScore("hypergraph-modularity", { experimental: true }).find((search) => search.value === strategy).label,
      clusterLabel: (coupling2 ? "Coupling \xB7 " : "") + "Hypergraph modularity / " + (strategy === "group-moves" ? "group moves" : strategy === "annealing" ? "annealing" : "local moves"),
      formula: "Score = observed togetherness \u2212 resolution \xD7 expected togetherness (both weighted and normalized).",
      scoreSummary: "Score whole combinations, not the pairwise lines. Reward members staying together beyond a degree-based random-mixing baseline. The resolution multiplier controls the baseline penalty; 1 preserves the original objective.",
      example: "With linear-majority scoring, 3 of 4 members together earns 0.75 before subtracting the baseline; 2 of 4 earns 0; all 4 earns 1. Majority, quadratic and strict are different scoring definitions, not search algorithms.",
      searchSteps: [
        strategy === "leiden-seeded" ? "Make ten starting guesses with Leiden on a temporary pair projection. These are seeds, not the final scoring network." : "Make ten starting guesses: three Leiden-generated guesses, connected components, singletons, and five seeded combination assignments.",
        "For each guess, first try article moves that improve the direct whole-combination score, for at most 20 passes.",
        strategy === "group-moves" ? "Try merging entire neighboring groups when the same score improves, then let individual articles readjust. Repeat for at most four rounds." : strategy === "annealing" ? "Explore twelve cooling sweeps. Early exploration can accept temporary score losses; cooling becomes less permissive. Keep the best partition encountered, then finish with greedy article moves." : "Repeat article moves until no improvement is found or the 20-pass limit is reached.",
        "Keep the highest-scoring result across the starts. A pass limit is reported; no global optimum or Leiden-style refinement guarantee is claimed."
      ],
      searchSummary: strategy === "group-moves" ? "Experimental custom group-move search: move whole groups as well as articles, evaluated on the unchanged hypergraph score. Not the published h-Louvain method, which additionally blends objectives and tunes its schedule." : strategy === "annealing" ? "Experimental simulated annealing: accept some temporary setbacks to explore beyond a local solution. Twelve fixed cooling sweeps per start, retaining the best result; this is not evidence of convergence or stability." : "Both local-move choices are multi-start direct local search. Leiden starts changes initialization only; native Leiden optimization of this hypergraph score is not implemented."
    };
    if (algorithm3 === "infomap") return {
      ...common,
      searchTitle: "Infomap",
      clusterLabel: (coupling2 ? "Coupling \xB7 " : "") + "Map equation / Infomap",
      formula: "Prefer a shorter description of modeled movement.",
      scoreSummary: incidence ? "The map equation encodes movement through article and combination-helper nodes. Both kinds of visits count; returning to the same article is allowed." : "The map equation scores how compactly movement along weighted article connections can be described.",
      example: "Short local addresses help when movement stays in a neighborhood. Markov time changes the scale; higher values tend to favor broader groups.",
      searchSteps: ["Infomap tries and reorganizes memberships to shorten the description of movement.", "Run ten optimization trials at the selected Markov time.", "Keep the shortest description at that same setting."],
      searchSummary: "Infomap searches its map-equation objective. It is not CPM or a direct hypergraph-modularity optimizer."
    };
    if (algorithm3 === "sbm") return { ...common, searchTitle: "Nested SBM fitting", clusterLabel: (coupling2 ? "Coupling \xB7 " : "") + "Description length / nested SBM", formula: "Prefer a shorter description of the network and its model.", scoreSummary: "Description length balances how well a nested block model explains the observed network against model complexity.", example: "A more complicated hierarchy must earn its extra complexity. Hierarchy levels are not CPM resolutions.", searchSteps: ["Fit a degree-corrected nested block model from three seeded starts.", "Keep the fitted hierarchy with the shortest description.", "Choose a hierarchy level to inspect."], searchSummary: "The fitted hierarchy is selected by description length; stability requires a separate evidence check." };
    return {
      ...common,
      searchTitle: "Leiden",
      clusterLabel: (coupling2 ? "Coupling \xB7 " : "") + (incidence ? "Bipartite CPM / Leiden" : "CPM / Leiden"),
      formula: "Reward within-group connections, minus a resolution-dependent group-size cost.",
      scoreSummary: incidence ? "Bipartite CPM scores article\u2013combination incidence, with a cross-class size penalty and zero within-class penalties." : "CPM rewards within-group connections while penalizing overly loose groups at the selected resolution.",
      example: "The CPM setting changes how fine a division is favored. It is the scoring rule\u2014not Leiden itself.",
      searchSteps: ["Leiden tests article-membership moves that improve CPM.", "Refine groups, regroup temporary units, and repeat.", "Run ten seeded starts and keep the highest CPM quality at this setting."],
      searchSummary: "Leiden is the search; CPM is the score. Multi-start repeats that search. Stability asks whether the result survives changes to the evidence."
    };
  }
  function clusterResultHeading(graph3, previous = false) {
    if (graph3._backend?.startsWith("independent-bnr") && graph3.clustering?.algorithm === "not_requested") return (previous ? "Previous result \xB7 " : "") + "Construction only \xB7 unassigned sources";
    return (previous ? "Previous result \xB7 " : "") + clusteringConcepts(graph3).clusterLabel + " clusters";
  }
  function validationSummary(reliability = {}, settings = {}) {
    if (reliability.validationMode === "collaboration" || settings.validationMode === "collaboration") return { label: reliability.validationStatus === "completed" ? "Construction checked" : "Construction not checked", detail: "Collaboration counting/team/affiliation alternatives are not citation bootstrap, significance or validated social communities." };
    if (reliability.validationMode === "semantic" || settings.validationMode === "semantic") return { label: reliability.validationStatus === "completed" ? "Text sensitivity checked" : reliability.validationStatus === "partial" ? "Text sensitivity partial" : reliability.validationStatus === "unavailable" ? "Text check unavailable" : "Text sensitivity not checked", detail: "Citation bootstrap and citation nulls are not applicable. Semantic text/threshold checks do not validate themes or establish significance." };
    const detail = [reliability.validationStatus, settings.validationStatus, settings.validationOutcome].filter(Boolean).join(" \xB7 ");
    if (reliability.validationState === "pending") return { label: "Waiting for map", detail };
    if (settings.validationRunning === "true") return { label: "Finding settings\u2026", detail };
    if (reliability.validationState === "running") return { label: "Checking evidence\u2026", detail };
    const outcome = reliability.validationOutcome;
    if (outcome) return { label: (outcome.includes("No linked") ? "No linked groups" : outcome.includes("hold together") ? "Holds together" : outcome.includes("exploratory") ? "Changes" : "Sensitive") + (reliability.preliminary === "true" ? " \xB7 preliminary" : ""), detail: outcome + " \xB7 " + detail };
    if (settings.validationOutcome) return { label: settings.validationOutcome, detail };
    if (/No completed/.test(detail)) return { label: "Check failed \xB7 retry", detail };
    if (/Cancelled/.test(detail)) return { label: "Stopped \xB7 rerun", detail };
    if (settings.validationPhase === "queued") return { label: "Settings queued", detail };
    return { label: "Not checked", detail: detail || "Run a quick or full evidence check." };
  }
  if (typeof window !== "undefined") window.ATLAS_CLUSTERING_CONCEPTS = { scores: CLUSTERING_SCORES, scoreForAlgorithm, searchesForScore, describe: clusteringConcepts, heading: clusterResultHeading, validationSummary };

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

  // scripts/evidence-metrics.mjs
  function connectionRoles(graph3) {
    const nodes = new Map(graph3.nodes.map((node2) => [node2.id, node2]));
    const roles = Object.fromEntries(graph3.nodes.map((node2) => [node2.id, { degree: 0, strength: 0, internalStrength: 0, externalStrength: 0, connections: {} }]));
    for (const edge of graph3.links) {
      if (!(edge.strength > 0) || !nodes.has(edge.source) || !nodes.has(edge.target)) continue;
      for (const [id, other] of [[edge.source, edge.target], [edge.target, edge.source]]) {
        const role = roles[id], cluster = nodes.get(other).cluster || 0;
        role.degree++;
        role.strength += edge.strength;
        role.connections[cluster] = (role.connections[cluster] || 0) + edge.strength;
        if (cluster === nodes.get(id).cluster) role.internalStrength += edge.strength;
        else role.externalStrength += edge.strength;
      }
    }
    const groups = /* @__PURE__ */ new Map();
    for (const node2 of graph3.nodes) {
      if (!groups.has(node2.cluster)) groups.set(node2.cluster, []);
      groups.get(node2.cluster).push(roles[node2.id].internalStrength);
    }
    for (const node2 of graph3.nodes) {
      const role = roles[node2.id], values = groups.get(node2.cluster), mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      const deviation = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
      role.participation = role.strength ? Math.max(0, 1 - Object.values(role.connections).reduce((sum, value) => sum + (value / role.strength) ** 2, 0)) : null;
      role.externalShare = role.strength ? role.externalStrength / role.strength : null;
      role.withinClusterZ = deviation ? (role.internalStrength - mean) / deviation : null;
      role.connectedClusters = Object.keys(role.connections).map(Number).filter((cluster) => cluster > 0 && cluster !== node2.cluster);
      role.label = !role.degree ? "No eligible connections" : role.connectedClusters.length >= 2 && role.participation >= 0.3 ? "Cross-cluster connector" : role.externalStrength > 0 ? "Some cross-cluster connections" : "Within-cluster only";
      role.partitionAssessed = graph3.clustering?.algorithm !== "not_requested" && Number(node2.cluster) > 0;
      if (!role.partitionAssessed) {
        role.participation = null;
        role.externalShare = null;
        role.withinClusterZ = null;
        role.internalStrength = null;
        role.externalStrength = null;
        role.connectedClusters = [];
        role.label = "Community-relative role not assessed";
      }
    }
    return roles;
  }
  function sourcesForCluster(articles, graph3, cluster) {
    if (cluster == null) return articles;
    const sources = new Set(graph3.nodes.filter((node2) => node2.cluster === cluster).flatMap((node2) => node2.articles || []));
    return articles.filter((article) => sources.has(article.id));
  }
  function clusterRecovery(original, sampled) {
    const base = /* @__PURE__ */ new Map(), next = /* @__PURE__ */ new Map();
    for (const [id, cluster] of Object.entries(original)) if (+cluster > 0) {
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

  // scripts/scientific-invalidation.mjs
  function invalidateScientificOutputs(graph3) {
    if (graph3.scientificManifest && !graph3.evidenceProvenance) {
      const manifest = graph3.scientificManifest;
      graph3.evidenceProvenance = { evidenceId: manifest.evidence?.id || null, retrievedAt: manifest.evidence?.retrievedAt || null, retrieval: manifest.evidence?.retrieval || null, completeness: manifest.evidence?.completeness, versions: manifest.versions, textVersions: manifest.dependencies?.textVersions };
    }
    delete graph3.scienceAudit;
    delete graph3.collaborationSensitivity;
    delete graph3.temporalSeries;
    delete graph3.temporalSelection;
    delete graph3.burstReport;
    delete graph3.scientificManifest;
    return graph3;
  }

  // scripts/network-extensions.mjs
  var edgeKey = (edge) => JSON.stringify([edge.source, edge.target].sort());
  function clusterTransitions(first, second) {
    const earlier = new Map(first.nodes.map((node2) => [node2.id, node2.cluster])), counts = /* @__PURE__ */ new Map();
    for (const node2 of second.nodes) if (earlier.get(node2.id) > 0 && node2.cluster > 0) {
      const key = JSON.stringify([earlier.get(node2.id), node2.cluster]);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts].map(([key, count]) => ({ from: JSON.parse(key)[0], to: JSON.parse(key)[1], count })).sort((left, right) => right.count - left.count);
  }

  // scripts/community-loader.mjs
  function createCommunityLoader(host, document2, timeoutMs = 6e4) {
    let pending2;
    const ready = () => typeof host.ATLAS_COMMUNITIES?.start === "function" && typeof host.ATLAS_COMMUNITIES?.startReliability === "function";
    const attempt = (retry) => new Promise((resolve, reject) => {
      const script = document2.createElement("script");
      const timer = setTimeout(() => finish(new Error("Loading timed out.")), timeoutMs);
      const finish = (error) => {
        clearTimeout(timer);
        script.onload = null;
        script.onerror = null;
        script.remove();
        if (error) reject(error);
        else resolve(host.ATLAS_COMMUNITIES);
      };
      script.src = "./community-methods.js?v=coupling-errors-2" + (retry ? "&retry=" + Date.now() : "");
      script.async = true;
      script.onload = () => finish(ready() ? null : new Error("The analysis engine did not initialize."));
      script.onerror = () => finish(new Error("The analysis engine could not be downloaded."));
      document2.head.append(script);
    });
    return function loadCommunities2() {
      if (ready()) return Promise.resolve(host.ATLAS_COMMUNITIES);
      if (!pending2) pending2 = attempt(false).catch(() => attempt(true)).catch(() => {
        throw new Error("Could not load the analysis engine after two attempts. Check your connection, then run the check again.");
      }).finally(() => {
        pending2 = null;
      });
      return pending2;
    };
  }
  var loadCommunities = typeof window === "undefined" ? null : createCommunityLoader(window, document);

  // scripts/canvas-extensions.mjs
  var records = /* @__PURE__ */ new WeakMap();
  var graph;
  var panel;
  var job;
  var generation = 0;
  var element = (tag, text = "") => {
    const node2 = document.createElement(tag);
    node2.textContent = text;
    return node2;
  };
  var button = (text, action3) => {
    const node2 = element("button", text);
    node2.type = "button";
    node2.className = "secondary";
    node2.onclick = action3;
    return node2;
  };
  var actionRow = (...nodes) => {
    const row = element("div");
    row.className = "reliability-controls";
    row.append(...nodes);
    return row;
  };
  var description = (parent, text) => parent.append(element("p", text));
  var algorithm = (current) => ["infomap", "hypergraph", "sbm"].includes(current.clustering?.algorithm) ? current.clustering.algorithm : "leiden";
  function cancel() {
    generation++;
    job?.cancel();
    job = null;
    if (graph && records.has(graph)) {
      records.get(graph).running = false;
      draw();
    }
  }
  function workerTask(kind, current, options) {
    if (window.BIBLIOMAP?.active) return window.BIBLIOMAP.stage(current, kind === "partition" ? "clustering" : kind, options);
    const worker2 = new Worker("network-extensions-worker.js?v=coupling-errors-2");
    let rejectJob;
    const promise = new Promise((resolve, reject) => {
      rejectJob = reject;
      worker2.onmessage = (event) => {
        worker2.terminate();
        Object.hasOwn(event.data, "error") ? reject(new Error(analysisErrorMessage(event.data.error))) : resolve(event.data.result);
      };
      worker2.onerror = (event) => {
        worker2.terminate();
        reject(new Error(analysisErrorMessage(event)));
      };
      worker2.postMessage({ kind, graph: current, options, articles: Object.values(window.ATLAS_DATA.articles) });
    });
    return { promise, cancel() {
      worker2.terminate();
      rejectJob(new Error("Analysis cancelled"));
    } };
  }
  async function run(kind, options) {
    if (graph?.semantic || graph?.collaboration || graph?.temporalSelection) return;
    const current = graph, record3 = records.get(current);
    cancel();
    window.ATLAS_EVIDENCE.cancelCanvasReliability();
    const ticket = ++generation;
    record3.running = true;
    record3.status = kind === "temporal" ? "Building this publication period\u2026" : "Checking the full analytical network\u2026";
    draw();
    try {
      job = workerTask(kind, structuredClone(current), options);
      let result = await job.promise;
      if (ticket !== generation) return;
      if (kind === "temporal") {
        const selected = algorithm(current);
        if (selected !== "leiden" || result.networkModel === "hypergraph") {
          await loadCommunities();
          if (ticket !== generation) return;
          job = window.ATLAS_COMMUNITIES.start(result, selected, [], (message) => {
            if (ticket === generation) {
              record3.status = message;
              draw();
            }
          }, { ...current.clustering, networkModel: result.networkModel });
          result = await job.promise;
          if (ticket !== generation) return;
        }
        const previous = record3.periods.at(-1);
        result.temporal.transitions = previous ? clusterTransitions(previous, result) : [];
        result.appliedSettings = { settings: { label: options.from + "\u2013" + options.to + " \xB7 source publication period" } };
        result.extensionAudit = { kind: "temporal", ...result.temporal };
        record3.periods.push(result);
        record3.status = "Period ready: " + result.temporal.sourceCount + " sources, " + result.stats.clusters + " groups. Choose Show period to view it.";
      } else {
        record3[kind] = result;
        current.extensionResults = { ...current.extensionResults, [kind]: result };
        record3.status = result.retained + " of " + current.links.length + " analytical lines retained. Show on map applies a display filter.";
      }
    } catch (error) {
      if (ticket === generation) record3.status = analysisErrorMessage(error);
    } finally {
      if (ticket === generation) {
        record3.running = false;
        job = null;
        draw();
      }
    }
  }
  function showPeriod(next, replace = false) {
    const parent = graph, record3 = records.get(parent), snapshot = window.atlasSharedCanvas.capture();
    const navigation = replace ? { restore: record3.restore, parent: record3.parent } : { restore: () => window.atlasSharedCanvas.restore(snapshot), parent };
    records.set(next, { periods: [], status: "", running: false, ...next.extensionResults, ...navigation });
    window.atlasSharedCanvas.applyAnalysis(next);
    const actual = window.atlasSharedCanvas.graph();
    if (actual !== next) records.set(actual, records.get(next));
    if (graph !== actual) sync(actual);
    else draw();
    record3.status = "";
  }
  function numberField(parent, label, value, minimum, maximum, step = 1) {
    const wrap = element("label", label), input = element("input");
    input.type = "number";
    input.value = value;
    input.min = minimum;
    input.max = maximum;
    input.step = step;
    input.setAttribute("aria-label", label);
    wrap.append(input);
    parent.append(wrap);
    return input;
  }
  function changeMethod() {
    if (!graph?.temporal) return false;
    const selected = document.getElementById("clusteringMethod").value, current = graph, record3 = records.get(current);
    cancel();
    window.ATLAS_EVIDENCE.cancelCanvasReliability();
    const ticket = ++generation;
    record3.running = true;
    record3.status = "Reclustering this publication period\u2026";
    draw();
    (async () => {
      try {
        job = workerTask("partition", structuredClone({ ...current, networkModel: document.getElementById("networkModel").value }), {});
        let next = await job.promise;
        if (ticket !== generation) return;
        if (selected !== "leiden" || next.networkModel === "hypergraph") {
          await loadCommunities();
          if (ticket !== generation) return;
          job = window.ATLAS_COMMUNITIES.start(next, selected, [], (message) => {
            if (ticket === generation) {
              record3.status = message;
              draw();
            }
          }, { ...current.clustering, hypergraphSearch: selected === "hypergraph" ? document.getElementById("clusteringSearch")?.value || "mixed" : void 0, networkModel: next.networkModel });
          next = await job.promise;
          if (ticket !== generation) return;
        }
        next.reliability = null;
        next.settingsSearch = null;
        next.themeDescriptions = null;
        next.appliedSettings = { settings: { label: next.temporal.from + "\u2013" + next.temporal.to + " \xB7 source publication period" } };
        record3.running = false;
        showPeriod(next, true);
      } catch (error) {
        if (ticket === generation) record3.status = analysisErrorMessage(error);
      } finally {
        if (ticket === generation) {
          record3.running = false;
          job = null;
          draw();
        }
      }
    })();
    return true;
  }
  function draw() {
    if (!panel || !graph) return;
    if (graph.temporalSelection) {
      panel.replaceChildren(element("summary", "Completed temporal window"), element("p", "Return to the full pinned map for new calculations. Switching completed windows only redraws saved results."));
      return;
    }
    if (graph.collaboration) {
      panel.replaceChildren(element("summary", "Collaboration checks"), element("p", "Use Collaboration maps for counting, team-size, affiliation and audited identity sensitivity. Citation significance and citation resampling do not apply."));
      return;
    }
    if (graph.semantic) {
      panel.replaceChildren(element("summary", "Semantic checks"), element("p", "Citation-overlap significance, citation resampling and citation temporal projections do not apply here. Use the semantic text/threshold sensitivity controls."));
      return;
    }
    if (graph.trial) {
      panel.replaceChildren(element("summary", "Trial method & limitations"), element("p", graph.trial.result.limitations), element("p", "Temporal reclustering, automatic settings searches and subcluster recomputation are not supported for these experimental methods. Use the main workspace for those analyses."));
      return;
    }
    const record3 = records.get(graph), open2 = new Set([...panel.querySelectorAll("details[open]")].map((node2) => node2.dataset.kind));
    panel.replaceChildren(element("summary", "Additional analyses" + (graph.extensionFilter ? " \xB7 line filter active" : graph.temporal ? " \xB7 " + graph.temporal.from + "\u2013" + graph.temporal.to : "")));
    const status = element("p", record3.status);
    status.setAttribute("role", "status");
    panel.append(status);
    if (record3.running) panel.append(button("Cancel analysis", cancel));
    if (record3.restore) panel.append(button("Return to parent map", record3.restore));
    for (const [kind, title, explanation] of [
      ["validation", "Unusual connections", "Tests whether pair overlap is unusually large among sources or references of equal degree. The threshold includes correction for multiple comparisons."],
      ["backbone", "Network backbone", "Keeps connections that carry a substantial share of either endpoint\u2019s analytical weight."],
      ["temporal", "Research over time", "Build a publication-year window and compare cluster membership across periods. Co-citation windows use pairwise evidence on the fixed parent reference scope."]
    ]) {
      const details = element("details");
      details.dataset.kind = kind;
      details.open = open2.has(kind);
      details.append(element("summary", title));
      description(details, explanation);
      const controls = element("div");
      controls.className = "extension-fields";
      if (kind === "temporal") {
        const years = Object.values(window.ATLAS_DATA.articles).map((article) => article.year).filter(Number.isInteger);
        const from = numberField(controls, "From year", record3.from ?? Math.max(Math.min(...years), 2015), Math.min(...years), Math.max(...years));
        const to = numberField(controls, "Through year", record3.to ?? Math.max(...years), Math.min(...years), Math.max(...years));
        from.oninput = () => {
          record3.from = +from.value;
        };
        to.oninput = () => {
          record3.to = +to.value;
        };
        const build = button("Build period", () => run(kind, { from: +from.value, to: +to.value }));
        build.disabled = record3.running;
        details.append(controls, build);
        for (const period of record3.periods) {
          const row = element("section");
          description(row, period.temporal.from + "\u2013" + period.temporal.to + " \xB7 " + period.temporal.sourceCount + " sources \xB7 " + period.stats.clusters + " groups");
          row.append(button("Show " + period.temporal.from + "\u2013" + period.temporal.to, () => showPeriod(period)));
          if (period.temporal.transitions.length) {
            const transitions = element("details");
            transitions.append(element("summary", "Shared members with previous period"));
            for (const item of period.temporal.transitions.slice(0, 30)) description(transitions, "Previous group " + item.from + " \u2192 this group " + item.to + ": " + item.count + " shared articles");
            description(transitions, "Group numbers are local to each period. Overlap describes membership continuity; different source cohorts can have no shared nodes. Full overlap counts are included in export.");
            row.append(transitions);
          }
          details.append(row);
        }
      } else {
        const alpha = numberField(controls, kind === "validation" ? "Adjusted significance threshold" : "Local weight threshold", record3[kind + "Alpha"] ?? 0.05, 1e-3, 0.5, 0.01);
        alpha.oninput = () => {
          record3[kind + "Alpha"] = +alpha.value;
        };
        const calculate = button(record3[kind] ? "Rerun check" : "Check connections", () => run(kind, { alpha: +alpha.value }));
        calculate.disabled = record3.running;
        details.append(controls, calculate);
        if (record3[kind]) {
          const result = record3[kind];
          description(details, result.retained + " / " + graph.links.length + " lines retained at " + result.alpha + ".");
          details.append(actionRow(button("Show on map", () => {
            graph.extensionFilter = { kind, alpha: result.alpha, keys: result.records.filter((item) => item.retained).map((item) => item.key) };
            window.atlasSharedCanvas.redraw();
            draw();
          }), button("Clear line filter", () => {
            delete graph.extensionFilter;
            window.atlasSharedCanvas.redraw();
            draw();
          })));
          description(details, "The existing Lines and cluster display filters also apply. Memberships and reliability use the full analytical network.");
          const notes = element("details");
          notes.append(element("summary", "Method & interpretation"));
          description(notes, result.method);
          description(notes, result.limitation);
          details.append(notes);
        }
      }
      panel.append(details);
    }
    if (graph.clustering?.algorithm === "sbm") {
      const section = element("section"), label = element("label", "Hierarchy level"), select = element("select");
      select.setAttribute("aria-label", "Hierarchy level");
      for (const level of graph.clustering.hierarchy || []) {
        const option = element("option", "Level " + (level.level + 1) + " \xB7 " + level.clusters + " groups");
        option.value = level.level;
        select.append(option);
      }
      select.value = graph.clustering.selectedLevel || 0;
      select.disabled = !graph.clustering.hierarchy?.length;
      select.onchange = () => {
        const level = graph.clustering.hierarchy[+select.value], next = invalidateScientificOutputs(structuredClone(graph));
        for (const node2 of next.nodes) node2.cluster = level.memberships[node2.id] || 0;
        next.clustering.selectedLevel = level.level;
        next.stats.clusters = level.clusters;
        next.reliability = null;
        next.appliedSettings = { settings: { label: "Block-model hierarchy \xB7 level " + (level.level + 1) } };
        showPeriod(next, true);
      };
      label.append(select);
      section.append(label);
      const modelHelp = element("details");
      modelHelp.append(element("summary", "How block models work"));
      description(modelHelp, graph.clustering.objective + ". " + graph.clustering.limitations);
      section.append(modelHelp);
      panel.insertBefore(section, panel.querySelector("details"));
    }
    panel.append(button("Export additional analyses", () => {
      const output = { createdAt: (/* @__PURE__ */ new Date()).toISOString(), sourceCorpusId: window.ATLAS_DATA.summary.corpus_id, analysis: { id: graph.analysisId, derivedFrom: graph.derivedFromAnalysisId, scope: graph.threshold, method: graph.clustering, order: graph.order, temporal: graph.temporal, nodes: graph.nodes.map((node2) => node2.id) }, validation: record3.validation, backbone: record3.backbone, displayFilter: graph.extensionFilter || null, periods: record3.periods };
      const url = URL.createObjectURL(new Blob([JSON.stringify(output)], { type: "application/json" })), link = element("a");
      link.href = url;
      link.download = "bibliomap-additional-analyses.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1e3);
    }));
  }
  function sync(next) {
    window.ATLAS_DESCRIPTIONS?.sync(next);
    if (next === graph) return;
    cancel();
    graph = next;
    if (!records.has(next)) records.set(next, { periods: [], status: "", running: false, ...next.extensionResults });
    if (!panel) {
      panel = element("details");
      panel.id = "canvasExtensions";
      panel.className = "canvas-reliability";
      document.getElementById("mapCaption").after(panel);
    }
    draw();
  }
  var filters = /* @__PURE__ */ new WeakMap();
  window.ATLAS_EXTENSIONS = { sync, cancel, changeMethod, accepts(current, edge) {
    if (!current.extensionFilter) return true;
    if (!filters.has(current.extensionFilter)) filters.set(current.extensionFilter, new Set(current.extensionFilter.keys));
    return filters.get(current.extensionFilter).has(edgeKey(edge));
  }, describeEdge(parent, edge, current) {
    const record3 = records.get(current), key = edgeKey(edge);
    const validation = record3?.validation?.records.find((item) => item.key === key);
    if (validation) description(parent, "Degree-stratified pair overlap: " + validation.overlap + " \xB7 adjusted p = " + validation.adjustedP.toPrecision(4) + ". " + (validation.retained ? "Passes" : "Does not pass") + " the selected multiple-comparison threshold. This tests the pair, not a whole higher-order combination.");
    const backbone = record3?.backbone?.records.find((item) => item.key === key);
    if (backbone) description(parent, "Backbone: " + (backbone.retained ? "retained" : "filtered") + " at local threshold " + record3.backbone.alpha + ".");
  } };

  // scripts/cluster-description-core.mjs
  function descriptionRequest(graph3, cluster, corpusId) {
    if (graph3.temporalSelection) throw Error("Completed temporal windows are read-only; no article-description request is created.");
    if (graph3.collaboration || graph3.semantic && graph3.entityKind !== "source") throw new Error("Feature nodes cannot be submitted as article-description evidence.");
    const binding = standaloneImport(graph3) ? importedThemeBinding(graph3) : null;
    if (standaloneImport(graph3) && !binding) throw Error("Load and verify this imported map\u2019s pinned source keywords before naming.");
    return { ...binding ? { importedTextBinding: binding } : {}, kind: graph3.canvasKind === "coupling" || graph3.semantic && graph3.entityKind === "source" ? "coupling" : "cocitation", corpusId, cluster: String(cluster), nodes: graph3.nodes.filter((node2) => node2.cluster > 0).map((node2) => ({ id: node2.id, cluster: String(node2.cluster) })).sort((left, right) => left.id.localeCompare(right.id)) };
  }

  // scripts/description-queue.mjs
  function createDescriptionQueue(execute, changed = () => {
  }) {
    const records4 = /* @__PURE__ */ new Map();
    let scope2 = "", entries = [], active2 = null, draining = false;
    const notify = () => changed(entries);
    async function drain() {
      if (draining) return;
      draining = true;
      try {
        while (true) {
          const record3 = entries.find((record4) => record4.status === "idle");
          if (!record3) break;
          const controller = new AbortController(), startedScope = scope2;
          active2 = { record: record3, controller };
          record3.status = "running";
          record3.error = "";
          notify();
          try {
            const result = await execute(record3.request, record3.regenerate || false, controller.signal);
            if (!controller.signal.aborted && scope2 === startedScope) {
              record3.result = result;
              record3.status = "done";
              record3.regenerate = false;
            }
          } catch (error) {
            if (!controller.signal.aborted) {
              record3.status = "error";
              record3.error = error.message;
            }
          } finally {
            if (record3.status === "running") record3.status = "idle";
            active2 = null;
            notify();
          }
        }
      } finally {
        draining = false;
      }
    }
    return {
      seed(request, result) {
        const key = JSON.stringify(request);
        if (!records4.has(key)) records4.set(key, { key, request, status: "done", result });
      },
      activate(key, requests) {
        if (scope2 !== key) {
          active2?.controller.abort();
          scope2 = key;
          entries = requests.map((request) => {
            const requestKey = JSON.stringify(request);
            if (!records4.has(requestKey)) records4.set(requestKey, { key: requestKey, request, status: "idle", result: null });
            return records4.get(requestKey);
          });
        }
        void drain();
        return entries;
      },
      stop() {
        scope2 = "";
        entries = [];
        active2?.controller.abort();
      },
      prioritize(record3) {
        if (record3.status === "idle") {
          entries = [record3, ...entries.filter((item) => item !== record3)];
          void drain();
        }
      },
      retry(record3, regenerate = false) {
        if (record3.status === "running") return;
        record3.status = "idle";
        record3.regenerate = regenerate;
        record3.error = "";
        this.prioritize(record3);
      },
      cancel(record3) {
        record3.status = "cancelled";
        record3.error = "Cancelled. Keywords and any previous description remain available.";
        if (active2?.record === record3) active2.controller.abort();
        notify();
      },
      entries: () => entries,
      lookup: (request) => records4.get(JSON.stringify(request)) || null
    };
  }

  // scripts/label-case.mjs
  var minorWords = new Set("a an and as at but by for if in nor of on or per the to up via vs yet".split(" "));
  var preferredCase = new Map(["AI", "ML", "NLP", "LLM", "SLM", "CPM", "SEM", "PLS", "PLS-SEM", "CB-SEM", "TF-IDF", "c-TF-IDF", "HIV", "COVID", "COVID-19", "OECD", "HRM", "PRISMA", "MiniLM", "KeyBERT", "BERTopic", "OpenAlex", "Neo4j"].map((word) => [word.toLowerCase(), word]));
  var words = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*(?:[-‑][\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*)*/gu;
  function titleCase(value) {
    return String(value ?? "").split(/([·:;!?/])/u).map((segment) => {
      const matches = [...segment.matchAll(words)], allCaps = segment === segment.toUpperCase();
      let position = 0, output = "";
      for (const [index, match] of matches.entries()) {
        const word = match[0], preferred = preferredCase.get(word.toLowerCase());
        const parts = word.split(/([-‑])/u);
        const formatted = preferred || parts.map((part, partIndex) => {
          if (part === "-" || part === "\u2011") return part;
          const lower = part.toLowerCase(), canonical2 = preferredCase.get(lower);
          if (canonical2) return canonical2;
          if (!allCaps && (/^\p{Lu}{2,}$/u.test(part) || /\p{Ll}.*\p{Lu}/u.test(part))) return part;
          const boundary = index === 0 && partIndex === 0 || index === matches.length - 1 && partIndex === parts.length - 1;
          return !boundary && minorWords.has(lower) ? lower : lower.replace(/\p{L}/u, (letter) => letter.toUpperCase());
        }).join("");
        output += segment.slice(position, match.index) + formatted;
        position = match.index + word.length;
      }
      return output + segment.slice(position);
    }).join("");
  }
  if (typeof window !== "undefined") window.ATLAS_LABELS = { titleCase };

  // scripts/startup-navigation.mjs
  function baselineLocation(input) {
    try {
      return ["/conservative-atlas/", "/conservative-atlas/index.html", "/conservative-atlas/hypergraph-lab.html"].includes(new URL(input, "http://localhost").pathname);
    } catch {
      return false;
    }
  }
  function createStartupNavigation(input, changed = () => {
  }) {
    let revision = 0, phase = baselineLocation(input) ? "baseline" : "pending", navigating = false;
    const update = (next) => {
      phase = next;
      changed({ phase, revision, navigating });
    };
    return {
      state: () => ({ phase, revision, navigating }),
      ready: () => ["baseline", "study", "completed"].includes(phase),
      automatic: () => ["baseline", "study"].includes(phase),
      begin() {
        revision++;
        navigating = true;
        update("pending");
        return revision;
      },
      completed(token) {
        if (token !== revision) return false;
        navigating = false;
        update("completed");
        return true;
      },
      waiting(token) {
        if (token !== revision) return false;
        navigating = false;
        update("waiting");
        return true;
      },
      failed(token) {
        if (token !== revision) return false;
        navigating = false;
        update("failed");
        return true;
      },
      installed() {
        if (navigating) return false;
        revision++;
        update("study");
        return true;
      },
      saved() {
        if (navigating) return false;
        revision++;
        update("completed");
        return true;
      },
      baseline() {
        revision++;
        navigating = false;
        update("baseline");
      }
    };
  }
  function startupNavigation() {
    if (typeof window === "undefined") return null;
    if (!window.ATLAS_STARTUP_NAVIGATION) {
      const input = window.location?.href || (typeof location === "undefined" ? "/conservative-atlas/" : location.href);
      window.ATLAS_STARTUP_NAVIGATION = createStartupNavigation(input, (detail) => {
        const EventType = window.CustomEvent || globalThis.CustomEvent;
        if (EventType) window.dispatchEvent?.(new EventType("atlas:navigation-state", { detail }));
      });
    }
    return window.ATLAS_STARTUP_NAVIGATION;
  }
  function navigationReady(graph3) {
    const policy = startupNavigation();
    if (policy && !policy.ready()) return false;
    const current = typeof window === "undefined" ? null : window.atlasSharedCanvas?.graph?.();
    return !current || !graph3 || current === graph3;
  }
  function automaticNavigationAllowed(graph3) {
    return navigationReady(graph3) && (startupNavigation()?.automatic() ?? true);
  }
  startupNavigation();

  // scripts/description-policy.mjs
  function descriptionsAllowed(graph3, session = {}) {
    const imported = standaloneImport(graph3);
    return !!graph3 && (!imported || !session.active && !!importedThemeBinding(graph3)) && navigationReady(graph3) && (!graph3.linkedBrowse || imported) && !graph3.collaboration && !graph3.temporalSelection && !(graph3.semantic && graph3.entityKind !== "source") && (!session.active || session.canCompute === true);
  }

  // scripts/canvas-descriptions.mjs
  var currentGraph;
  var updateNames;
  var manualGraph;
  var scopes = /* @__PURE__ */ new WeakMap();
  var node = (tag, text) => {
    const element6 = document.createElement(tag);
    element6.textContent = text;
    return element6;
  };
  var queue = createDescriptionQueue(async (request, regenerate, signal) => {
    if (!descriptionsAllowed(currentGraph, window.BIBLIOMAP) || (standaloneImport(currentGraph) || currentGraph.temporalSeries || !automaticNavigationAllowed(currentGraph)) && manualGraph !== currentGraph) throw Error("AI naming is unavailable or paused in this analysis context.");
    if (window.BIBLIOMAP?.active) {
      const job4 = window.BIBLIOMAP.stage(currentGraph, "description", { cluster: request.cluster }, () => {
      }, regenerate);
      const abort = () => job4.cancel();
      signal.addEventListener("abort", abort, { once: true });
      try {
        return await job4.promise;
      } finally {
        signal.removeEventListener("abort", abort);
      }
    }
    const timeout = AbortSignal.timeout(19e4), combined = AbortSignal.any([signal, timeout]);
    for (let attempt = 0; attempt < 4; attempt++) {
      if (!descriptionsAllowed(currentGraph, window.BIBLIOMAP) || (standaloneImport(currentGraph) || currentGraph.temporalSeries || !automaticNavigationAllowed(currentGraph)) && manualGraph !== currentGraph) throw Error("The naming context changed.");
      const response = await fetch("analysis-api/describe", { method: "POST", signal: combined, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...request, regenerate }) });
      const result = await response.json();
      if (response.status === 429 && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 3e3));
        combined.throwIfAborted();
        continue;
      }
      if (!response.ok) throw new Error(result.error === "fetch failed" ? "The local language model is unavailable. Existing names remain available; retry shortly." : result.error || "Description unavailable.");
      return result;
    }
  }, (entries) => {
    if (!descriptionsAllowed(currentGraph, window.BIBLIOMAP)) {
      drawProgress();
      return;
    }
    for (const record3 of entries) {
      if (record3.result && currentGraph?.generatedDescriptions?.[record3.request.cluster]?.result !== record3.result) {
        currentGraph.generatedDescriptions = { ...currentGraph.generatedDescriptions, [record3.request.cluster]: { requestKey: record3.key, result: record3.result } };
        updateNames?.(record3.request.cluster, record3.result);
      }
      record3.draw?.();
    }
    drawProgress();
  });
  function sync2(graph3) {
    if (currentGraph !== graph3) {
      queue.stop();
      currentGraph = graph3;
      updateNames = null;
      manualGraph = null;
    }
    if (!descriptionsAllowed(graph3, window.BIBLIOMAP) || (standaloneImport(graph3) || graph3.temporalSeries || !automaticNavigationAllowed(graph3)) && manualGraph !== graph3) {
      queue.stop();
      drawProgress();
    }
  }
  function prepare(graph3, update) {
    if (!descriptionsAllowed(graph3, window.BIBLIOMAP) || (standaloneImport(graph3) || graph3.temporalSeries || !automaticNavigationAllowed(graph3)) && manualGraph !== graph3) {
      sync2(graph3);
      updateNames = update;
      if (graph3.collaboration || graph3.temporalSelection || graph3.semantic && graph3.entityKind !== "source") return;
      if (standaloneImport(graph3) && !descriptionsAllowed(graph3, window.BIBLIOMAP)) return;
      for (const [cluster, saved] of Object.entries(graph3.generatedDescriptions || {})) {
        const request = descriptionRequest(graph3, cluster, window.ATLAS_DATA.summary.corpus_id);
        if (saved.result && saved.requestKey === JSON.stringify(request)) {
          queue.seed(request, saved.result);
          const description2 = graph3.themeDescriptions?.[cluster];
          if (description2) {
            description2.generated = saved.result;
            if (["shared-theme", "mixed-themes"].includes(saved.result.status)) {
              description2.keywordHeading ||= description2.heading;
              description2.heading = saved.result.heading;
            }
          }
        }
      }
      return;
    }
    sync2(graph3);
    updateNames = update;
    if (!scopes.has(graph3) || scopes.get(graph3).themes !== graph3.themeDescriptions) {
      const counts = /* @__PURE__ */ new Map();
      for (const member of graph3.nodes) if (member.cluster > 0) counts.set(String(member.cluster), (counts.get(String(member.cluster)) || 0) + 1);
      const base = descriptionRequest(graph3, "", window.ATLAS_DATA.summary.corpus_id);
      const requests2 = [...counts].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).map(([cluster]) => ({ ...base, cluster }));
      const key2 = requests2.length ? JSON.stringify({ ...requests2[0], cluster: "" }) : "";
      scopes.set(graph3, { key: key2, requests: requests2, themes: graph3.themeDescriptions });
    }
    const { key, requests } = scopes.get(graph3);
    for (const request of requests) {
      const saved = graph3.generatedDescriptions?.[request.cluster];
      if (saved?.result && saved.requestKey === JSON.stringify(request)) queue.seed(request, saved.result);
    }
    const entries = queue.activate(key, requests);
    for (const record3 of entries) if (record3.result) {
      graph3.generatedDescriptions = { ...graph3.generatedDescriptions, [record3.request.cluster]: { requestKey: record3.key, result: record3.result } };
      const description2 = graph3.themeDescriptions?.[record3.request.cluster];
      if (description2 && description2.generated !== record3.result) {
        description2.generated = record3.result;
        if (["shared-theme", "mixed-themes"].includes(record3.result.status)) {
          description2.keywordHeading ||= description2.heading;
          description2.heading = record3.result.heading;
        }
      }
    }
  }
  function drawProgress() {
    const host = document.getElementById("clusterNameProgress");
    if (!host) return;
    if (!descriptionsAllowed(currentGraph, window.BIBLIOMAP)) {
      host.replaceChildren(node("span", standaloneImport(currentGraph) ? "Load matching pinned-source keywords before naming. Private imported contexts are unsupported." : "Cached keywords only \xB7 AI naming is not run for completed windows or read-only contexts."));
      return;
    }
    if ((standaloneImport(currentGraph) || currentGraph.temporalSeries || !automaticNavigationAllowed(currentGraph)) && manualGraph !== currentGraph) {
      host.replaceChildren(node("span", standaloneImport(currentGraph) ? "Current keyword overlay \xB7 Qwen naming starts only when requested; retained network and study reviews are unchanged." : "Completed-view browsing \xB7 automatic naming paused; matching cached descriptions remain readable."));
      const resume = node("button", "Resume naming \xB7 full map");
      resume.type = "button";
      resume.className = "secondary";
      resume.onclick = resumeNaming;
      host.append(resume);
      return;
    }
    const entries = queue.entries(), done = entries.filter((record3) => record3.status === "done").length;
    const failed = entries.filter((record3) => ["error", "cancelled"].includes(record3.status));
    host.replaceChildren(node("span", `AI descriptions ${done}/${entries.length}${entries.some((record3) => ["running", "idle"].includes(record3.status)) ? " \xB7 naming clusters" : failed.length ? " \xB7 finished" : " \xB7 complete"}${failed.length ? ` \xB7 ${failed.length} need retry` : ""}. Suggested themes, not validated.`));
    if (failed.length) {
      const retry = node("button", "Retry unfinished names");
      retry.type = "button";
      retry.className = "secondary";
      retry.onclick = () => {
        if (!descriptionsAllowed(currentGraph, window.BIBLIOMAP)) return;
        for (const record3 of failed) queue.retry(record3);
      };
      host.append(retry);
    }
    if (entries.length) {
      const rerun = node("button", "Rerun Qwen");
      rerun.type = "button";
      rerun.className = "secondary";
      rerun.disabled = entries.some((record3) => record3.status === "running");
      rerun.onclick = rerunAll;
      host.append(rerun);
    }
    if (entries.some((record3) => ["running", "idle"].includes(record3.status))) {
      const cancel2 = node("button", "Pause naming");
      cancel2.type = "button";
      cancel2.className = "secondary";
      cancel2.onclick = () => {
        for (const record3 of queue.entries()) if (["running", "idle"].includes(record3.status)) queue.cancel(record3);
      };
      host.append(cancel2);
    }
  }
  function resumeNaming() {
    if (!descriptionsAllowed(currentGraph, window.BIBLIOMAP)) return;
    manualGraph = currentGraph;
    prepare(currentGraph, updateNames);
    drawProgress();
  }
  function rerunAll() {
    if (!descriptionsAllowed(currentGraph, window.BIBLIOMAP)) return;
    if ((standaloneImport(currentGraph) || currentGraph.temporalSeries || !automaticNavigationAllowed(currentGraph)) && manualGraph !== currentGraph) resumeNaming();
    for (const record3 of queue.entries()) queue.retry(record3, true);
  }
  function mount(parent, graph3, cluster, inspect) {
    sync2(graph3);
    if (standaloneImport(graph3) && !descriptionsAllowed(graph3, window.BIBLIOMAP)) {
      parent.append(node("p", "Load matching pinned-source keywords before requesting names. No network recomputation is needed."));
      return;
    }
    if (graph3.collaboration || graph3.temporalSelection || graph3.semantic && graph3.entityKind !== "source") {
      parent.append(node("p", graph3.collaboration ? "Actor identities are not article IDs. AI actor descriptions are not implemented." : "Completed windows use cached keywords; no AI description job is started. Return to the full pinned map to name clusters."));
      return;
    }
    const request = descriptionRequest(graph3, cluster, window.ATLAS_DATA.summary.corpus_id), key = JSON.stringify(request);
    const saved = graph3.generatedDescriptions?.[cluster];
    const record3 = queue.entries().find((record4) => record4.key === key) || queue.lookup(request) || saved?.result && saved.requestKey === key && { key, request, result: saved.result, status: "done" };
    if (!record3) return;
    const section = node("section", "");
    section.className = "cluster-ai-description";
    parent.append(section);
    const draw5 = () => {
      section.replaceChildren(node("h3", "What connects this cluster?"));
      if (record3.result) {
        const result = record3.result;
        if (titleCase(graph3.themeDescriptions?.[cluster]?.heading) !== titleCase(result.heading)) section.append(node("strong", titleCase(result.heading)));
        if (result.status !== "shared-theme") section.append(node("p", result.status === "mixed-themes" ? "Mixed themes \u2014 one label may not represent every member." : result.status === "limited-evidence" ? "Partial description \u2014 broader commonality could not be verified; showing one supported concept." : "Insufficient evidence for a shared theme."));
        if (result.summary) section.append(node("p", result.summary.text));
        const coverage = result.packet.coverage;
        const sampledAbstracts = coverage.sampledAbstracts ?? result.packet.documents.filter((document2) => document2.role === "member" && document2.abstract).length;
        section.append(node("small", `${coverage.sampled}/${coverage.members} member titles considered \xB7 ${sampledAbstracts} sampled abstracts \xB7 ${coverage.withAbstract}/${coverage.members} have abstracts \xB7 AI suggestion, not network validation.`));
        const evidence = node("details", "");
        evidence.append(node("summary", "Concepts, supporting text & exceptions"));
        const claims = [result.summary, ...result.concepts.map((claim) => ({ ...claim, text: titleCase(claim.text) })), ...result.exceptions.map((claim) => ({ ...claim, text: "Exception / variation: " + titleCase(claim.text) })), result.contrast && { ...result.contrast, text: "Compared with neighbors: " + result.contrast.text }].filter(Boolean);
        for (const claim of claims) {
          const item = node("details", "");
          item.append(node("summary", claim.text));
          for (const citation of claim.evidence) {
            const document2 = result.packet.documents.find((document3) => document3.id === citation.id);
            item.append(node("blockquote", citation.quote));
            const button4 = node("button", (document2.role === "neighbor" ? "Neighbor: " : "") + document2.title);
            button4.type = "button";
            button4.className = "secondary";
            button4.onclick = () => inspect(citation.id);
            item.append(button4, node("small", citation.field + " \xB7 " + citation.id));
          }
          evidence.append(item);
        }
        evidence.append(node("p", result.verification), node("small", result.model + " \xB7 " + new Date(result.createdAt).toLocaleString()));
        for (const warning of result.evidenceWarnings || []) evidence.append(node("p", warning));
        if (request.kind === "coupling") evidence.append(node("p", "This describes source-article subject matter. Shared foundations are listed separately; sharing a reference does not establish a shared research finding."));
        section.append(evidence);
      }
      const status = node("p", record3.status === "running" ? "Reading representative and diverse article evidence\u2026" : record3.error || (!record3.result ? "Queued automatically. Extracted keywords remain available while names are generated." : ""));
      status.setAttribute("role", "status");
      section.append(status);
      const controls = node("div", "");
      controls.className = "description-actions";
      const run5 = node("button", record3.result ? "Regenerate description" : record3.status === "error" || record3.status === "cancelled" ? "Retry description" : "Describe next");
      run5.type = "button";
      run5.className = "secondary";
      run5.disabled = !descriptionsAllowed(graph3, window.BIBLIOMAP) || record3.status === "running";
      run5.onclick = () => {
        if (currentGraph === graph3 && descriptionsAllowed(graph3, window.BIBLIOMAP)) {
          manualGraph = graph3;
          queue.retry(record3, Boolean(record3.result));
        }
      };
      controls.append(run5);
      if (record3.status === "running" || record3.status === "idle") {
        const cancel2 = node("button", "Cancel");
        cancel2.type = "button";
        cancel2.className = "secondary";
        cancel2.onclick = () => queue.cancel(record3);
        controls.append(cancel2);
      }
      if (record3.result) {
        const download = node("button", "Export description");
        download.type = "button";
        download.className = "secondary";
        download.onclick = () => {
          const url = URL.createObjectURL(new Blob([JSON.stringify({ request, ...record3.result }, null, 2)], { type: "application/json" })), link = document.createElement("a");
          link.href = url;
          link.download = "cluster-" + cluster + "-description.json";
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1e3);
        };
        controls.append(download);
      }
      section.append(controls);
    };
    record3.draw = () => {
      if (section.isConnected) draw5();
    };
    draw5();
    if (descriptionsAllowed(graph3, window.BIBLIOMAP) && (!standaloneImport(graph3) && !graph3.temporalSeries && automaticNavigationAllowed(graph3) || manualGraph === graph3)) queue.prioritize(record3);
  }
  window.ATLAS_DESCRIPTIONS = { mount, sync: sync2, prepare, drawProgress, rerunAll, resumeNaming };
  window.addEventListener?.("atlas:navigation-state", () => {
    manualGraph = null;
    queue.stop();
    drawProgress();
  });

  // scripts/evidence-guidance.mjs
  var RELIABILITY_RULES = "Exploratory reading guide v1: mostly holds together requires mean recovery \u22650.75, 10th percentile \u22650.60 and retention \u22650.80; changes substantially means mean recovery <0.50 or retention <0.60. Other results are sensitive. Groups of fewer than four members and single-group partitions need extra caution. These are heuristics, not validated confidence levels.";
  function interpretRecovery(record3, clusterCount = 2) {
    if (!record3 || ![record3.meanJaccard, record3.meanRetention, record3.interval?.[0]].every(Number.isFinite)) return { status: "unknown", heading: "Not enough evidence yet", explanation: "Run the reliability check before judging how well this group holds together." };
    const fragile = record3.meanJaccard < 0.5 || record3.meanRetention < 0.6;
    const strong = record3.meanJaccard >= 0.75 && record3.interval[0] >= 0.6 && record3.meanRetention >= 0.8;
    const status = fragile ? "changing" : strong ? "holding" : "sensitive";
    const heading = fragile ? "Changes substantially" : strong ? "Mostly holds together" : "Sensitive to the evidence";
    const explanation = record3.meanRetention < 0.6 ? "Many articles lose their eligible connections when the evidence is resampled. Treat this grouping cautiously." : fragile ? "Most articles remain connected, but they often regroup, split or merge. Do not treat this boundary as settled." : strong ? "The same group generally reappears when the citation evidence is resampled. It is a useful starting point for reading, not a confirmed theme." : "Parts of this group reappear, but its boundaries shift. Read it as an approximate grouping rather than a firm category.";
    const caution = record3.size < 4 ? "Very small group: staying intact is a weak test of meaningful structure." : clusterCount === 1 ? "Only one group: this cannot establish a meaningful subdivision." : "";
    return { status, heading, explanation, caution };
  }
  function recoveryOverview(clusters) {
    const entries = Object.values(clusters), counts = { holding: 0, sensitive: 0, changing: 0, unknown: 0 };
    let members = 0, holdingMembers = 0;
    for (const record3 of entries) {
      const outcome = interpretRecovery(record3, entries.length);
      counts[outcome.status]++;
      members += record3.size;
      if (outcome.status === "holding") holdingMembers += record3.size;
    }
    return { counts, members, holdingMembers, heading: !entries.length ? "No linked groups to assess" : holdingMembers >= 0.75 * members ? "Most articles are in groups that hold together" : counts.changing ? "Treat this map as exploratory" : "The group boundaries are approximate", explanation: !entries.length ? "Try less restrictive connection settings; no reliability conclusion is available." : `Groups that mostly hold together: ${counts.holding}. Sensitive groups: ${counts.sensitive}. Groups that change substantially: ${counts.changing}. ${holdingMembers} of ${members} clustered articles are in groups that mostly hold together. Unlinked articles are not assessed. Small stable groups do not establish stable boundaries for the larger groups.` };
  }

  // scripts/cluster-indicators.mjs
  function hasGeneratedLabel(description2) {
    return !!description2?.generated && ["shared-theme", "mixed-themes"].includes(description2.generated.status) && description2.heading === description2.generated.heading;
  }
  function clusterReliability(graph3, cluster) {
    if (graph3.collaboration) return { status: "unknown", label: "No cluster stability rating", dash: null, title: "Collaboration construction sensitivity is not per-cluster stability or thematic validation. Use Collaboration maps for counting/team/affiliation and audited identity alternatives." };
    if (graph3.semantic) return { status: "unknown", label: "No cluster stability rating", dash: null, title: "Citation resampling is not applicable to semantic clusters. Use Semantic maps for text/threshold sensitivity; this does not provide a per-cluster stability rating." };
    if (!(Number(cluster) > 0)) return { status: "unlinked", label: "Not assessed", dash: null, title: "Unlinked articles are not assessed as a cluster." };
    const algorithm3 = ["infomap", "hypergraph", "sbm", "trial"].includes(graph3.clustering?.algorithm) ? graph3.clustering.algorithm : "leiden";
    const result = graph3.reliability?.algorithm === algorithm3 ? graph3.reliability : null;
    if (["running", "pending"].includes(graph3.reliabilityState)) return { status: "checking", label: "Checking", dash: null, title: "Cluster stability is being checked for the selected method. No completed rating is shown yet." };
    const outcome = interpretRecovery(result?.clusters?.[cluster], Object.keys(result?.clusters || {}).length);
    if (outcome.status === "unknown") return { status: "unknown", label: "Not checked", dash: null, title: "No completed cluster stability rating for this map. Open Reliability to run or retry a check." };
    const styles = { holding: { label: "Holds together", dash: "none" }, sensitive: { label: "Sensitive", dash: "4 3" }, changing: { label: "Changes", dash: "1 3" } };
    return { ...outcome, ...styles[outcome.status], preliminary: !!result.preliminary, title: `${result.preliminary ? "Preliminary \xB7 " : ""}${outcome.heading} \xB7 ${result.samples} resamples. ${outcome.explanation} ${outcome.caution || ""} This is cluster-level structural stability, not article quality or validation of the AI label.` };
  }
  if (typeof window !== "undefined") window.ATLAS_INDICATORS = { hasGeneratedLabel, clusterReliability };

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

  // scripts/hypergraph-network.mjs
  var HYPERGRAPH_PROJECTION = "Size-normalized hypergraph projection: each supported group contributes weight / (group size \u2212 1) to every member pair. This models choosing an incident group by weight, then a different member uniformly. Leiden optimizes CPM on this projection; Infomap optimizes its two-level map equation on the same walk. This is not direct hypergraph modularity or memory-network inference. Original pair lines retain their evidence counts; envelopes show whole groups.";
  var HYPERGRAPH_MODEL_VERSION = "incidence-v1";
  var HYPERGRAPH_INCIDENCE = "Whole groups are retained as article\u2013group incidence nodes, without clique projection. Each membership has its group weight; Leiden normalizes membership weights to mean one and optimizes bipartite CPM with cross-class gamma and zero within-class penalties. Infomap encodes visits to both article and group nodes in a weighted undirected incidence walk (including return to the same article). This is a memoryless incidence model, not a multilayer memory model or direct hypergraph modularity. Helper groups never become article tiles. Original pair lines and bridge roles retain their original evidence; envelopes show complete groups. Stability is not thematic validation.";
  function incidenceNetwork(graph3) {
    if (!Array.isArray(graph3.hyperedges)) throw new Error("Hypergraph evidence must be reconstructed before clustering.");
    const universe = new Set(graph3.nodes.map((node2) => node2.id)), edges = [];
    let occurrences = 0;
    for (const edge of graph3.hyperedges) {
      if (!Number.isFinite(edge.weight) || edge.weight < 0) throw new Error("Invalid hyperedge weight");
      const members = [...new Set(edge.members)].sort();
      if (members.some((id) => !universe.has(id))) throw new Error("Unknown hypergraph member");
      if (members.length < 2 || !edge.weight) continue;
      occurrences += members.length;
      if (occurrences > 2e5 || edges.length >= 2e4) throw new Error("Hypergraph incidence exceeds safe limits. Narrow the scope; no truncated network was used.");
      edges.push({ ...edge, members });
    }
    const articleIds3 = [...new Set(edges.flatMap((edge) => edge.members))].sort(), positions = new Map(articleIds3.map((id, position) => [id, position]));
    const links = edges.flatMap((edge, position) => edge.members.map((id) => ({ source: positions.get(id), target: articleIds3.length + position, strength: edge.weight })));
    const scale = links.reduce((sum, edge) => sum + edge.strength, 0) / Math.max(1, links.length);
    return { articleIds: articleIds3, groups: edges, links, scale, density: articleIds3.length && edges.length ? links.length / (articleIds3.length * edges.length) : 0, modelVersion: HYPERGRAPH_MODEL_VERSION };
  }
  function isIncidenceModel(graph3) {
    return graph3.networkModel === "hypergraph" && graph3.clustering?.algorithm !== "hypergraph" && graph3.clustering?.modelVersion === HYPERGRAPH_MODEL_VERSION;
  }
  function hypergraphProjection(hyperedges, limit = 2e5) {
    const pairs = /* @__PURE__ */ new Map();
    let work = 0;
    for (const edge of hyperedges) {
      const members = [...new Set(edge.members)].sort();
      if (!Number.isFinite(edge.weight) || edge.weight < 0) throw new Error("Invalid hyperedge weight");
      if (members.length < 2 || !edge.weight) continue;
      work += members.length * (members.length - 1) / 2;
      if (work > 3e6) throw new Error("Hypergraph projection exceeds the safe computation limit. Narrow the scope; no truncated network was used.");
      for (let left = 0; left < members.length; left++) for (let right = left + 1; right < members.length; right++) {
        const key = JSON.stringify([members[left], members[right]]);
        if (!pairs.has(key)) {
          if (pairs.size >= limit) throw new Error("Too many projected hypergraph connections. Narrow the scope; no truncated network was used.");
          pairs.set(key, { source: members[left], target: members[right], strength: 0 });
        }
        pairs.get(key).strength += edge.weight / (members.length - 1);
      }
    }
    return [...pairs.values()];
  }
  function analysisNetwork(graph3) {
    if (graph3.networkModel !== "hypergraph" || graph3.clustering?.algorithm === "hypergraph") return graph3;
    if (!graph3.hyperedges) throw new Error("Hypergraph evidence must be reconstructed before clustering.");
    if (isIncidenceModel(graph3)) {
      const incidence = incidenceNetwork(graph3);
      return { ...graph3, links: incidence.links.map((edge) => ({ ...edge, source: edge.source < incidence.articleIds.length ? incidence.articleIds[edge.source] : JSON.stringify(["group", edge.source]), target: JSON.stringify(["group", edge.target]) })) };
    }
    return { ...graph3, links: hypergraphProjection(graph3.hyperedges) };
  }

  // scripts/auto-cpm.mjs
  function fragmentation(graph3, memberships) {
    if (isIncidenceModel(graph3)) graph3 = { ...graph3, networkModel: "connectivity-only", links: incidenceNetwork(graph3).groups.flatMap((edge) => edge.members.slice(1).map((target) => ({ source: edge.members[0], target, strength: 1 }))) };
    graph3 = analysisNetwork(graph3);
    const adjacency = /* @__PURE__ */ new Map();
    for (const edge of graph3.links) {
      if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
      if (!adjacency.has(edge.target)) adjacency.set(edge.target, []);
      adjacency.get(edge.source).push(edge.target);
      adjacency.get(edge.target).push(edge.source);
    }
    const componentByNode = /* @__PURE__ */ new Map(), components = [];
    for (const start of adjacency.keys()) {
      if (componentByNode.has(start)) continue;
      const component = components.length, stack = [start], members = [];
      componentByNode.set(start, component);
      while (stack.length) {
        const current = stack.pop();
        members.push(current);
        for (const next of adjacency.get(current)) if (!componentByNode.has(next)) {
          componentByNode.set(next, component);
          stack.push(next);
        }
      }
      components.push(members);
    }
    const groups = /* @__PURE__ */ new Map();
    for (const [id, cluster] of Object.entries(memberships)) {
      if (!groups.has(cluster)) groups.set(cluster, []);
      groups.get(cluster).push(id);
    }
    let tinyNodes = 0, tinyClusters = 0, introducedTinyNodes = 0, introducedTinyClusters = 0, subdividedGroups = 0;
    for (const members of groups.values()) {
      const component = components[componentByNode.get(members[0])], intact = !!component && members.length === component.length && members.every((id) => componentByNode.get(id) === componentByNode.get(members[0]));
      if (!intact) subdividedGroups++;
      if (members.length <= 3) {
        tinyNodes += members.length;
        tinyClusters++;
        if (!intact) {
          introducedTinyNodes += members.length;
          introducedTinyClusters++;
        }
      }
    }
    return { components: components.length, componentSizes: components.map((members) => members.length).sort((left, right) => right - left), tinyNodes, tinyClusters, introducedTinyNodes, introducedTinyClusters, introducedTinyNodeFraction: introducedTinyNodes / Math.max(1, adjacency.size), introducedTinyClusterFraction: introducedTinyClusters / Math.max(1, subdividedGroups), singletons: [...groups.values()].filter((members) => members.length === 1).length, pairs: [...groups.values()].filter((members) => members.length === 2).length, triples: [...groups.values()].filter((members) => members.length === 3).length };
  }
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

  // scripts/community-methods.mjs
  function buildHyperedges(graph3, bundles3, limit = 2e4) {
    const nodes = new Map(graph3.nodes.map((node2) => [node2.id, node2])), combinations = /* @__PURE__ */ new Map();
    const add = (members) => {
      const key = JSON.stringify(members);
      if (combinations.has(key)) return;
      if (combinations.size >= limit) throw new Error(`More than ${limit.toLocaleString()} exact combinations. Choose a smaller reference scope or a single lower order; no truncated hypergraph was clustered.`);
      combinations.set(key, members);
    };
    if (graph3.order === 2 || graph3.order === "all") for (const edge of graph3.links) add([edge.source, edge.target].sort());
    if (graph3.order !== 2) for (const bundle of bundles3) {
      const members = [...new Set(bundle.members.filter((id) => nodes.has(id)))].sort(), minimum = graph3.order === "all" ? 3 : graph3.order, maximum = graph3.order === "all" ? Math.min(graph3.maximumOrder, members.length) : graph3.order;
      for (let order = minimum; order <= maximum && order <= members.length; order++) {
        const visit = (offset, chosen) => {
          if (chosen.length === order) {
            add(chosen);
            return;
          }
          for (let position = offset; position <= members.length - (order - chosen.length); position++) visit(position + 1, [...chosen, members[position]]);
        };
        visit(0, []);
      }
    }
    const postings = new Map(graph3.nodes.map((node2) => [node2.id, new Set(node2.articles || [])])), hyperedges = [];
    for (const [key, members] of combinations) {
      const first = [...members].sort((left, right) => postings.get(left).size - postings.get(right).size)[0];
      const articles = [...postings.get(first)].filter((article) => members.every((id) => postings.get(id).has(article))).sort();
      if (articles.length >= (graph3.minimumSupport || 5)) hyperedges.push({ id: key, members, articles });
    }
    const occurrences = /* @__PURE__ */ new Map();
    for (const edge of hyperedges) for (const article of edge.articles) occurrences.set(article, (occurrences.get(article) || 0) + 1);
    for (const edge of hyperedges) edge.weight = edge.articles.reduce((sum, article) => sum + 1 / occurrences.get(article), 0);
    return hyperedges;
  }

  // scripts/coupling-hypergraph.mjs
  function couplingHyperedges(graph3, limit = 3e6) {
    const eligible = new Set(graph3.links.flatMap((edge) => [edge.source, edge.target]));
    const references = /* @__PURE__ */ new Map();
    for (const node2 of graph3.nodes) if (eligible.has(node2.id)) {
      for (const reference of new Set(node2.references || [])) {
        if (!references.has(reference)) references.set(reference, /* @__PURE__ */ new Set());
        references.get(reference).add(node2.id);
      }
    }
    const hyperedges = [];
    let pairWork = 0;
    for (const [reference, sources] of [...references].sort(([left], [right]) => left.localeCompare(right))) {
      if (sources.size < 2) continue;
      pairWork += sources.size * (sources.size - 1) / 2;
      if (pairWork > limit) throw new Error("Coupling hypergraph exceeds the safe computation limit. Choose a smaller source scope or stronger connection thresholds; no truncated result was used.");
      hyperedges.push({ members: [...sources].sort(), weight: 1, reference, order: sources.size });
    }
    return hyperedges;
  }

  // scripts/hypergraph-view.mjs
  function visibleHyperedges(edges, nodes, focus2 = {}, limit = 60) {
    const visible = new Set(nodes.map((node2) => node2.id));
    const cluster = new Set(nodes.filter((node2) => String(node2.cluster) === String(focus2.cluster)).map((node2) => node2.id));
    const pair = focus2.edge ? focus2.edge.split("|") : [];
    const eligible = edges.filter((edge) => edge.members.length >= 3 && edge.members.every((id) => visible.has(id)) && (!focus2.node || edge.members.includes(focus2.node)) && (!pair.length || pair.every((id) => edge.members.includes(id))) && (!cluster.size || edge.members.some((id) => cluster.has(id))));
    eligible.sort((left, right) => (right.articles?.length || 0) - (left.articles?.length || 0) || left.members.length - right.members.length || String(left.id).localeCompare(String(right.id)));
    return { edges: eligible.slice(0, limit), total: eligible.length };
  }
  function hullPath(points, padding = 12) {
    if (points.length < 3) return "";
    const expanded = points.flatMap((point) => [[-padding, -padding], [padding, -padding], [padding, padding], [-padding, padding]].map(([offsetX, offsetY]) => ({ x: point.x + offsetX, y: point.y + offsetY })));
    expanded.sort((left, right) => left.x - right.x || left.y - right.y);
    const cross = (first, second, third) => (second.x - first.x) * (third.y - first.y) - (second.y - first.y) * (third.x - first.x);
    const half = (sequence) => {
      const result = [];
      for (const point of sequence) {
        while (result.length >= 2 && cross(result.at(-2), result.at(-1), point) <= 0) result.pop();
        result.push(point);
      }
      return result;
    };
    const lower = half(expanded), upper = half([...expanded].reverse());
    return "M" + [...lower.slice(0, -1), ...upper.slice(0, -1)].map((point) => point.x + "," + point.y).join("L") + "Z";
  }
  function clusterCombinations(edges, nodes, cluster, limit = 2e3) {
    const members = new Set(nodes.filter((node2) => String(node2.cluster) === String(cluster)).map((node2) => node2.id));
    const all = edges.filter((edge) => edge.members.length >= 3 && edge.members.every((id) => members.has(id))).map((edge) => ({ ...edge, id: edge.id || edge.reference }));
    all.sort((left, right) => (right.articles?.length || 0) - (left.articles?.length || 0) || left.members.length - right.members.length || String(left.id).localeCompare(String(right.id)));
    return { groups: all.slice(0, limit), total: all.length };
  }
  if (typeof window !== "undefined") {
    const create = (tag, attributes, parent) => {
      const node2 = document.createElementNS("http://www.w3.org/2000/svg", tag);
      for (const [name, value] of Object.entries(attributes)) node2.setAttribute(name, value);
      parent?.append(node2);
      return node2;
    };
    let cachedGraph, cachedEdges, cachedError;
    window.ATLAS_HYPERGRAPH_VIEW = {
      hullPath,
      forCluster(graph3, bundles3, cluster, nodes) {
        const edges = graph3.hyperedges || (graph3.canvasKind === "coupling" ? couplingHyperedges(graph3) : buildHyperedges(graph3, bundles3 || [], 2e4));
        return clusterCombinations(edges, nodes, cluster);
      },
      draw({ graph: graph3, nodes, viewport, screen, radius, color, mode: mode2, focus: focus2, status, inspect, bundles: bundles3 }) {
        viewport.closest("svg").dataset.representation = mode2;
        viewport.querySelector("#hyperedgeOverlay")?.remove();
        if (mode2 === "network") {
          status.hidden = true;
          return;
        }
        status.hidden = false;
        const coupling2 = graph3.canvasKind === "coupling";
        if (cachedGraph !== graph3) {
          cachedGraph = graph3;
          cachedError = null;
          try {
            cachedEdges = (graph3.hyperedges || (coupling2 ? couplingHyperedges(graph3) : buildHyperedges(graph3, bundles3 || graph3.bundles || [], 2e4))).map((edge) => ({ ...edge, id: edge.id || edge.reference }));
          } catch (error) {
            cachedEdges = [];
            cachedError = error.message;
          }
        }
        if (cachedError) {
          status.textContent = cachedError;
          return;
        }
        const selected = visibleHyperedges(cachedEdges, nodes, focus2), byId = new Map(nodes.map((node2) => [node2.id, node2]));
        status.textContent = selected.total ? `${selected.edges.length} of ${selected.total} eligible ${coupling2 ? "shared-reference groups" : "combinations"} shown \xB7 ${coupling2 ? "deterministic reference order" : "strongest support first"}. ${mode2 === "layered" ? "Layers separate group sizes, not importance. " : ""}Outlines are evidence groups, not cluster boundaries; enclosed non-members do not count.` : coupling2 ? "No complete shared-reference groups with 3+ members in this selection." : "No complete 3+ member combinations in this selection. Choose a higher/combined order, another focus, or generate higher orders.";
        const layer = create("g", { id: "hyperedgeOverlay", "aria-label": "Exact higher-order combinations" }, null);
        viewport.insertBefore(layer, viewport.firstChild);
        const maximum = Math.max(1, ...selected.edges.map((edge) => edge.articles?.length || 0));
        const highlight = (edge) => {
          const members = new Set(edge?.members || []);
          for (const node2 of viewport.querySelectorAll("[data-node]")) node2.style.opacity = edge ? members.has(node2.dataset.node) ? "1" : ".12" : "";
          for (const shape of layer.querySelectorAll("[data-combination]")) shape.style.opacity = edge ? shape.dataset.combination === edge.id ? "1" : ".08" : "";
        };
        for (const edge of selected.edges) {
          const members = edge.members.map((id) => byId.get(id));
          const points = members.map(screen), clusters = new Set(members.map((node2) => node2.cluster));
          const stroke = clusters.size === 1 ? color(members[0]) : "#888888";
          const intensity = coupling2 ? 0.6 : 0.2 + 0.65 * Math.log1p(edge.articles?.length || 0) / Math.log1p(maximum);
          const description2 = coupling2 ? `${edge.members.length} source articles citing one shared reference` : `${edge.members.length} exact members; ${edge.articles?.length || 0} supporting sources`;
          const group = create("g", { "data-combination": edge.id, class: "hyperedge-combination", tabindex: 0, role: "button", "aria-label": description2 + ". Activate for exact members." }, layer);
          create("path", { d: hullPath(points, Math.max(12, ...members.map(radius)) + 5), fill: stroke, "fill-opacity": 0.025 + intensity * 0.055, stroke, "stroke-opacity": intensity, "stroke-width": 1.4, "stroke-linejoin": "round", "pointer-events": "stroke" }, group);
          create("title", {}, group).textContent = description2;
          group.onpointerenter = () => highlight(edge);
          group.onpointerleave = () => highlight(null);
          group.onfocus = () => highlight(edge);
          group.onblur = () => highlight(null);
          const activate = (event) => {
            event.stopPropagation();
            highlight(edge);
            inspect(edge);
          };
          group.onclick = activate;
          group.onkeydown = (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              activate(event);
            }
          };
        }
      }
    };
  }

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
  function methodSupport(graph3) {
    if (graph3._backend === "independent-bnr-standalone" && graph3.importedStandalone) {
      const settings = graph3.clustering || {}, objective = settings.objective;
      if (settings.algorithm !== "leiden" || objective !== "modularity" || graph3.importedStandalone.objective && graph3.importedStandalone.objective !== objective || graph3.directed === true || graph3.networkModel && graph3.networkModel !== "pairwise" || graph3.order != null && graph3.order !== 2) return { supported: false, algorithm: settings.algorithm || "unspecified", objective: objective || "unspecified", reason: "Unsupported retained standalone objective or representation; no native CPM fallback is permitted." };
      return { supported: true, algorithm: "leiden", representation: "pairwise", score: "Modularity", objective: "modularity", label: "Imported Leiden modularity", seed: Number.isSafeInteger(settings.seed) ? settings.seed : null, iterations: Number.isSafeInteger(settings.iterations) && settings.iterations > 0 ? settings.iterations : null, parameters: ["seed", "iterations"], execution: "retained-standalone-import", nativeRecomputation: false, evidenceResampling: false, wholeHyperedgeRoles: false, constructionComparison: false, marginNull: false, reminingAudit: false, semanticSensitivity: false, collaborationSensitivity: false };
    }
    if (graph3.collaboration && (!["author", "institution", "country"].includes(graph3.collaboration.kind) || graph3.entityKind !== graph3.collaboration.kind || graph3.networkModel !== "pairwise" || graph3.order !== 2 || graph3.clustering?.algorithm !== "leiden" || !["full-pair", "fractional-pair"].includes(graph3.collaboration.counting))) return { supported: false, reason: "Unknown collaboration actor construction/search. Only declared pairwise Leiden CPM is implemented." };
    if (graph3.semantic && (!["terms", "topics", "embeddings"].includes(graph3.semantic.kind) || graph3.networkModel !== "pairwise" || graph3.clustering?.algorithm !== "leiden")) return { supported: false, reason: "Unknown or unsupported semantic construction/search. Semantic views currently use pairwise Leiden CPM." };
    const history = graph3.directed === true || graph3.method === "direct_citation" || graph3.canvasKind === "historiography";
    const declared = graph3.clustering?.algorithm;
    const algorithm3 = history ? "direct_citation" : graph3.trial ? "trial" : declared === "Leiden CPM" ? "leiden" : declared;
    const representation = history ? "directed" : graph3.networkModel === "hypergraph" || algorithm3 === "hypergraph" ? "hypergraph" : graph3.networkModel === "higher-order" || graph3.order === "all" || Number(graph3.order) > 2 ? "higher-order" : "pairwise";
    const entry = METHOD_REGISTRY[algorithm3];
    if (graph3.networkModel && !["pairwise", "hypergraph", "higher-order", ...history ? ["direct-citation"] : []].includes(graph3.networkModel)) return { supported: false, algorithm: algorithm3, representation: graph3.networkModel, reason: "Unknown network representation." };
    if (!entry) return { supported: false, algorithm: algorithm3 || "unspecified", representation, reason: "Unknown or unspecified method. No algorithm fallback is permitted." };
    if (!entry.representations.includes(representation)) return { supported: false, algorithm: algorithm3, representation, reason: "This score/search does not support the selected representation." };
    if (algorithm3 === "trial" && !["spectral", "aon", "balanced", "local", "categorical"].includes(graph3.trial?.result?.family)) return { supported: false, algorithm: algorithm3, representation, reason: "Unknown experimental family." };
    if (algorithm3 === "hypergraph" && (!["linear", "majority", "quadratic", "strict"].includes(graph3.clustering?.hypergraphObjective || "linear") || !["mixed", "leiden-seeded", "group-moves", "annealing"].includes(graph3.clustering?.hypergraphSearch || "mixed"))) return { supported: false, algorithm: algorithm3, representation, reason: "Unknown direct hypergraph objective or search." };
    return { supported: true, algorithm: algorithm3, representation, ...entry, evidenceResampling: !graph3.collaboration && !graph3.temporalSelection && !graph3.semantic && entry.evidenceResampling, wholeHyperedgeRoles: false, constructionComparison: !graph3.collaboration && !graph3.temporalSelection && !graph3.semantic && !history && representation === "pairwise", marginNull: !graph3.collaboration && !graph3.temporalSelection && !graph3.semantic && !history && representation === "pairwise", reminingAudit: false, semanticSensitivity: !!graph3.semantic, collaborationSensitivity: !!graph3.collaboration };
  }
  var hasText = (value) => typeof value === "string" && value.trim() && !/^https?:\/\/openalex\.org\//i.test(value.trim());
  function evidenceCoverage(records4 = [], options = {}) {
    const works = Array.isArray(records4) ? records4 : Object.values(records4 || {}), count = works.length;
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
  function scientificInputs(graph3, records4 = [], context2 = {}) {
    const evidence = (Array.isArray(records4) ? records4 : Object.values(records4 || {})).map((work) => ({ id: work.id, references: sorted(work.references || work.referenced_works), year: work.publication_year ?? work.year ?? null, publicationDate: work.publication_date || null, variants: sorted(work.variants || work.sourceIds || [work.id]) })).sort((left, right) => left.id.localeCompare(right.id));
    const text = { sources: (Array.isArray(records4) ? records4 : Object.values(records4 || {})).map((work) => ({ id: work.id, title: work.display_name || work.title || null, abstract: work.abstract || work.abstract_inverted_index || null, topics: work.topics || null })).sort((left, right) => left.id.localeCompare(right.id)), analyzedNodes: graph3.nodes.map((node2) => ({ id: node2.id, title: node2.title || node2.label || null, abstract: node2.abstract || node2.abstract_inverted_index || null })).sort((left, right) => left.id.localeCompare(right.id)) };
    const nodes = graph3.nodes.map((node2) => ({ id: node2.id, references: sorted(node2.references), articles: sorted(node2.articles), cluster: node2.cluster ?? null })).sort((left, right) => left.id.localeCompare(right.id));
    const directed = graph3.directed === true || graph3.method === "direct_citation" || graph3.canvasKind === "historiography";
    const links = graph3.links.map((edge) => {
      const ends = directed ? [edge.source, edge.target] : [edge.source, edge.target].sort();
      return { source: ends[0], target: ends[1], rawSupport: Object.hasOwn(edge, "rawSupport") ? edge.rawSupport : edge.count ?? null, weight: edge.strength ?? edge.weight ?? 1, articles: sorted(edge.articles), references: sorted(edge.references) };
    }).sort((left, right) => canonicalScience(left).localeCompare(canonicalScience(right)));
    const hyperedges = (graph3.hyperedges || []).map((edge) => ({ members: sorted(edge.members), articles: sorted(edge.articles), reference: edge.reference || null, weight: edge.weight, support: edge.support ?? edge.articles?.length ?? null })).sort((left, right) => canonicalScience(left).localeCompare(canonicalScience(right)));
    return { version: SCIENCE_VERSION, evidence, text, network: { nodes, links, hyperedges, directed, method: graph3.method || graph3.canvasKind || "cocitation", order: graph3.order ?? 2, maximumOrder: graph3.maximumOrder ?? null, threshold: graph3.threshold ?? null, minimumSupport: graph3.minimumSupport ?? graph3.minimumShared ?? null, minimumCosine: graph3.minimumCosine ?? null, normalization: graph3.normalization || context2.normalization || "Legacy definition; inspect source analysis", counting: graph3.construction?.counting || graph3.counting || context2.counting || "Legacy definition; inspect source analysis", metric: graph3.metric || null }, settings: { ...graph3.clustering, collaboration: graph3.collaboration || null, semantic: graph3.semantic || null, temporal: graph3.temporalSelection || graph3.temporalSeries?.settings || null, bursts: graph3.burstReport?.settings || null, temporalImplementation: graph3.temporalSeries?.implementationVersion || graph3.temporalSeries?.version || null, burstImplementation: graph3.burstReport?.implementationVersion || graph3.burstReport?.version || null, resolution: graph3.resolution ?? null, trial: graph3.trial?.result?.settings || null, history: graph3.historiography?.settings || null }, identity: graph3.deduplication || context2.identity || null, versions: context2.versions || { implementation: "Legacy/unverified; not eligible for equivalent-computation reuse" } };
  }
  async function createScientificManifest(graph3, records4 = [], context2 = {}) {
    const previous = graph3.scientificManifest;
    context2 = { evidenceId: previous?.evidence?.id || graph3.evidenceId || null, retrievedAt: previous?.evidence?.retrievedAt || graph3.retrievedAt || null, retrieval: previous?.evidence?.retrieval || graph3.retrieval || null, completeness: previous?.evidence?.completeness, versions: previous?.versions, textVersions: previous?.dependencies?.textVersions, ...graph3.evidenceProvenance, ...context2 };
    const input = scientificInputs(graph3, records4, context2), support = methodSupport(graph3);
    const [evidence, text, network, analysis] = await Promise.all([scienceDigest({ evidence: input.evidence, identity: input.identity }), scienceDigest({ text: input.text, versions: context2.textVersions || null }), scienceDigest({ network: { ...input.network, nodes: input.network.nodes.map(({ cluster, ...node2 }) => node2) }, versions: input.versions }), scienceDigest(input)]);
    return { version: SCIENCE_VERSION, createdAt: (/* @__PURE__ */ new Date()).toISOString(), fingerprints: { algorithm: "SHA-256", evidence, text, network, analysis, eligibility: "Audit fingerprints only. Server authorization, dependency versions and scope decide shared reuse." }, evidence: { id: context2.evidenceId || graph3.evidenceId || null, retrievedAt: context2.retrievedAt || graph3.retrievedAt || null, retrieval: context2.retrieval || graph3.retrieval || null, completeness: context2.completeness || "Unknown unless recorded by retrieval", coverage: evidenceCoverage(records4) }, method: support, construction: { ...input.network, nodes: void 0, links: void 0, hyperedges: void 0, nodesCount: input.network.nodes.length, linksCount: input.network.links.length, hyperedgesCount: input.network.hyperedges.length, rawSupportMeaning: graph3._backend === "independent-bnr-standalone" && graph3.importedStandalone ? graph3.construction?.method === "bibliographic_coupling" ? "Distinct shared references for each imported bibliographic-coupling edge, not supporting source records." : graph3.construction?.method === "semantic_embeddings" ? "Not defined for imported semantic edges: rawSupport is null. Edge weight is the retained MiniLM cosine, not citation evidence or a count of supporting records." : "Imported raw-support semantics are not specified here; inspect the original construction and retained report." : "Distinct supporting records. Weighted bootstrap multiplicities and fractional contributions are different quantities." }, settings: input.settings, identity: input.identity, versions: input.versions, dependencies: { textVersions: context2.textVersions || null, descriptions: "Generated descriptions require their model, prompt, text evidence and sibling memberships; these audit hashes alone do not authorize reuse." }, humanInterpretation: { status: "Not established by mathematical checks", aiDescriptions: "Suggested summaries, not evidence of thematic validity." } };
  }
  function validationDimensions(graph3, coverage, roleResult = null) {
    if (graph3.collaboration) {
      const audit = graph3.collaborationSensitivity, metadata = graph3.collaboration.coverage;
      return [{ id: "evidence", label: "Evidence quality", status: "coverage-recorded", outcome: metadata.retainedAuthorshipLists + "/" + metadata.records + " retained authorship lists; " + metadata.potentiallyTruncatedLists + " reported truncation flags; " + metadata.reportedAuthorCountsUnknown + " author counts unknown. " + metadata.completeness }, { id: "solver", label: "Calculation", status: methodSupport(graph3).supported ? "completed" : "unsupported", outcome: "Three seeded Leiden CPM fits of the declared collaboration projection; no global optimum/social-validity guarantee." }, { id: "robustness", label: "Structural robustness", status: "not-assessed", outcome: "No per-cluster collaboration recovery rating. Citation resampling is not applicable." }, { id: "construction", label: "Construction sensitivity", status: audit?.completed > 0 ? "assessed" : audit ? "unavailable" : "not-assessed", outcome: audit ? audit.completed + "/" + audit.attempted + " alternatives completed. " + audit.limitation : "Counting/team/affiliation alternatives and human-audited identity scenarios are separate from citation checks." }, { id: "null", label: "Statistical baseline", status: "not-implemented", outcome: "No work\u2013actor bipartite statistical null model is implemented. Construction sensitivity is not significance." }, { id: "interpretation", label: "Researcher interpretation", status: "needs-review", outcome: graph3.collaboration.limitations }];
    }
    const support = methodSupport(graph3), result = graph3.reliability, nullAudit = graph3.scienceAudit?.null;
    const semanticState = graph3.semanticSensitivity?.completed > 0 ? graph3.semanticSensitivity.status === "partial" ? "partial" : "assessed" : graph3.semanticSensitivity ? "unavailable" : "not-assessed";
    return [
      { id: "evidence", label: "Evidence quality", status: coverage.records ? "coverage-recorded" : "unavailable", outcome: coverage.records ? coverage.withReferences + " of " + coverage.records + " records have available references; completeness unknown." : "No source records supplied; coverage cannot be established." },
      { id: "solver", label: "Calculation", status: !support.supported ? "unsupported" : graph3.trial?.result?.converged === false || graph3.clustering?.converged === false ? "limit-reached" : graph3.trial?.result?.converged === true || graph3.clustering?.converged === true ? "completed" : "not-reported", outcome: !support.supported ? support.reason : "Numerical/search completion is not structural stability or global optimality." },
      { id: "robustness", label: "Structural robustness", status: graph3.semantic ? semanticState : result ? result.preliminary ? "preliminary" : "assessed" : "not-assessed", outcome: graph3.semantic ? graph3.semanticSensitivity ? graph3.semanticSensitivity.completed + " of " + graph3.semanticSensitivity.attempted + " attempted variants assessed. " + graph3.semanticSensitivity.limitation : "Text/threshold sensitivity has not been checked. Citation resampling is not applicable to this semantic representation." : result ? result.samples + " evidence resamples. Optimization variability is included unless assessed separately. " + (result.limitations || "") : "Evidence resampling has not completed." },
      { id: "construction", label: "Construction sensitivity", status: graph3.semantic ? semanticState : graph3.scienceAudit?.construction ? "assessed" : "not-assessed", outcome: graph3.semantic ? graph3.semanticSensitivity?.completed > 0 ? "Bounded feature/text/threshold alternatives compared. The cached model stays fixed; this is not model-general robustness." : "No successful semantic comparison yet. Use the text & threshold check; failed variants do not count as evidence. Citation counting/normalization comparisons do not apply." : graph3.scienceAudit?.construction ? "Alternative connection definitions compared; inspect memberships and coverage, not incompatible objective scores." : "Counting, normalization and threshold alternatives have not been compared." },
      { id: "null", label: "Statistical baseline", status: graph3.semantic ? "not-implemented" : nullAudit?.status || "not-assessed", outcome: graph3.semantic ? "No semantic statistical null model is implemented. Citation-margin randomization is not applicable. Sensitivity does not establish significance." : nullAudit?.limitation || "No completed margin-preserving null-model assessment. Stability is not statistical significance." },
      { id: "interpretation", label: "Researcher interpretation", status: "needs-review", outcome: "AI names and role labels are suggestions, not validation of themes, relevance or quality." }
    ];
  }

  // scripts/current-study.mjs
  function currentStudySummary(packet, graph3, articles, display = {}) {
    const records4 = Array.isArray(articles) ? articles : Object.values(articles || {}), manifest = graph3?.scientificManifest, provenance = graph3?.evidenceProvenance || {}, construction = manifest?.construction || {}, nodes = graph3?.nodes || [], links = graph3?.links || [];
    const evidenceId = provenance.evidenceId || manifest?.evidence?.id || packet?.evidence?.evidenceId || null;
    const retrievedAt = provenance.retrievedAt || manifest?.evidence?.retrievedAt || packet?.evidence?.retrievedAt || null;
    return { corpus_id: packet?.corpusId || packet?.evidence?.sourceCorpusId || null, project_id: packet?.projectId || null, search_id: packet?.searchId || null, name: packet?.name || null, source_corpus_size: records4.length, preset: packet?.preset || null, eligibility_counts: packet?.counts || null, eligibility_counts_scope: packet?.counts ? "Recorded preset decisions; these may precede identity cleanup" : null, created_at: graph3?.computedAt || graph3?.createdAt || null, manifest_created_at: manifest?.createdAt || null, evidence: { id: evidenceId, retrievedAt, retrieval: provenance.retrieval || manifest?.evidence?.retrieval || null, completeness: provenance.completeness || manifest?.evidence?.completeness || "Unknown unless recorded by retrieval" }, coverage: evidenceCoverage(records4, { scope: "Current installed pinned source records; not a display-filtered sample" }), analyses: [{ analysis_id: graph3?.analysisId || null, result_id: graph3?._resultId || null, method: graph3?.method || graph3?.canvasKind || null, entity_kind: graph3?.entityKind || (graph3?.canvasKind === "coupling" || graph3?.method === "coupling" ? "source" : graph3?.directed ? "work" : "cited-work"), threshold: graph3?.threshold ?? null, minimum_support: graph3?.minimumSupport ?? graph3?.minimumShared ?? null, order: graph3?.order ?? null, maximum_order: graph3?.maximumOrder ?? null, normalization: graph3?.normalization || construction.normalization || null, counting: graph3?.construction?.counting || graph3?.counting || construction.counting || null, clustering: graph3?.clustering || null, nodes: nodes.length, edges: links.length, clusters: new Set(nodes.filter((node2) => node2.cluster > 0).map((node2) => node2.cluster)).size, scope: "Current full analytical graph before display filters", window_sources: graph3?.temporalSelection ? graph3?.temporal?.sourceCount ?? null : null }], display: { nodes: Number.isInteger(display.nodes) ? display.nodes : null, edges: Number.isInteger(display.edges) ? display.edges : null, scope: "Visible graph after display filters; not the full evidence corpus" }, analysis_availability: { retained_bundle_count: Array.isArray(graph3?.bundles) ? graph3.bundles.length : null, higher_order_status: graph3?.order === "all" || Number(graph3?.order) > 2 ? "Current higher-order analysis" : graph3?.bundles?.length ? "Bundles retained with this graph; completeness is not inferred" : "Not established for this graph" }, limitations: ["Topical relevance and thematic validity require researcher review.", "Missing bibliographies and metadata are not evidence of absence.", "Only the current analytical graph is listed; no other project analyses are inferred."] };
  }
  function currentStudyMethod(base, packet, graph3, articles) {
    if (!packet) return base;
    const sourceCount = Array.isArray(articles) ? articles.length : Object.keys(articles || {}).length, construction = graph3?.scientificManifest?.construction || {}, current = { nodes: graph3?.nodes?.length || 0, edges: graph3?.links?.length || 0, threshold: graph3?.threshold ?? null, minimum_support: graph3?.minimumSupport ?? graph3?.minimumShared ?? null, normalization: graph3?.normalization || construction.normalization || null }, method3 = { ...base };
    delete method3.scopes;
    delete method3.default;
    method3.caveat = sourceCount.toLocaleString("en-US") + " pinned source records" + (packet.preset ? " \xB7 " + packet.preset + " metadata preset" : " \xB7 corpus preset not recorded") + ". Topical relevance and bibliography completeness are not established. The full analytical graph contains " + current.nodes + " nodes and " + current.edges + " connections before display filters.";
    if ((graph3.semantic || graph3.collaboration || graph3.canvasKind === "coupling") && base?.caveat) method3.caveat += " " + base.caveat;
    if (!graph3.semantic && !graph3.collaboration && graph3.method !== "direct_citation" && graph3.canvasKind !== "historiography" && graph3.canvasKind !== "coupling") {
      method3.explanation = "Co-citation connections describe references cited together within the selected pinned source corpus." + (current.threshold == null ? " Reference frequency cutoff is not recorded." : " Reference frequency cutoff: " + current.threshold + " source articles.") + (current.minimum_support == null ? " Joint support cutoff is not recorded." : " Minimum joint support: " + current.minimum_support + " distinct source articles.") + " Higher-order evidence is available only when retained with this analysis; display filters do not rebuild the network.";
      method3.weight = "Analytical weighting: " + (current.normalization || "not recorded; inspect this analysis") + ". Raw support counts distinct source articles separately from analytical weights.";
      if (graph3.networkModel === "hypergraph" || graph3.clustering?.algorithm === "hypergraph") method3.weight = (graph3.clustering?.method || graph3.clustering?.objective || "The declared hypergraph incidence/whole-group model defines the analytical score.") + " " + (graph3.clustering?.limitations || "Pairwise lines do not define the whole-group analytical objective.") + " Raw support remains distinct source evidence.";
      else if (graph3.metric?.definition) method3.weight = graph3.metric.definition + " Normalization: " + (current.normalization || "not recorded") + ". Raw support remains distinct source evidence.";
      method3.group = { leiden: "Leiden community", "Leiden CPM": "Leiden community", infomap: "Infomap community", hypergraph: "Hypergraph community", sbm: "Block-model group", trial: "Experimental group" }[graph3.clustering?.algorithm] || "Analysis group";
    }
    return method3;
  }

  // scripts/saved-canvas.mjs
  var record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  function prepareCanvasSnapshot(snapshot, options = {}) {
    const seen = /* @__PURE__ */ new Set();
    function validate(session, depth) {
      if (depth > 8 || seen.has(session)) throw Error("The saved view has an invalid parent hierarchy.");
      if (!record(session) || !record(session.graph) || !Array.isArray(session.graph.nodes) || !Array.isArray(session.graph.links) || !record(session.controls) || !record(session.state) || !record(session.texts)) throw Error("The saved view is missing required graph, controls or display state. The current study was not changed.");
      seen.add(session);
      if (options.corpusId && session.evidenceCorpusId && session.evidenceCorpusId !== options.corpusId) throw Error("The saved view and evidence belong to different corpora.");
      if (options.corpusId && session.graph.sourceCorpusId && session.graph.sourceCorpusId !== options.corpusId) throw Error("The saved graph and evidence belong to different corpora.");
      for (const value of Object.values(session.controls)) if (!record(value)) throw Error("The saved view contains invalid control state.");
      if (session.reference != null) validate(session.reference, depth + 1);
    }
    validate(snapshot, 0);
    const prepared = structuredClone(snapshot);
    function normalize(session) {
      session.hiddenClusters = new Set(session.hiddenClusters || []);
      session.filteredClusters = session.filteredClusters ? new Set(session.filteredClusters) : null;
      if (options.completedBrowse) session.graph.linkedBrowse = true;
      if (session.reference) normalize(session.reference);
    }
    normalize(prepared);
    return prepared;
  }
  function validateCanvasPacket(packet) {
    if (packet === null) return;
    if (!record(packet) || typeof packet.corpusId !== "string" || !record(packet.evidence) || !Array.isArray(packet.evidence.articles) || packet.evidence.sourceCorpusId !== packet.corpusId) throw Error("The saved evidence packet is incomplete or belongs to a different corpus. The current study was not changed.");
  }

  // scripts/evidence-navigation.mjs
  function revealSection(target, always = false) {
    if (!target) return;
    window.atlasWorkspaceShell?.reveal(target);
    target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
    const bounds = target.getBoundingClientRect();
    if (always || bounds.top < 0 || bounds.top > window.innerHeight - 100) target.scrollIntoView({ behavior: "auto", block: "start" });
  }

  // scripts/coupling-foundations.mjs
  function clusterFoundations(nodes, cluster) {
    const members = [...new Map(nodes.filter((node2) => Number(node2.cluster) === Number(cluster) && Number(cluster) > 0).map((node2) => [node2.id, node2])).values()];
    const citations = /* @__PURE__ */ new Map();
    for (const article of members) for (const reference of new Set(article.references || [])) {
      if (!citations.has(reference)) citations.set(reference, []);
      citations.get(reference).push(article.id);
    }
    const references = [...citations].filter(([, sources]) => sources.length >= 2).map(([id, sources]) => ({ id, sources: sources.sort(), count: sources.length, share: sources.length / members.length }));
    references.sort((left, right) => right.count - left.count || left.id.localeCompare(right.id));
    return { cluster: Number(cluster), members: members.length, withReferences: members.filter((article) => article.references?.length).length, references };
  }

  // scripts/shared-canvas.mjs
  var COUPLING_METHOD = {
    title: "Bibliographic coupling",
    node: "Source article",
    plural: "source articles",
    group: "Coupling cluster",
    size: "Available references",
    edge: "Shared references",
    question: "Which source articles share a research foundation?",
    explanation: "Articles are connected when their reference lists overlap. Clusters group source articles\u2014not the cited works in the co-citation map.",
    weight: "Clustering uses cosine similarity: shared references divided by the geometric mean of the two reference-list lengths. Line intensity shows shared-reference count; strongest-line filtering uses cosine similarity.",
    caveat: "Available reference lists may be incomplete. Shared references and cluster membership do not establish relevance, agreement, or research quality."
  };
  function couplingNodeRadius(referenceCount, scale, zoom) {
    return Math.max(0.7, Math.min(22, (4 + Math.sqrt(Math.max(0, referenceCount)) * scale / 12) * zoom));
  }
  function couplingCanvasGraph(source, scopeLabel = "All conservative source articles") {
    const graph3 = structuredClone(source || { nodes: [], links: [], minimumShared: 3, minimumCosine: 0.05, resolution: null });
    const degrees = new Map(graph3.nodes.map((node2) => [node2.id, 0]));
    for (const edge of graph3.links) for (const id of [edge.source, edge.target]) degrees.set(id, (degrees.get(id) || 0) + 1);
    graph3.nodes = graph3.nodes.map((node2, position) => ({
      ...node2,
      label: node2.title || node2.id,
      key: node2.id,
      citations: new Set(node2.references || []).size,
      degree: degrees.get(node2.id),
      articles: [],
      variants: node2.variants || [],
      rules: node2.rules || [],
      x: Math.cos(position * 2.399963229728653) * 40 * Math.sqrt(position + 1),
      y: Math.sin(position * 2.399963229728653) * 40 * Math.sqrt(position + 1)
    }));
    const foundations = new Map([...new Set(graph3.nodes.map((node2) => node2.cluster).filter((cluster) => cluster > 0))].map((cluster) => [cluster, clusterFoundations(graph3.nodes, cluster)]));
    for (const node2 of graph3.nodes) {
      const group = foundations.get(node2.cluster), references = new Set(node2.references || []), foundation = group?.references.find((reference) => references.has(reference.id));
      node2.foundation = foundation ? { id: foundation.id, count: foundation.count, share: foundation.share, members: group.members } : null;
    }
    return {
      ...graph3,
      canvasKind: "coupling",
      method: "coupling",
      scopeLabel,
      order: 2,
      minimumSupport: graph3.minimumShared,
      clustering: { ...graph3.clustering, label: "Coupling \xB7 " + (graph3.clustering?.label || "Leiden CPM") },
      stats: { nodes: graph3.nodes.length, edges: graph3.links.length, clusters: new Set(graph3.nodes.map((node2) => node2.cluster).filter((cluster) => cluster > 0)).size, isolated_nodes: graph3.nodes.filter((node2) => !node2.degree).length }
    };
  }

  // scripts/cluster-visibility.mjs
  function clusterSizeFilter(nodes, value = 1) {
    const numeric = Number(value), minimum = Number.isFinite(numeric) ? Math.max(1, Math.ceil(numeric)) : 1;
    const counts = /* @__PURE__ */ new Map();
    for (const node2 of nodes) {
      const cluster = Number(node2.cluster);
      counts.set(cluster, (counts.get(cluster) || 0) + 1);
    }
    const hiddenClusters = new Set([...counts].filter(([cluster, count]) => cluster > 0 && count < minimum).map(([cluster]) => cluster));
    return { minimum, counts, hiddenClusters };
  }
  function hasObservedLinks(node2, edges = []) {
    return Number.isFinite(node2.degree) ? node2.degree > 0 : edges.some((edge) => edge.source === node2.id || edge.target === node2.id);
  }

  // scripts/trial-reliability-client.mjs
  function startTrialReliability(graph3, samples, progress) {
    const worker2 = new Worker("hypergraph-trials-worker.js?v=coupling-errors-2");
    let rejectJob;
    const promise = new Promise((resolve, reject) => {
      rejectJob = reject;
      worker2.onmessage = (event) => {
        const message = event.data;
        if (message.progress) {
          progress(message.progress);
          return;
        }
        worker2.terminate();
        if (Object.hasOwn(message, "error")) reject(new Error(analysisErrorMessage(message.error)));
        else resolve(message.audit);
      };
      worker2.onerror = (event) => {
        worker2.terminate();
        reject(new Error(analysisErrorMessage(event)));
      };
      worker2.postMessage({ action: "check", graph: graph3, bundles: graph3.bundles, articles: window.ATLAS_DATA.articles, options: graph3.trial.result.settings, result: graph3.trial.result, samples });
    });
    return { promise, cancel() {
      worker2.terminate();
      rejectJob(new Error("Reliability check cancelled."));
    } };
  }

  // scripts/method-settings.mjs
  var SETTINGS_VERSION = 3;
  function settingsAlgorithm(graph3) {
    const declared = graph3?.clustering?.algorithm, algorithm3 = declared === "Leiden CPM" ? "leiden" : declared;
    return ["leiden", "infomap", "hypergraph"].includes(algorithm3) ? algorithm3 : null;
  }
  var isCouplingGraph = (graph3) => graph3.method === "coupling" || graph3.canvasKind === "coupling";
  function recoveryMetrics(report) {
    const clusters = Object.values(report.clusters), total = clusters.reduce((sum, cluster) => sum + cluster.size, 0);
    return { recovery: clusters.reduce((sum, cluster) => sum + cluster.size * cluster.meanJaccard, 0) / Math.max(1, total), retention: clusters.reduce((sum, cluster) => sum + cluster.size * cluster.meanRetention, 0) / Math.max(1, total) };
  }
  function materializeSetting(graph3, candidate) {
    if (graph3.collaboration) throw Error("Collaboration settings must rebuild their declared work\u2013actor projection.");
    const { memberships, ...metadata } = candidate.partition;
    const nodes = graph3.nodes.map((node2) => ({ ...node2, cluster: memberships[node2.id] || 0 }));
    const clusters = new Set(Object.values(memberships)).size;
    return invalidateScientificOutputs({
      ...graph3,
      nodes,
      analysisId: null,
      derivedFromAnalysisId: graph3.analysisId || graph3.derivedFromAnalysisId,
      resolution: candidate.settings.resolution ?? null,
      autoCPM: null,
      comparison: null,
      themeDescriptions: null,
      clustering: { ...metadata, ...candidate.settings, networkModel: graph3.networkModel, algorithm: candidate.algorithm, label: (candidate.algorithm === "leiden" ? "Leiden CPM" : candidate.algorithm === "infomap" ? "Infomap" : "Hypergraph modularity") + (graph3.networkModel === "hypergraph" && candidate.algorithm !== "hypergraph" ? isIncidenceModel(graph3) ? " \xB7 hypergraph incidence" : " \xB7 hypergraph legacy projection" : ""), limitations: graph3.networkModel === "hypergraph" && candidate.algorithm !== "hypergraph" ? isIncidenceModel(graph3) ? HYPERGRAPH_INCIDENCE : HYPERGRAPH_PROJECTION : metadata.limitations, clusters, communities: clusters },
      reliability: candidate.validation || candidate.screening || null,
      sourceReliability: candidate.sourceValidation || null,
      stats: { ...graph3.stats, clusters, isolated_nodes: nodes.filter((node2) => !node2.cluster).length }
    });
  }

  // scripts/canvas-settings.mjs
  var records2 = /* @__PURE__ */ new WeakMap();
  var graph2;
  var articleIds;
  var bundles;
  var panel2;
  var job2;
  var generation2 = 0;
  var autoTimer;
  var badge;
  if (typeof window !== "undefined") window.addEventListener?.("atlas:navigation-state", () => {
    if (!automaticNavigationAllowed(graph2)) cancelCanvasSettings();
  });
  function settingsValidationState(current) {
    const record3 = records2.get(current);
    return record3?.running ? "running" : automaticSettingsPending(current) && !record3?.autoAttempted && !window.BIBLIOMAP?.active ? "queued" : "idle";
  }
  function settingsBadgeLabel(phase, record3 = {}) {
    if (phase === "running") return "Auto settings \xB7 testing\u2026";
    if (record3.report) return record3.report.recommendation.chosen ? "Auto settings \xB7 stable range" : record3.report.compareObjectives ? "Settings \xB7 objective comparison" : "Auto settings \xB7 no clear recommendation";
    if (phase === "queued") return "Auto settings \xB7 queued";
    return record3.autoAttempted ? "Auto settings \xB7 stopped / retry" : "Auto settings \xB7 not run";
  }
  var element2 = (tag, text = "") => {
    const node2 = document.createElement(tag);
    node2.textContent = text;
    return node2;
  };
  var percent = (value) => Number.isFinite(value) ? (100 * value).toFixed(0) + "%" : "\u2014";
  var decimal = (value) => Number.isFinite(value) ? value.toFixed(2) : "\u2014";
  var method = () => ({ leiden: "Leiden CPM", infomap: "Infomap", hypergraph: "Hypergraph" })[settingsAlgorithm(graph2)] + (graph2.networkModel === "hypergraph" && settingsAlgorithm(graph2) !== "hypergraph" ? isIncidenceModel(graph2) ? " \xB7 incidence" : " \xB7 legacy projection" : "");
  var pending = () => document.getElementById("clusteringMethod").value !== settingsAlgorithm(graph2) || document.getElementById("networkModel")?.value === "hypergraph" !== (graph2.networkModel === "hypergraph" || settingsAlgorithm(graph2) === "hypergraph") || settingsAlgorithm(graph2) === "hypergraph" && ["mixed", "leiden-seeded", "group-moves", "annealing"].includes(document.getElementById("clusteringSearch")?.value) && document.getElementById("clusteringSearch").value !== (graph2.clustering?.hypergraphSearch || "mixed");
  function cancelCanvasSettings() {
    clearTimeout(autoTimer);
    generation2++;
    job2?.cancel();
    job2 = null;
    const record3 = records2.get(graph2);
    if (record3 && (record3.running || !record3.autoAttempted && automaticSettingsPending(graph2))) {
      record3.running = false;
      record3.autoAttempted = true;
      record3.status = "Cancelled. Incomplete search results are not reported.";
      draw2();
    }
  }
  function syncCanvasSettings(next, ids, sourceBundles) {
    if (!panel2) {
      panel2 = element2("details");
      panel2.id = "canvasSettings";
      panel2.className = "canvas-reliability";
      document.querySelector(".community-controls").after(panel2);
      badge = element2("button");
      badge.id = "autoSettingsStatus";
      badge.type = "button";
      badge.className = "secondary";
      badge.style.cssText = "font-size:12px;padding:4px 9px;min-height:30px;margin:0 0 8px";
      document.getElementById("methodTitle").after(badge);
      badge.onclick = () => {
        panel2.open = true;
        revealSection(panel2, true);
      };
    }
    if (graph2 === next) {
      if (pending()) draw2();
      return;
    }
    cancelCanvasSettings();
    graph2 = next;
    articleIds = ids;
    bundles = sourceBundles;
    if (!records2.has(graph2)) records2.set(graph2, { report: graph2.settingsSearch || null, sensitivity: graph2.evidenceSensitivity || null, source: graph2.sourceReliability || null, status: "", running: false, autoAttempted: false });
    draw2();
    const selected = graph2, record3 = records2.get(graph2);
    if (automaticSettingsPending(graph2) && !record3.autoAttempted && !pending() && !window.BIBLIOMAP?.active) {
      autoTimer = setTimeout(() => {
        if (graph2 === selected && automaticNavigationAllowed(graph2) && !pending()) {
          record3.autoAttempted = true;
          run2("auto");
        }
      }, 1200);
    }
  }
  function automaticSettingsPending(current) {
    if (!automaticNavigationAllowed(current)) return false;
    if (current?.linkedBrowse || current?.collaboration || current?.semantic || current?.temporalSelection || current?.temporalSeries) return false;
    if (current?.trial || typeof window !== "undefined" && window.ATLAS_TRIAL_WORKSPACE) return false;
    return (isIncidenceModel(current || {}) || current?.clustering?.algorithm === "hypergraph") && current.clustering?.algorithm !== "sbm" && !current.appliedSettings && current.settingsSearch?.version !== SETTINGS_VERSION;
  }
  function action(parent, title, callback, disabled = false) {
    const button4 = element2("button", title);
    button4.type = "button";
    button4.className = "secondary";
    button4.disabled = disabled;
    button4.onclick = callback;
    parent.append(button4);
    return button4;
  }
  async function run2(kind) {
    if (!navigationReady(graph2)) return;
    if (graph2?.collaboration || graph2?.semantic || graph2?.temporalSelection) return;
    if (pending()) return;
    window.ATLAS_EVIDENCE.cancelCanvasReliability();
    const selected = graph2, record3 = records2.get(graph2), ticket = ++generation2;
    record3.autoAttempted = true;
    record3.running = true;
    record3.status = "Preparing " + method() + " analysis\u2026";
    draw2();
    try {
      await loadCommunities();
      if (ticket !== generation2 || !navigationReady(selected)) return;
      const progress = (message) => {
        if (ticket === generation2) {
          record3.status = message;
          panel2.dataset.validationStatus = message;
          panel2.querySelector("[role=status]").textContent = message;
        }
      };
      const evidence = structuredClone({ ...graph2, bundles });
      job2 = kind === "sources" ? window.ATLAS_COMMUNITIES.startReliability(evidence, articleIds, 10, progress, { mode: "sources", seedOffset: 2e3 }) : window.ATLAS_COMMUNITIES.startSettings(evidence, articleIds, kind, progress);
      const result = await job2.promise;
      if (ticket !== generation2 || selected !== graph2) return;
      if (kind === "sources") {
        record3.source = result;
        graph2.sourceReliability = result;
      } else if (kind === "sensitivity") {
        record3.sensitivity = result;
        graph2.evidenceSensitivity = result;
      } else {
        record3.report = result;
        graph2.settingsSearch = result;
      }
      window.ATLAS_EVIDENCE.recordSettingsAudit?.(graph2);
      const chosen = kind === "auto" && result.recommendation?.chosen ? result.candidates.find((candidate) => candidate.id === result.recommendation.chosen) : null;
      if (chosen?.validation?.samples === 50) {
        record3.running = false;
        job2 = null;
        apply(chosen, true);
        return;
      }
      record3.status = kind === "auto" ? "Auto finished: no setting passed all stable-range safeguards. Current exploratory map retained." : "Complete. The displayed map is unchanged until you apply a setting.";
    } catch (error) {
      if (ticket === generation2) record3.status = "No completed new result: " + analysisErrorMessage(error);
    } finally {
      if (ticket === generation2) {
        record3.running = false;
        job2 = null;
        draw2();
      }
    }
    if (selected === graph2) window.dispatchEvent(new CustomEvent("atlas-settings-settled", { detail: selected }));
  }
  function apply(candidate, automatic = false) {
    if (window.BIBLIOMAP?.active) {
      window.ATLAS_PROJECTS.applyCandidate(candidate);
      return;
    }
    const record3 = records2.get(graph2);
    const next = materializeSetting({ ...graph2, bundles }, candidate);
    next.settingsSearch = record3.report;
    next.evidenceSensitivity = null;
    next.appliedSettings = { id: candidate.id, settings: candidate.settings, validated: !!candidate.validation, automatic, experimental: candidate.algorithm === "hypergraph" };
    window.atlasSharedCanvas.applySettings(next);
  }
  function draw2() {
    if (!graph2 || !panel2) return;
    if (graph2.temporalSelection) {
      badge.hidden = true;
      panel2.dataset.validationMode = "window";
      panel2.dataset.validationRunning = "false";
      panel2.dataset.validationPhase = "idle";
      panel2.dataset.validationOutcome = "";
      panel2.dataset.validationStatus = "";
      panel2.replaceChildren(element2("summary", "Completed temporal window"), element2("p", "Independent fixed-setting window. Change the complete series settings in Time windows; no automatic per-window setting search is applied."));
      return;
    }
    if (graph2.collaboration) {
      badge.hidden = true;
      panel2.dataset.validationMode = "collaboration";
      panel2.dataset.validationRunning = "false";
      panel2.dataset.validationPhase = "idle";
      panel2.dataset.validationOutcome = "";
      panel2.dataset.validationStatus = "";
      panel2.replaceChildren(element2("summary", "Collaboration construction"), element2("p", "Use Collaboration maps for full/fractional counting, institution rollup, team/affiliation evidence and CPM. Citation Auto CPM does not apply."));
      return;
    }
    if (graph2.semantic) {
      badge.hidden = true;
      panel2.dataset.validationMode = "semantic";
      panel2.dataset.validationRunning = "false";
      panel2.dataset.validationPhase = "idle";
      panel2.dataset.validationOutcome = "";
      panel2.dataset.validationStatus = "";
      panel2.replaceChildren(element2("summary", "Semantic construction settings"), element2("p", "Adjust vocabulary, text evidence, topic confidence, cosine or CPM in Semantic maps. Citation Auto CPM and citation resampling are not applied."));
      return;
    }
    delete panel2.dataset.validationMode;
    if (graph2.trial) {
      badge.hidden = true;
      panel2.dataset.validationRunning = "false";
      panel2.dataset.validationPhase = "idle";
      panel2.dataset.validationOutcome = "";
      panel2.dataset.validationStatus = "";
      panel2.replaceChildren(element2("summary", "Trial settings"), element2("p", "Adjust this method in Analysis, then Run trial. Reliability repeats the selected trial on 10 or 50 resamples; it does not choose k or apply Auto CPM."));
      return;
    }
    panel2.dataset.validationRunning = String(!!records2.get(graph2)?.running);
    const validationRecord = records2.get(graph2), recommendation = validationRecord?.report?.recommendation;
    panel2.dataset.validationOutcome = recommendation ? recommendation.chosen ? "Stable range found" : validationRecord.report.compareObjectives ? "Objectives compared" : "No stable range" : "";
    panel2.dataset.validationStatus = validationRecord?.status || "";
    panel2.dataset.validationPhase = settingsValidationState(graph2);
    if (graph2.clustering?.algorithm === "sbm") {
      panel2.replaceChildren(element2("summary", "Block-model settings \xB7 automatic description-length selection"), element2("p", "The nested model selects a hierarchy by minimum description length across three starts. Choose a hierarchy level in Additional analyses. Reliability can rerun this model on resampled evidence. CPM and Markov time do not apply."));
      return;
    }
    const record3 = records2.get(graph2), report = record3.report;
    badge.hidden = !(graph2.networkModel === "hypergraph" || settingsAlgorithm(graph2) === "hypergraph") || graph2.clustering?.algorithm === "sbm";
    badge.textContent = settingsBadgeLabel(panel2.dataset.validationPhase, record3);
    badge.title = "Open settings, progress and stability evidence. Current map stays visible while testing.";
    const active2 = (graph2.appliedSettings?.automatic ? "Auto \xB7 " : "") + (graph2.appliedSettings?.settings.label || (settingsAlgorithm(graph2) === "infomap" ? "Markov time " + (graph2.clustering.markovTime || 1) : settingsAlgorithm(graph2) === "hypergraph" ? (graph2.clustering.hypergraphObjective || "linear") + " \xB7 resolution " + (graph2.clustering.hypergraphResolution ?? 1) : graph2.resolution == null ? "Preparing network" : "CPM " + Number(graph2.resolution.toPrecision(4))));
    panel2.replaceChildren(element2("summary", "Find settings" + (record3.running ? " \xB7 testing\u2026" : report ? " \xB7 results ready" : "")));
    panel2.append(element2("p", method() + " \xB7 " + active2));
    if (pending()) {
      panel2.append(element2("p", "Waiting for the selected clustering method. Previous results cannot be applied."));
      return;
    }
    const controls = element2("div");
    controls.className = "reliability-controls";
    panel2.append(element2("p", "Compare settings; apply a result to update the map."));
    const readOnly = window.BIBLIOMAP?.active && window.BIBLIOMAP.canCompute === false;
    action(controls, report ? "Rerun Auto settings" : "Find stable settings", () => run2("auto"), record3.running || !graph2.links.length || readOnly).id = "validationSettings";
    if (settingsAlgorithm(graph2) === "hypergraph") action(controls, "Compare experimental objectives", () => run2("objectives"), record3.running || !graph2.links.length || readOnly);
    action(controls, "Check evidence sensitivity", () => run2("sensitivity"), record3.running || !graph2.links.length || readOnly);
    if (isCouplingGraph(graph2)) action(controls, "Check source sampling \xB7 10", () => run2("sources"), record3.running || !graph2.links.length || readOnly);
    action(controls, "Cancel", cancelCanvasSettings, !record3.running).hidden = !record3.running;
    panel2.append(controls);
    const status = element2("p", record3.status);
    status.setAttribute("role", "status");
    panel2.append(status);
    const help = element2("details");
    help.append(element2("summary", "What Auto tests & limitations"), element2("p", "Auto keeps the evidence fixed and tests repeat starts, ten source-evidence resamples per setting, and agreement across a tested range. Eligible representatives get 50 fresh resamples. Only a confirmed representative is applied automatically; otherwise the current map stays exploratory. The map remains visible while testing. Cancel stops this search; Rerun starts it again."), element2("p", "Leiden hypergraph sweeps bipartite CPM. Infomap sweeps Markov time (higher means broader groups). Direct hypergraph sweeps an experimental expected-baseline multiplier within the selected objective; 1 preserves the original score. Objective comparison is separate and never picks an automatic winner. Safeguards reject dominant groups and excessive tiny fragments. These are overview preferences, not proof of an optimum or thematic validation."));
    panel2.append(help);
    if (report) {
      const outcome = report.recommendation.chosen ? "A representative passed fresh resampling within a stable tested range. Auto favors a broader overview; inspect alternatives below." : report.compareObjectives ? "These models define a group differently. Compare how well each holds together, then explicitly choose one; no model is declared the winner." : "No stable range met all safeguards. The current map remains exploratory; you can inspect and apply individual settings below.";
      panel2.append(element2("h3", report.recommendation.heading), element2("p", outcome));
      help.append(element2("p", report.recommendation.explanation));
      const chosen = report.candidates.find((candidate) => candidate.id === report.recommendation.chosen);
      if (chosen) action(panel2, "Apply Auto \xB7 " + chosen.settings.label, () => apply(chosen), record3.running || readOnly);
      for (const range of report.recommendation.ranges) panel2.append(element2("p", "Stable tested range: " + range.from.toPrecision(4) + "\u2013" + range.to.toPrecision(4)));
      const details = element2("details");
      details.append(element2("summary", "Compare settings / apply manually"));
      const table = element2("table"), header = element2("tr");
      table.style.minWidth = "850px";
      table.style.tableLayout = "auto";
      for (const label of ["Setting", "Groups", "Coverage", "Start ARI", "Recovery", "Validation", "Safeguards / action"]) header.append(element2("th", label));
      table.append(header);
      for (const candidate of report.candidates) {
        const row = element2("tr");
        for (const value of [candidate.settings.label, candidate.metrics.clusters, percent(candidate.metrics.coverage), decimal(candidate.metrics.startAgreement), percent(candidate.metrics.recovery), candidate.validation ? "50 fresh" : "10 preliminary"]) row.append(element2("td", value));
        const cell = element2("td", candidate.reasons.join("; ") || "Pass heuristics");
        action(cell, "Apply " + candidate.settings.label, () => apply(candidate), record3.running || readOnly);
        row.append(cell);
        table.append(row);
      }
      const wrap = element2("div");
      wrap.className = "evidence-table-wrap";
      wrap.append(table);
      details.append(wrap, element2("p", report.limitations));
      panel2.append(details);
    }
    if (record3.source) {
      const measured = recoveryMetrics(record3.source);
      panel2.append(element2("p", "Source-sample sensitivity: recovery " + percent(measured.recovery) + ", retention " + percent(measured.retention) + ". Ten 90%-source subsamples; intentionally omitted members count as losses. This differs from reference-feature resampling."));
    }
    if (record3.sensitivity) {
      const details = element2("details");
      details.append(element2("summary", "Evidence sensitivity results \xB7 map unchanged"));
      for (const result of record3.sensitivity.results) details.append(element2("p", result.label + " \xB7 " + result.clusters + " groups \xB7 coverage " + percent(result.coverage) + " \xB7 recovery " + percent(result.recovery) + " \xB7 shared-node ARI " + decimal(result.agreement)));
      details.append(element2("p", record3.sensitivity.limitations));
      panel2.append(details);
    }
  }

  // scripts/optimization-variability.mjs
  async function optimizationVariability(graph3, fit, progress = () => {
  }, options = {}) {
    const fits = options.fits ?? 5;
    if (fits !== 5) throw new Error("This diagnostic uses five fixed-evidence fits.");
    const results = [];
    for (let position = 0; position < fits; position++) {
      const seed = 20261019 + position * 101;
      progress("Fixed-evidence fit " + (position + 1) + "/" + fits);
      const result = await fit(structuredClone(graph3), { ...graph3.clustering, resolution: graph3.resolution, trials: 1, seed });
      const memberships = result.memberships || Object.fromEntries(result.nodes.map((node2) => [node2.id, node2.cluster]));
      results.push({ seed, memberships, quality: result.quality ?? result.clustering?.quality ?? null, converged: result.converged ?? result.clustering?.converged ?? null, linked: graph3.nodes.filter((node2) => Number(memberships[node2.id]) > 0).length });
    }
    const similarities = [];
    const labels = (result) => Object.fromEntries(graph3.nodes.map((node2) => [node2.id, Number(result.memberships[node2.id]) > 0 ? String(result.memberships[node2.id]) : "unassigned:" + node2.id]));
    for (let left = 0; left < results.length; left++) for (let right = left + 1; right < results.length; right++) similarities.push(graph3.nodes.length < 2 ? 1 : agreement(labels(results[left]), labels(results[right])));
    return { version: "optimization-variability-v1", fits, evidenceFixed: true, results, agreement: { mean: similarities.reduce((sum, value) => sum + value, 0) / similarities.length, minimum: Math.min(...similarities) }, limitation: "Optimization-only variability on unchanged evidence and settings; distinct seeds, one requested start per fit where supported. Engine-specific fixed initialization budgets remain in force. Agreement uses the full supplied article universe, treating unassigned articles as distinct singletons, not one community. This is not evidence-bootstrap stability, an optimum guarantee, statistical significance or thematic validation." };
  }

  // scripts/canvas-science.mjs
  var recordsByGraph = /* @__PURE__ */ new WeakMap();
  var active;
  var element3 = (tag, text = "") => {
    const node2 = document.createElement(tag);
    node2.textContent = text;
    return node2;
  };
  var button2 = (label, callback) => {
    const node2 = element3("button", label);
    node2.type = "button";
    node2.className = "secondary";
    node2.onclick = callback;
    return node2;
  };
  var paragraphs = (parent, values) => values.filter(Boolean).forEach((value) => parent.append(element3("p", value)));
  var number = (value) => Number.isFinite(value) ? Number(value.toPrecision(4)).toString() : "Not assessed";
  var percent2 = (value) => Number.isFinite(value) ? (100 * value).toFixed(1) + "%" : "Not assessed";
  async function fullEvidence(record3) {
    const packet = await window.ATLAS_EVIDENCE.prepareDataset(), expected = record3.graph.sourceCorpusId || window.ATLAS_DATA?.summary?.corpus_id;
    if (expected && packet.sourceCorpusId !== expected) throw new Error("Source evidence does not match this map.");
    record3.sources = packet.articles;
    record3.fullLoaded = true;
    return packet.articles;
  }
  async function prepareScientificExport(graph3) {
    const record3 = recordsByGraph.get(graph3), sources = record3 ? await fullEvidence(record3) : Object.values(window.ATLAS_DATA?.articles || {});
    graph3.scientificManifest = await createScientificManifest(graph3, sources);
    return graph3.scientificManifest;
  }
  if (typeof window !== "undefined") window.ATLAS_SCIENCE = { prepareExport: prepareScientificExport, cancel: cancelScience };
  function stop(record3) {
    record3.ticket++;
    record3.worker?.terminate();
    record3.worker = null;
    record3.fitting?.cancel();
    record3.fitting = null;
    record3.running = false;
  }
  function cancelScience() {
    if (!active) return;
    const record3 = recordsByGraph.get(active);
    if (record3?.running) {
      stop(record3);
      record3.status.textContent = "Cancelled. No partial audit installed.";
      draw3(record3);
    }
  }
  function workerTask2(record3, kind, options = {}, graph3 = record3.graph) {
    if (window.BIBLIOMAP?.active && kind !== "manifest" && kind !== "fit") {
      const stage = { roles: "scientific-roles", null: "incidence-null", construction: "construction-comparison", roleSensitivity: "role-sensitivity", optimization: "optimization-variability" }[kind];
      record3.fitting = window.BIBLIOMAP.stage(graph3, stage, options, (message) => {
        record3.status.textContent = message;
      });
      return record3.fitting.promise.finally(() => {
        record3.fitting = null;
      });
    }
    return new Promise((resolve, reject) => {
      const worker2 = new Worker("science-worker.js?v=coupling-errors-2");
      record3.worker = worker2;
      worker2.onmessage = (event) => {
        if (record3.worker !== worker2) return;
        if (event.data.progress) {
          record3.status.textContent = event.data.progress;
          return;
        }
        worker2.terminate();
        if (record3.worker === worker2) record3.worker = null;
        Object.hasOwn(event.data, "error") ? reject(new Error(analysisErrorMessage(event.data.error))) : resolve(event.data.result);
      };
      worker2.onerror = (event) => {
        worker2.terminate();
        if (record3.worker === worker2) record3.worker = null;
        reject(new Error(analysisErrorMessage(event)));
      };
      worker2.postMessage({ kind, graph: graph3, records: record3.sources, options });
    });
  }
  async function run3(record3, kind, options = {}) {
    if (record3.running) return;
    if (kind !== "manifest" && (record3.graph.temporalSelection || record3.graph.collaboration?.ego)) {
      record3.status.textContent = "Return to the full pinned map before running an audit. Neighborhood/window browsing does not submit new jobs.";
      return;
    }
    if (kind !== "manifest" && window.BIBLIOMAP?.active && window.BIBLIOMAP.canCompute === false) {
      record3.status.textContent = "View-only project: ask an editor to run an audit.";
      return;
    }
    const ticket = ++record3.ticket;
    record3.running = true;
    draw3(record3);
    record3.status.textContent = "Preparing " + kind + "\u2026";
    try {
      if (kind === "manifest") await fullEvidence(record3);
      let result;
      if (kind === "optimization" && !window.BIBLIOMAP?.active) {
        const support = methodSupport(record3.graph);
        await loadCommunities();
        result = await optimizationVariability(record3.graph, async (candidate, settings) => {
          if (ticket !== record3.ticket) throw new Error("Optimization check cancelled.");
          if (support.algorithm === "leiden") return workerTask2(record3, "fit", { ...settings, algorithm: "leiden" }, candidate);
          record3.fitting = window.ATLAS_COMMUNITIES.start(candidate, support.algorithm, candidate.bundles || [], (message) => {
            if (ticket === record3.ticket) record3.status.textContent = message;
          }, { ...settings, networkModel: candidate.networkModel || "pairwise" });
          const fitted = await record3.fitting.promise;
          record3.fitting = null;
          return fitted;
        }, (message) => {
          record3.status.textContent = message;
        });
      } else result = await workerTask2(record3, kind, options);
      if (ticket !== record3.ticket) return;
      if (kind === "construction" && !window.BIBLIOMAP?.active) {
        await loadCommunities();
        if (ticket !== record3.ticket) return;
        const support = methodSupport(record3.graph), original = Object.fromEntries(record3.graph.nodes.map((node2) => [node2.id, node2.cluster])), comparisons = [];
        for (const [position, candidate] of result.entries()) {
          record3.status.textContent = "Comparing definition " + (position + 1) + "/" + result.length + " with the selected " + support.algorithm + " method\u2026";
          let fitted;
          if (support.algorithm === "leiden") fitted = await workerTask2(record3, "fit", { ...record3.graph.clustering, algorithm: "leiden" }, candidate);
          else {
            record3.fitting = window.ATLAS_COMMUNITIES.start(candidate, support.algorithm, [], (message) => {
              if (record3.ticket === ticket) record3.status.textContent = message;
            }, { ...record3.graph.clustering, resolution: record3.graph.resolution, networkModel: "pairwise" });
            fitted = await record3.fitting.promise;
            record3.fitting = null;
          }
          if (ticket !== record3.ticket) return;
          const recovery = clusterRecovery(original, Object.fromEntries(fitted.nodes.map((node2) => [node2.id, node2.cluster]))), clusterValues = Object.values(recovery), total = clusterValues.reduce((sum, value) => sum + value.size, 0);
          const baseEdges = new Set(record3.graph.links.map((edge) => JSON.stringify([edge.source, edge.target].sort()))), nextEdges = new Set(candidate.links.map((edge) => JSON.stringify([edge.source, edge.target].sort()))), intersection = [...nextEdges].filter((key) => baseEdges.has(key)).length;
          comparisons.push({ definition: candidate.construction, edges: candidate.links.length, clusters: new Set(fitted.nodes.map((node2) => node2.cluster).filter((cluster) => cluster > 0)).size, edgeJaccard: intersection / (baseEdges.size + nextEdges.size - intersection || 1), weightedRecovery: total ? clusterValues.reduce((sum, value) => sum + value.jaccard * value.size, 0) / total : null, recovery, settings: { ...record3.graph.clustering, resolution: record3.graph.resolution }, nonconverged: fitted.clustering?.converged === false });
        }
        result = { version: "construction-comparison-v1", comparisons, limitation: "Construction-and-scale sensitivity at fixed selected settings, not a pure normalization-invariance test. Leiden rescales weights by mean edge weight, but fixed gamma need not imply equivalent effective granularity across weight distributions; no per-definition retuning occurs. Objective values are not compared across definitions. Block-model fits ignore weights. Reference/source universe stays fixed. Higher-order re-mining and ambiguous-identity scenarios are not performed. Recovery is descriptive best-match Jaccard, not chance-adjusted agreement or confidence." };
      }
      if (ticket !== record3.ticket) return;
      if (kind === "manifest") {
        record3.graph.scientificManifest = result;
        const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: "application/json" })), anchor = element3("a");
        anchor.href = url;
        anchor.download = "bibliomap-analysis-manifest.json";
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1e3);
      } else {
        record3.graph.scienceAudit = { ...record3.graph.scienceAudit, [kind]: result };
        if (kind === "roles" || kind === "null") record3[kind] = result;
      }
      record3.status.textContent = kind === "manifest" ? "Manifest exported. Audit fingerprints do not authorize shared computation reuse." : "Completed " + kind + ". The map is unchanged.";
    } catch (error) {
      if (ticket === record3.ticket) record3.status.textContent = "Not completed: " + analysisErrorMessage(error);
    } finally {
      if (ticket === record3.ticket) {
        record3.running = false;
        draw3(record3);
      }
    }
  }
  function drawRoles(record3, host) {
    const result = record3.roles;
    const noun = ["term", "topic", "author", "institution", "country"].includes(record3.graph.entityKind) ? record3.graph.entityKind : "article";
    host.replaceChildren();
    if (!result) {
      host.append(element3("p", "Calculate " + noun + " roles on the full analytical network, not the currently visible subset."));
      return;
    }
    const searchLabel = element3("label", "Find " + noun + (noun === "article" ? " by title or author" : " by label")), search = element3("input");
    search.type = "search";
    search.value = record3.roleQuery || "";
    search.setAttribute("aria-label", "Find " + noun + " in roles");
    searchLabel.append(search);
    const rankLabel = element3("label", "Rank by"), rank = element3("select");
    rank.setAttribute("aria-label", "Rank " + noun + " roles");
    for (const [value, label] of [...result.directed ? [["pageRank", "Citation PageRank"], ["incoming", "Incoming citations"], ["outgoing", "Outgoing citations"]] : [["externalStrength", "Cross-community weight"], ["participation", "Participation"], ["withinClusterZ", "Within-community position"]], ["core", "Core membership"], ...result.paths ? [["betweenness", "Path brokerage"]] : []]) rank.append(new Option(label, value));
    rankLabel.append(rank);
    const list = element3("div");
    if (record3.roleRank && [...rank.options].some((option) => option.value === record3.roleRank)) rank.value = record3.roleRank;
    const redraw = () => {
      record3.roleQuery = search.value;
      record3.roleRank = rank.value;
      const query = search.value.trim().toLowerCase(), selected = record3.graph.nodes.filter((node2) => !query || [node2.title, node2.label, node2.authors, node2.id].filter(Boolean).join(" ").toLowerCase().includes(query)).sort((left, right) => (result.roles[right.id][rank.value] ?? -Infinity) - (result.roles[left.id][rank.value] ?? -Infinity));
      list.replaceChildren();
      for (const node2 of selected.slice(0, 15)) {
        const role = result.roles[node2.id], row = element3("div");
        row.append(button2(node2.title || node2.label || node2.id, () => record3.selectNode?.(node2.id)));
        paragraphs(row, [role.label + " \xB7 " + rank.selectedOptions[0].textContent + ": " + number(role[rank.value]), role.degree + " neighbors \xB7 " + (result.directed ? role.incoming + " incoming / " + role.outgoing + " outgoing" : "external share " + percent2(role.externalShare)) + " \xB7 core " + role.core + (role.degree < 3 ? " \xB7 Few connections: role interpretation is fragile." : "")]);
        list.append(row);
      }
      list.append(element3("p", "Showing " + Math.min(15, selected.length) + " of " + selected.length + " matching " + (noun === "country" ? "countries" : noun + "s") + ". Labels are exploratory structural descriptions, not validated functional roles."));
    };
    search.oninput = redraw;
    rank.onchange = redraw;
    host.append(searchLabel, rankLabel, list);
    paragraphs(host, [result.scope, result.limitations, result.paths ? "Path distance: " + result.paths.distance + "." : "Path brokerage has not been calculated."]);
    redraw();
  }
  function draw3(record3) {
    const coverage = evidenceCoverage(record3.sources), dimensions = validationDimensions(record3.graph, coverage), support = methodSupport(record3.graph);
    if (record3.coverageBody) record3.coverageBody.replaceChildren(element3("p", coverage.withReferences + "/" + coverage.records + " records with references \xB7 " + coverage.titles + " titles \xB7 " + coverage.abstracts + " abstracts \xB7 " + coverage.publicationYears + " publication years. Completeness unknown."), element3("p", coverage.authorshipTruncation), element3("p", coverage.authorCountKnown ? coverage.potentiallyTruncatedAuthorships + " potentially truncated author lists among " + coverage.authorCountKnown + " assessable records; remaining records unknown." : "Potentially truncated author lists: unknown."));
    record3.dimensions.replaceChildren();
    for (const dimension of dimensions) {
      const line = element3("details");
      line.append(element3("summary", dimension.label + " \xB7 " + dimension.status.replaceAll("-", " ")), element3("p", dimension.outcome));
      record3.dimensions.append(line);
    }
    const readOnly = !!record3.graph.temporalSelection || !!record3.graph.collaboration?.ego || window.BIBLIOMAP?.active && window.BIBLIOMAP.canCompute === false;
    record3.runRoles.disabled = record3.running || readOnly;
    record3.runPaths.disabled = record3.running || readOnly;
    record3.manifest.disabled = record3.running;
    record3.construction.disabled = record3.running || readOnly || !support.constructionComparison;
    record3.nullButton.disabled = record3.running || readOnly || !support.marginNull;
    record3.roleSensitivity.disabled = record3.running || readOnly || !support.constructionComparison;
    record3.optimization.disabled = record3.running || readOnly || !support.constructionComparison || !["leiden", "infomap"].includes(support.algorithm);
    record3.cancel.hidden = !record3.running;
    record3.construction.title = support.constructionComparison ? "" : "Available only for supported pairwise co-citation/coupling. No substitute method is run.";
    record3.nullButton.title = support.marginNull ? "" : "Whole-hypergraph and directed null assessments are not implemented here.";
    record3.unsupported.textContent = support.constructionComparison ? "Definition and rank checks are conditional on retained evidence. Optimization-only repeats currently support pairwise Leiden and Infomap." : "Connection-definition, role-resampling and margin-null comparisons currently support pairwise co-citation/coupling only. They do not substitute another method for directed, higher-order or hypergraph analysis. Article roles remain explicitly pair-based.";
    drawRoles(record3, record3.rolesHost);
    record3.auditResults.replaceChildren();
    if (record3.graph.scienceAudit?.construction) {
      const result = record3.graph.scienceAudit.construction;
      for (const comparison of result.comparisons) record3.auditResults.append(element3("p", comparison.definition.counting + " \xB7 " + comparison.definition.normalization + " \xB7 support \u2265" + comparison.definition.minimumSupport + ": " + comparison.clusters + " groups, " + comparison.edges + " connections; edge overlap " + percent2(comparison.edgeJaccard) + ", membership recovery " + percent2(comparison.weightedRecovery) + (comparison.nonconverged ? " \xB7 solver limit reached" : "")));
      paragraphs(record3.auditResults, [result.limitation]);
    }
    if (record3.null) {
      const result = record3.null;
      paragraphs(record3.auditResults, ["Null baseline: " + result.status + " \xB7 " + result.samples + " samples \xB7 both incidence margins preserved. " + result.acceptedSwitches + " accepted switches.", result.multiplicityResolution, result.limitation]);
      const diagnostics = element3("details");
      diagnostics.append(element3("summary", "Null movement diagnostics and pair outcomes"), element3("pre", JSON.stringify({ feasibility: result.feasibility, lagOne: result.lagOne, diagnostics: result.diagnostics, records: result.records }, null, 2)));
      record3.auditResults.append(diagnostics);
    }
    if (record3.graph.scienceAudit?.roleSensitivity) {
      const result = record3.graph.scienceAudit.roleSensitivity;
      paragraphs(record3.auditResults, ["Role sensitivity \xB7 " + result.samples + " resamples \xB7 original memberships fixed.", result.limitation]);
      const top = Object.entries(result.ranks).sort(([, left], [, right]) => right.topTen - left.topTen).slice(0, 10);
      for (const [id, rank] of top) {
        const node2 = record3.graph.nodes.find((node3) => node3.id === id);
        paragraphs(record3.auditResults, [(node2.title || node2.label || id) + " \xB7 top-ten credit " + percent2(rank.topTen) + " \xB7 average rank percentile " + percent2(rank.meanPercentile)]);
      }
    }
    if (record3.graph.scienceAudit?.optimization) {
      const result = record3.graph.scienceAudit.optimization;
      paragraphs(record3.auditResults, ["Fixed-evidence optimization \xB7 " + result.fits + " fits \xB7 mean full-universe ARI " + number(result.agreement.mean) + " \xB7 minimum " + number(result.agreement.minimum), result.limitation]);
    }
  }
  function mountScience(parent, graph3, sources = [], options = {}) {
    if (!graph3?.nodes || !graph3?.links) return;
    if (active !== graph3) {
      cancelScience();
      active = graph3;
    }
    let record3 = recordsByGraph.get(graph3);
    if (!record3) {
      const noun = ["term", "topic", "author", "institution", "country"].includes(graph3.entityKind) ? graph3.entityKind : "article";
      const panel4 = element3("details");
      panel4.id = graph3.canvasKind === "historiography" ? "historyScience" : "canvasScience";
      panel4.className = "science-panel";
      panel4.append(element3("summary", "Evidence, validation & " + noun + " roles"));
      const dimensions = element3("div"), actions = element3("div");
      actions.className = "reliability-controls";
      record3 = { graph: graph3, panel: panel4, sources, dimensions, ticket: 0, selectNode: options.selectNode, roles: graph3.scienceAudit?.roles, null: graph3.scienceAudit?.null };
      record3.runRoles = button2(noun[0].toUpperCase() + noun.slice(1) + " roles", () => run3(record3, "roles"));
      record3.runPaths = button2("Add path brokerage", () => run3(record3, "roles", { paths: true }));
      record3.manifest = button2("Export analysis manifest", () => run3(record3, "manifest", options.context || {}));
      record3.construction = button2("Compare connection definitions", () => run3(record3, "construction"));
      record3.nullButton = button2("Deep null check \xB7 50", () => run3(record3, "null", { samples: 50 }));
      record3.roleSensitivity = button2("Role sensitivity \xB7 10", () => run3(record3, "roleSensitivity", { samples: 10 }));
      record3.optimization = button2("Repeat optimization \xB7 5", () => run3(record3, "optimization"));
      record3.cancel = button2("Cancel audit", () => {
        stop(record3);
        record3.status.textContent = "Cancelled. No partial audit installed.";
        draw3(record3);
      });
      record3.status = element3("p");
      record3.status.setAttribute("role", "status");
      record3.rolesHost = element3("div");
      record3.auditResults = element3("div");
      record3.unsupported = element3("p");
      const evidence = element3("details");
      record3.coverageBody = element3("div");
      evidence.append(element3("summary", "Metadata coverage"), record3.coverageBody);
      const loadMetadata = button2("Load full available source metadata", async () => {
        loadMetadata.disabled = true;
        record3.status.textContent = "Loading source metadata\u2026";
        try {
          await fullEvidence(record3);
          record3.status.textContent = "Loaded " + record3.sources.length + " source records for " + (record3.graph.sourceCorpusId || window.ATLAS_DATA?.summary?.corpus_id || "the current evidence") + ". Unretained fields remain unknown.";
          draw3(record3);
        } catch (error) {
          record3.status.textContent = "Metadata not loaded: " + analysisErrorMessage(error);
        } finally {
          loadMetadata.disabled = false;
        }
      });
      evidence.append(loadMetadata);
      actions.append(record3.runRoles, record3.runPaths, record3.manifest, record3.construction, record3.nullButton, record3.roleSensitivity, record3.optimization, record3.cancel);
      panel4.append(dimensions, evidence, actions, record3.unsupported, record3.status, record3.rolesHost, record3.auditResults, element3("p", "The map remains unchanged. Deep checks are bounded and conditional on retained evidence. Full higher-order re-mining, identity-uncertainty audits and researcher thematic review are not automated."));
      recordsByGraph.set(graph3, record3);
    }
    if (!record3.fullLoaded) record3.sources = sources;
    record3.selectNode = options.selectNode || record3.selectNode;
    parent.append(record3.panel);
    draw3(record3);
    return record3;
  }

  // scripts/canvas-reliability.mjs
  var records3 = /* @__PURE__ */ new WeakMap();
  var activeGraph;
  var focus;
  var lastFilter;
  var articleIds2;
  var bundles2;
  var panel3;
  var job3;
  var generation3 = 0;
  var autoTimer2;
  var element4 = (tag, text = "") => {
    const node2 = document.createElement(tag);
    node2.textContent = text;
    return node2;
  };
  var percent3 = (value) => (value * 100).toFixed(1) + "%";
  var algorithm2 = (graph3) => ["infomap", "hypergraph", "sbm", "trial"].includes(graph3.clustering?.algorithm) ? graph3.clustering.algorithm : "leiden";
  var method2 = (graph3) => (algorithm2(graph3) === "sbm" ? "Nested block model \xB7 level " + ((graph3.clustering.selectedLevel || 0) + 1) : algorithm2(graph3) === "infomap" ? "Infomap \xB7 Markov time " + (graph3.clustering.markovTime || 1) : algorithm2(graph3) === "hypergraph" ? "Hypergraph \xB7 " + (graph3.clustering.hypergraphObjective || "linear") : graph3.resolution == null ? "Preparing network" : "Leiden CPM \xB7 " + Number(graph3.resolution.toPrecision(4))) + (graph3.networkModel === "hypergraph" && algorithm2(graph3) !== "hypergraph" ? isIncidenceModel(graph3) ? " \xB7 incidence" : " \xB7 legacy projection" : "");
  var pendingMethod = () => document.getElementById("clusteringMethod")?.value !== algorithm2(activeGraph) || document.getElementById("networkModel")?.value === "hypergraph" !== (activeGraph?.networkModel === "hypergraph" || algorithm2(activeGraph) === "hypergraph") || algorithm2(activeGraph) === "hypergraph" && ["mixed", "leiden-seeded", "group-moves", "annealing"].includes(document.getElementById("clusteringSearch")?.value) && document.getElementById("clusteringSearch").value !== (activeGraph.clustering?.hypergraphSearch || "mixed");
  if (typeof document !== "undefined") document.getElementById("clusteringMethod")?.addEventListener("change", () => {
    cancelCanvasReliability();
    draw4();
  });
  if (typeof window !== "undefined") window.addEventListener("atlas-settings-settled", (event) => {
    if (event.detail === activeGraph) {
      draw4();
      scheduleQuickCheck();
    }
  });
  if (typeof window !== "undefined") window.addEventListener("atlas-semantic-check", (event) => {
    if (event.detail === activeGraph) draw4();
  });
  if (typeof window !== "undefined") window.addEventListener("bibliomap:collaboration-check", (event) => {
    if (event.detail === activeGraph) draw4();
  });
  if (typeof window !== "undefined") window.addEventListener?.("atlas:navigation-state", () => {
    if (!automaticNavigationAllowed(activeGraph)) cancelCanvasReliability();
  });
  function cancelCanvasReliability() {
    cancelScience();
    cancelCanvasSettings();
    clearTimeout(autoTimer2);
    generation3++;
    job3?.cancel();
    job3 = null;
    const record3 = records3.get(activeGraph);
    if (record3?.running) {
      record3.running = false;
      record3.status = "Cancelled. No incomplete result is reported.";
      draw4();
    }
  }
  function syncCanvasReliability(graph3, cluster, ids, sourceBundles = []) {
    if (!panel3) {
      panel3 = element4("details");
      panel3.id = "canvasReliability";
      panel3.className = "canvas-reliability";
      document.getElementById("mapCaption").after(panel3);
    }
    const nextFocus = Number(cluster) > 0 ? Number(cluster) : null;
    if (graph3 === activeGraph && nextFocus === lastFilter) {
      syncCanvasSettings(graph3, ids, sourceBundles);
      return;
    }
    if (graph3 !== activeGraph) cancelCanvasReliability();
    activeGraph = graph3;
    focus = nextFocus;
    lastFilter = nextFocus;
    articleIds2 = ids;
    bundles2 = sourceBundles;
    if (!records3.has(graph3)) {
      const restored = graph3.reliability?.algorithm === algorithm2(graph3) ? graph3.reliability : null;
      records3.set(graph3, { result: restored, running: false, status: restored ? "Restored completed check: " + restored.samples + " resamples using " + restored.method + "." : "" });
    }
    draw4();
    syncCanvasSettings(graph3, ids, sourceBundles);
    scheduleQuickCheck();
  }
  function scheduleQuickCheck() {
    const graph3 = activeGraph, record3 = records3.get(graph3);
    if (!automaticNavigationAllowed(graph3)) return;
    if (graph3.linkedBrowse || graph3.collaboration || graph3.semantic || graph3.temporalSelection || graph3.temporalSeries) return;
    if (window.ATLAS_TRIAL_WORKSPACE && !graph3.trial) return;
    if ((!window.BIBLIOMAP?.active || window.BIBLIOMAP.canCompute !== false) && settingsValidationState(graph3) === "idle" && algorithm2(graph3) !== "sbm" && !record3.result && !record3.running && !record3.autoAttempted && !pendingMethod() && graph3.nodes.some((node2) => node2.cluster > 0)) {
      clearTimeout(autoTimer2);
      autoTimer2 = setTimeout(() => {
        if (activeGraph === graph3 && automaticNavigationAllowed(graph3) && !graph3.temporalSeries && !graph3.temporalSelection && !graph3.semantic && !graph3.collaboration && !graph3.linkedBrowse && !pendingMethod()) {
          record3.autoAttempted = true;
          run4(10);
        }
      }, 800);
    }
  }
  function showCanvasReliability(cluster) {
    if (!panel3) return;
    if (Number(cluster) > 0) {
      focus = Number(cluster);
      draw4();
    }
    panel3.open = true;
    revealSection(panel3, true);
  }
  async function run4(samples) {
    if (!navigationReady(activeGraph)) return;
    if (activeGraph?.collaboration || activeGraph?.semantic || activeGraph?.temporalSelection) return;
    if (pendingMethod() || window.BIBLIOMAP?.active && window.BIBLIOMAP.canCompute === false) return;
    cancelCanvasSettings();
    clearTimeout(autoTimer2);
    records3.get(activeGraph).autoAttempted = true;
    const graph3 = activeGraph, record3 = records3.get(graph3), ticket = ++generation3;
    job3?.cancel();
    job3 = null;
    record3.running = true;
    record3.result = null;
    graph3.reliability = null;
    window.ATLAS_EVIDENCE?.recordCanvasReliability(graph3, null);
    record3.status = "Preparing " + (graph3.trial?.result.definition.name || method2(graph3)) + " resampling\u2026";
    draw4();
    try {
      if (!graph3.trial) await loadCommunities();
      if (ticket !== generation3 || !navigationReady(graph3)) return;
      const progress = (message) => {
        if (ticket !== generation3) return;
        record3.status = message;
        panel3.dataset.validationStatus = message;
        panel3.querySelector(".reliability-progress").textContent = message;
      };
      job3 = graph3.trial ? startTrialReliability(structuredClone({ ...graph3, bundles: bundles2 }), samples, progress) : window.ATLAS_COMMUNITIES.startReliability(structuredClone({ ...graph3, bundles: bundles2 }), articleIds2, samples, progress);
      const result = await job3.promise;
      if (ticket !== generation3) return;
      record3.result = result;
      graph3.reliability = result;
      window.ATLAS_EVIDENCE?.recordCanvasReliability(graph3, result);
      record3.status = "Completed " + result.samples + " resamples using " + result.method + ".";
    } catch (error) {
      if (ticket === generation3) record3.status = "No completed reliability result: " + analysisErrorMessage(error);
    } finally {
      if (ticket === generation3) {
        record3.running = false;
        job3 = null;
        draw4();
      }
    }
  }
  function action2(parent, label, callback, disabled = false) {
    const button4 = element4("button", label);
    button4.type = "button";
    button4.className = "secondary";
    button4.disabled = disabled;
    button4.onclick = callback;
    parent.append(button4);
    return button4;
  }
  function draw4() {
    if (!activeGraph || !panel3) return;
    const graph3 = activeGraph, record3 = records3.get(graph3), selected = focus;
    if (graph3.temporalSelection) {
      panel3.dataset.validationMode = "window";
      panel3.dataset.validationState = "not-assessed";
      panel3.dataset.validationOutcome = "";
      panel3.dataset.validationStatus = "";
      panel3.dataset.preliminary = "false";
      graph3.reliabilityState = "not-assessed";
      panel3.replaceChildren(element4("summary", "Temporal window validation"), element4("p", "Independent publication windows are descriptive, not a reliability or significance test. Per-window persisted audits are not implemented; no parent validation is inherited."));
      return;
    }
    if (graph3.collaboration) {
      panel3.dataset.validationMode = "collaboration";
      panel3.dataset.validationState = "collaboration";
      panel3.dataset.validationOutcome = "";
      panel3.dataset.validationStatus = graph3.collaborationSensitivity?.completed ? "completed" : "not-assessed";
      panel3.dataset.preliminary = "false";
      graph3.reliabilityState = "not-applicable";
      panel3.replaceChildren(element4("summary", "Collaboration validation"), element4("p", "Citation bootstrap/nulls do not apply. Use Collaboration maps for construction and explicit human-audited identity sensitivity. Structural groups are not validated social or thematic communities."));
      mountScience(panel3, graph3, Object.values(window.ATLAS_DATA?.articles || {}));
      return;
    }
    if (graph3.semantic) {
      panel3.dataset.validationMode = "semantic";
      panel3.dataset.validationState = "semantic";
      panel3.dataset.validationOutcome = "";
      panel3.dataset.validationStatus = graph3.semanticSensitivity?.status || "not-assessed";
      panel3.dataset.preliminary = "false";
      graph3.reliabilityState = "not-applicable";
      panel3.replaceChildren(element4("summary", "Semantic validation"), element4("p", "Citation bootstrap and incidence-margin null tests do not apply to this network. Use Semantic maps \u2192 Check text & threshold sensitivity. A stable partition does not validate a theme."));
      mountScience(panel3, graph3, Object.values(window.ATLAS_DATA?.articles || {}));
      return;
    }
    delete panel3.dataset.validationMode;
    const state = pendingMethod() ? "pending" : record3.running ? "running" : record3.result ? "done" : "unknown";
    panel3.dataset.validationState = state;
    panel3.dataset.validationOutcome = record3.result ? recoveryOverview(record3.result.clusters).heading : "";
    panel3.dataset.preliminary = String(!!record3.result?.preliminary);
    panel3.dataset.validationStatus = record3.status || "";
    if (graph3.reliabilityState !== state || record3.publishedResult !== record3.result) {
      graph3.reliabilityState = state;
      record3.publishedResult = record3.result;
      queueMicrotask(() => window.dispatchEvent(new CustomEvent("atlas-reliability-change", { detail: graph3 })));
    }
    if (pendingMethod()) {
      panel3.replaceChildren(element4("summary", "Roles & reliability \xB7 waiting for selected method"), element4("p", "The selected clustering method has not finished loading. Reliability checks will become available when its map is ready. If analysis failed, retry the clustering selection. No results from the previous method are shown."));
      return;
    }
    const shortOutcome = record3.result ? recoveryOverview(record3.result.clusters).heading : record3.running ? "Checking\u2026" : algorithm2(graph3) === "sbm" ? "Run a preliminary check" : "Automatic preliminary check";
    panel3.replaceChildren(element4("summary", "Reliability \xB7 " + shortOutcome));
    panel3.append(element4("p", (graph3.trial?.result.definition.name || method2(graph3)) + " \xB7 resampled citation evidence"));
    const explanation = element4("details");
    explanation.append(element4("summary", "How this works"), element4("p", (algorithm2(graph3) === "sbm" ? "Block-model checks run on demand because every resample fits a new hierarchy. The selected hierarchy level is used, or the coarsest available level if a resample has fewer levels. " : "Automatically runs 10 preliminary resamples for each new map unless a completed check is available. ") + "Rerun or use 50 resamples below. The selected algorithm is rerun on resampled citation evidence; the map is unchanged. Filters only narrow the displayed results. This checks structural stability, not thematic validity. Switching tabs cancels unfinished checks."));
    panel3.append(explanation);
    const controls = element4("div");
    controls.className = "reliability-controls";
    const unavailable = !graph3.nodes.some((node2) => node2.cluster > 0) || window.BIBLIOMAP?.active && window.BIBLIOMAP.canCompute === false;
    action2(controls, "Rerun quick \xB7 10", () => run4(10), record3.running || unavailable).id = "validationQuick";
    action2(controls, "Fuller check \xB7 50", () => run4(50), record3.running || unavailable).id = "validationFull";
    action2(controls, "Cancel reliability check", cancelCanvasReliability, !record3.running).hidden = !record3.running;
    panel3.append(controls);
    const status = element4("p", record3.status || (unavailable ? "No linked groups to assess." : "Not assessed yet."));
    status.className = "reliability-progress";
    status.setAttribute("role", "status");
    panel3.append(status);
    panel3.append(element4("p", selected ? "Showing Cluster " + selected + ". The entire network is resampled." : "Showing all clusters."));
    if (selected) action2(panel3, "Show reliability for all clusters", () => {
      focus = null;
      draw4();
    });
    const result = record3.result;
    if (result) {
      const clusters = Object.fromEntries(Object.entries(result.clusters).filter(([cluster]) => !selected || +cluster === selected));
      const overview = recoveryOverview(clusters);
      const outcome = element4("section");
      outcome.className = "reliability-outcome";
      outcome.append(element4("h3", (result.preliminary ? "Preliminary: " : "") + overview.heading), element4("p", "Structural stability; thematic relevance still needs review."));
      if (result.nonconverged) outcome.append(element4("p", result.nonconverged + " resamples reached the optimization pass limit. Interpret recovery cautiously."));
      panel3.append(outcome);
      const details = element4("details");
      details.append(element4("summary", "Cluster outcomes & technical scores"), element4("p", overview.explanation));
      for (const [cluster, values] of Object.entries(clusters)) {
        const interpretation = interpretRecovery(values, Object.keys(result.clusters).length);
        details.append(element4("h4", "Cluster " + cluster + " \u2014 " + interpretation.heading), element4("p", interpretation.explanation + " " + interpretation.caution), element4("p", values.size + " members \xB7 recovery " + percent3(values.meanJaccard) + " \xB7 10th\u201390th percentile " + values.interval.map(percent3).join("\u2013") + " \xB7 retention " + percent3(values.meanRetention)));
      }
      details.append(element4("p", result.samples + " resamples \xB7 " + result.method + " \xB7 " + result.restarts + " starts each. Resampling unit: " + result.resamplingUnit + "."), element4("p", "Recovery is best Jaccard overlap: intersection divided by union. Lost members, splits and merges lower it. Retention measures members still clustered. Percentiles describe observed resampling spread, not confidence intervals."), element4("p", result.limitations), element4("p", RELIABILITY_RULES));
      panel3.append(details);
    }
    mountScience(panel3, graph3, Object.values(window.ATLAS_DATA?.articles || {}), { selectNode: (id) => {
      window.atlasSharedCanvas.selectSource(id);
      revealSection(document.getElementById("details"), true);
    } });
  }

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
  async function preparedSemanticEvidence(works, cache, corpusId, useCachedAbstracts = false) {
    validateWorks(works);
    if (!useCachedAbstracts) return { works, supplementalText: null };
    if (!cache || !corpusId || cache.sourceCorpusId !== corpusId) throw new Error("Prepared text must match the selected evidence corpus.");
    let suppliedAbstracts = 0;
    const prepared = works.map((work) => {
      const current = semanticText(work), document2 = cache.documents?.[work.id];
      if (!document2 || cleanText(document2.title) !== current.title) throw new Error("Prepared title does not match selected source " + work.id + ".");
      if (current.abstract && current.abstract !== cleanText(document2.abstract)) throw new Error("Retained abstract differs from cached prepared text for " + work.id + ".");
      if (!current.abstract && document2.abstract) suppliedAbstracts++;
      return { ...work, abstract: current.abstract || cleanText(document2.abstract) };
    });
    const checksum = await scienceDigest({ model: cache.model, revision: cache.revision, textScope: cache.textScope, documents: prepared.map((work) => ({ id: work.id, ...semanticText(work), embedding: cache.documents[work.id].embedding })).sort((left, right) => left.id.localeCompare(right.id)) });
    return { works: prepared, supplementalText: { checksum, suppliedAbstracts, model: cache.model, revision: cache.revision, textScope: cache.textScope, source: "Existing prepared source-text/model cache; independently pinned supplemental evidence, not a new OpenAlex retrieval.", verification: "Corpus/source IDs and titles match; retained abstracts match. Missing source-record abstracts are supplied from the pinned cache, not verified against the retrieval snapshot." } };
  }
  function citationCrosswalk(graph3, works, cluster = null) {
    const scope2 = graph3.semantic?.referenceScope;
    if (!scope2) return { status: "unavailable", reason: "No parent co-citation scope was retained for this semantic result. Open its co-citation map and build a semantic view to create the crosswalk." };
    const selected = new Set(graph3.nodes.filter((node2) => !Number(cluster) || node2.cluster === Number(cluster)).flatMap((node2) => graph3.entityKind === "source" ? [node2.id] : node2.articles)), references = new Map(scope2.nodes.map((node2) => [node2.id, { ...node2, sourceIds: [] }])), lookup = /* @__PURE__ */ new Map(), referenceKey = (value) => {
      const key = value.replace(/^https?:\/\/openalex\.org\//i, "");
      return /^W\d+$/i.test(key) ? key.toUpperCase() : value;
    };
    for (const node2 of references.values()) for (const alias of new Set([node2.id, node2.key, ...node2.aliases || []].filter((value) => typeof value === "string"))) {
      const key = referenceKey(alias);
      if (lookup.has(key) && lookup.get(key) !== node2.id) return { status: "unavailable", reason: "The retained parent scope has ambiguous reference aliases; no crosswalk is inferred." };
      lookup.set(key, node2.id);
    }
    for (const work of works) if (selected.has(work.id)) {
      const matched = /* @__PURE__ */ new Set();
      for (const id of new Set(work.references || work.referenced_works || [])) {
        const nodeId = lookup.get(referenceKey(id));
        if (nodeId && !matched.has(nodeId)) {
          references.get(nodeId).sourceIds.push(work.id);
          matched.add(nodeId);
        }
      }
    }
    const retained = [...references.values()].filter((node2) => node2.sourceIds.length).sort((left, right) => right.sourceIds.length - left.sourceIds.length || left.id.localeCompare(right.id)), groups = /* @__PURE__ */ new Map();
    for (const node2 of retained) {
      if (!groups.has(node2.cluster)) groups.set(node2.cluster, /* @__PURE__ */ new Set());
      for (const id of node2.sourceIds) groups.get(node2.cluster).add(id);
    }
    return { status: "observed", selectedSources: selected.size, references: retained, clusters: [...groups].map(([id, sourceIds]) => ({ id, sourceIds: [...sourceIds].sort() })).sort((left, right) => right.sourceIds.length - left.sourceIds.length), limitation: "Observed citations link distinct source papers to the retained co-citation scope. Cluster supports overlap and are not additive; no ARI is computed between different node types." };
  }
  function commonSourceComparison(first, second) {
    const sourceGraph = (graph3) => graph3.entityKind === "source" || graph3.canvasKind === "coupling";
    if (!sourceGraph(first) || !sourceGraph(second)) throw new Error("Partition comparison requires two source-article graphs; feature and cited-reference universes are not interchangeable.");
    const secondIds = new Set(second.nodes.map((node2) => node2.id)), common = first.nodes.filter((node2) => secondIds.has(node2.id)).map((node2) => node2.id).sort(), commonSet = new Set(common);
    const memberships = (graph3) => new Map(graph3.nodes.filter((node2) => commonSet.has(node2.id)).map((node2) => [node2.id, node2.cluster > 0 ? String(node2.cluster) : "unassigned:" + node2.id]));
    const left = memberships(first), right = memberships(second), leftCounts = /* @__PURE__ */ new Map(), rightCounts = /* @__PURE__ */ new Map(), joint = /* @__PURE__ */ new Map(), choose = (value) => value * (value - 1) / 2;
    for (const id of common) {
      const row = left.get(id), column = right.get(id), key = row + "\0" + column;
      leftCounts.set(row, (leftCounts.get(row) || 0) + 1);
      rightCounts.set(column, (rightCounts.get(column) || 0) + 1);
      joint.set(key, (joint.get(key) || 0) + 1);
    }
    const pairs = choose(common.length), rowPairs = [...leftCounts.values()].reduce((sum, value) => sum + choose(value), 0), columnPairs = [...rightCounts.values()].reduce((sum, value) => sum + choose(value), 0), jointPairs = [...joint.values()].reduce((sum, value) => sum + choose(value), 0), expected = pairs ? rowPairs * columnPairs / pairs : 0, denominator = (rowPairs + columnPairs) / 2 - expected;
    const firstUnassigned = common.filter((id) => left.get(id).startsWith("unassigned:")).length, secondUnassigned = common.filter((id) => right.get(id).startsWith("unassigned:")).length, commonAssignedBoth = common.filter((id) => !left.get(id).startsWith("unassigned:") && !right.get(id).startsWith("unassigned:")).length;
    return { universe: "Exact intersection of source IDs; unassigned articles treated as separate singletons.", commonIds: common, firstOnly: first.nodes.length - common.length, secondOnly: second.nodes.length - common.length, firstUnassigned, secondUnassigned, commonAssignedBoth, adjustedRandIndex: common.length < 2 ? null : denominator ? (jointPairs - expected) / denominator : 1, trivialPartition: !denominator, limitation: "Agreement compares definitions, not truth, topic quality or relevance. Identical all-singleton or all-in-one partitions can have ARI 1 without meaningful research groups." };
  }

  // scripts/semantic-browser.mjs
  function mountSemanticBrowser() {
    if (window.ATLAS_TRIAL_WORKSPACE) return;
    const element6 = (tag, text = "") => {
      const node2 = document.createElement(tag);
      node2.textContent = text;
      return node2;
    };
    const panel4 = element6("details"), title = element6("summary", "Semantic maps \xB7 terms, topics & source text");
    panel4.id = "semanticControls";
    panel4.append(title);
    const controls = element6("div");
    controls.className = "semantic-controls";
    panel4.append(controls);
    function select(labelText, values) {
      const label = element6("label", labelText), input = element6("select");
      for (const [value, text] of values) input.append(new Option(text, value));
      label.append(input);
      controls.append(label);
      return input;
    }
    function number2(labelText, value, minimum, maximum, step = 1) {
      const label = element6("label", labelText), input = element6("input");
      input.type = "number";
      Object.assign(input, { value, min: minimum, max: maximum, step });
      label.append(input);
      controls.append(label);
      return input;
    }
    const kind = select("Evidence relationship", [["terms", "Literal term co-occurrence"], ["topics", "OpenAlex topic co-occurrence"], ["embeddings", "MiniLM source-text similarity"]]);
    kind.id = "semanticKind";
    const textScope = select("Text", [["titles-abstracts", "Titles + available abstracts"], ["titles", "Titles only"]]);
    const support = number2("Minimum supporting sources", 3, 1, 1e5), vocabulary = number2("Maximum observed features", 120, 2, 300), score = number2("Minimum topic confidence", 0.3, 0, 1, 0.05), similarity = number2("Minimum text cosine", 0.65, 0.1, 1, 0.05), resolution = number2("Leiden CPM", 0.02, 1e-6, 1, "any");
    const cachedLabel = element6("label"), cached = element6("input");
    cached.type = "checkbox";
    cachedLabel.append(cached, document.createTextNode("Use prepared cached abstracts where source records lack them (separate text evidence)"));
    panel4.append(cachedLabel);
    const construction = element6("p");
    construction.id = "semanticConstructionSummary";
    panel4.append(construction);
    const explanation = element6("p"), status = element6("p");
    status.setAttribute("role", "status");
    panel4.append(explanation);
    const actions = element6("div");
    actions.className = "science-actions";
    panel4.append(actions, status);
    function button4(text, action3) {
      const node2 = element6("button", text);
      node2.type = "button";
      node2.className = "secondary";
      node2.onclick = action3;
      actions.append(node2);
      return node2;
    }
    const build = button4("Build semantic map", () => run5(false)), sensitivity = button4("Check text & threshold sensitivity", () => run5(true)), compare = button4("Compare with source coupling", compareCoupling), back = button4("Return to citation map", () => {
      stop2();
      document.getElementById("workspace-map").click();
    }), cancel2 = button4("Cancel", stop2);
    cancel2.hidden = true;
    let worker2, remoteJob, generation5 = 0, installed, sourceCache, cacheIdentity, previousCoupling, previousReferences, activeCorpus, sourceRecords, sourceRecordsCorpus;
    function settings() {
      for (const input of [support, vocabulary, score, similarity, resolution]) if (!input.checkValidity()) {
        input.reportValidity();
        throw new Error("Check the semantic settings.");
      }
      return semanticSettings({ kind: kind.value, textScope: textScope.value, minimumSupport: +support.value, vocabularyLimit: +vocabulary.value, minimumScore: +score.value, minimumSimilarity: +similarity.value, resolution: +resolution.value });
    }
    function explain() {
      support.parentElement.hidden = kind.value === "embeddings";
      vocabulary.parentElement.hidden = kind.value === "embeddings";
      score.parentElement.hidden = kind.value !== "topics";
      similarity.parentElement.hidden = kind.value !== "embeddings";
      textScope.parentElement.hidden = kind.value === "topics";
      explanation.textContent = kind.value === "terms" ? "Observed phrases become nodes. A line means the same source contains both phrases; headings are deterministic, not AI themes." : kind.value === "topics" ? "Machine-assigned OpenAlex topics become nodes\u2014not literal author keywords. Weight sums confidence products; counts are distinct supporting sources." : "Source articles remain nodes. Lines compare real cached MiniLM title/abstract vectors, not shared citations. Missing or stale vectors never fall back to word overlap.";
    }
    kind.onchange = explain;
    explain();
    async function evidence() {
      const packet = await window.ATLAS_EVIDENCE.prepareDataset();
      if (packet.sourceCorpusId !== window.ATLAS_DATA.summary.corpus_id) throw new Error("Source evidence changed. Reopen the current project.");
      sourceRecords = packet.articles;
      sourceRecordsCorpus = packet.sourceCorpusId;
      return packet;
    }
    async function cache(packet) {
      const identity = packet.sourceCorpusId + "|" + (window.atlasSharedCanvas.graph()._resultId || "public");
      if (cacheIdentity === identity && sourceCache?.sourceCorpusId === packet.sourceCorpusId) return sourceCache;
      const graph3 = window.atlasSharedCanvas.graph(), response = await fetch(window.atlasSharedCanvas.currentCorpus() ? "workspace-api/corpora/" + packet.sourceCorpusId + "/themes" + (window.BIBLIOMAP?.active ? "?result=" + encodeURIComponent(graph3._resultId) : "") : "source-cluster-themes.json?v=2");
      if (!response.ok) throw new Error("Matching prepared source embeddings are unavailable. Generate project keywords first; no model is downloaded here.");
      const value = await response.json();
      if (value.sourceCorpusId !== packet.sourceCorpusId) throw new Error("Prepared source cache belongs to another corpus.");
      sourceCache = value;
      cacheIdentity = identity;
      return value;
    }
    function stop2() {
      generation5++;
      worker2?.terminate();
      worker2 = null;
      remoteJob?.cancel();
      remoteJob = null;
      cancel2.hidden = true;
      build.disabled = window.BIBLIOMAP?.active && window.BIBLIOMAP.canCompute === false;
      sensitivity.disabled = build.disabled;
      status.textContent = "Stopped. Previous completed map remains visible.";
    }
    function resetContext() {
      stop2();
      installed = null;
      sourceCache = null;
      cacheIdentity = null;
      previousCoupling = previousReferences = null;
      activeCorpus = null;
      sourceRecords = null;
      sourceRecordsCorpus = null;
      construction.textContent = "";
      panel4.querySelector(".semantic-report")?.remove();
      status.textContent = "No semantic result is selected. Build a map from the current pinned evidence.";
      panel4.open = false;
      sensitivity.disabled = true;
    }
    function task(request, ticket) {
      return new Promise((resolve, reject) => {
        const activeWorker = worker2 = new Worker("semantic-worker.js?v=coupling-errors-2");
        activeWorker.onmessage = (event) => {
          if (ticket !== generation5) return;
          if (event.data.progress) {
            status.textContent = event.data.progress;
            return;
          }
          activeWorker.terminate();
          if (worker2 === activeWorker) worker2 = null;
          Object.hasOwn(event.data, "error") ? reject(Error(analysisErrorMessage(event.data.error))) : resolve(event.data.result);
        };
        activeWorker.onerror = (event) => {
          activeWorker.terminate();
          if (worker2 === activeWorker) worker2 = null;
          reject(new Error(analysisErrorMessage(event)));
        };
        activeWorker.postMessage(request);
      });
    }
    async function run5(check, force = false) {
      if (window.BIBLIOMAP?.active && window.BIBLIOMAP.canCompute === false) {
        status.textContent = "View-only project. An editor must build or check a semantic map.";
        return;
      }
      stop2();
      const ticket = generation5, canvas = window.atlasSharedCanvas, parent = canvas.graph(), corpusId = window.ATLAS_DATA.summary.corpus_id;
      if (activeCorpus !== corpusId) {
        sourceCache = null;
        sourceRecords = null;
        previousCoupling = previousReferences = null;
        activeCorpus = corpusId;
      }
      build.disabled = sensitivity.disabled = true;
      cancel2.hidden = false;
      status.textContent = "Preparing semantic evidence \xB7 previous map shown.";
      try {
        const options = check ? semanticSettings(parent.semantic) : settings();
        if (check && !parent.semantic) throw new Error("Build a semantic map before checking its sensitivity.");
        if (parent.temporalSelection || parent.collaboration?.ego) throw Error("Return to the full pinned map before building another analysis. Completed windows are read-only analytical views.");
        let result;
        if (window.BIBLIOMAP?.active) {
          remoteJob = window.BIBLIOMAP.stage(parent, check ? "semantic-sensitivity" : "semantic-network", { ...options, useCachedAbstracts: check ? !!parent.semantic.supplementalText : cached.checked }, (message) => {
            if (ticket === generation5) status.textContent = message;
          }, force);
          result = await remoteJob.promise;
        } else {
          const supplement = check ? !!parent.semantic.supplementalText : cached.checked, packet = await evidence(), themes = options.kind === "embeddings" || supplement ? await cache(packet) : null;
          const prepared = await preparedSemanticEvidence(packet.articles, themes, corpusId, supplement);
          result = await task({ action: check ? "sensitivity" : "build", works: prepared.works, settings: options, cache: themes, graph: parent, context: { sourceCorpusId: corpusId, externalCorpus: parent.externalCorpus, evidenceProvenance: parent.evidenceProvenance, referenceGraph: parent.collaboration?.referenceScope || parent.semantic?.referenceScope || window.atlasEvidenceContext()?.graph }, supplementalText: prepared.supplementalText }, ticket);
        }
        if (ticket !== generation5 || corpusId !== window.ATLAS_DATA.summary.corpus_id || canvas.graph() !== parent) return;
        if (check) {
          parent.semanticSensitivity = result;
          renderReport(result);
          window.dispatchEvent(new CustomEvent("atlas-semantic-check", { detail: parent }));
          status.textContent = result.completed + " of " + result.attempted + " distinct definitions assessed \xB7 " + result.status + " \xB7 displayed memberships unchanged.";
          return;
        }
        if (parent.canvasKind === "coupling") previousCoupling = structuredClone(parent);
        if (!parent.semantic) previousReferences = window.atlasEvidenceContext()?.graph || null;
        cancelCanvasReliability();
        window.ATLAS_HISTORY?.deactivate();
        installed = result;
        canvas.showSemantic(result);
        window.dispatchEvent(new CustomEvent("bibliomap:semantic-ready", { detail: result }));
        status.textContent = result.nodes.length + " " + result.entityKind + " nodes \xB7 " + result.links.length + " connections \xB7 saved in the current project finding when you save.";
      } catch (problem) {
        if (ticket === generation5) status.textContent = "No new semantic result: " + analysisErrorMessage(problem);
      } finally {
        if (ticket === generation5) {
          build.disabled = sensitivity.disabled = false;
          cancel2.hidden = true;
          remoteJob = null;
        }
      }
    }
    function renderReport(result) {
      let report = panel4.querySelector(".semantic-report");
      if (!report) {
        report = element6("div");
        report.className = "semantic-report";
        panel4.append(report);
      }
      report.replaceChildren(element6("p", (result.completed ?? 0) + " of " + (result.attempted ?? result.variants.length) + " definitions assessed \xB7 " + (result.status || "legacy status unknown")), element6("p", result.limitation));
      for (const variant of result.variants) {
        const settings2 = variant.settings, label = settings2.kind === "embeddings" ? "Cosine \u2265" + settings2.minimumSimilarity.toFixed(2) : "Support \u2265" + settings2.minimumSupport + (settings2.kind === "topics" ? " \xB7 topic confidence \u2265" + settings2.minimumScore.toFixed(2) : " \xB7 " + settings2.textScope);
        report.append(element6("p", label + " \xB7 " + (variant.reason || variant.nodes + " nodes \xB7 " + variant.edges + " lines \xB7 node overlap " + (100 * variant.nodeJaccard).toFixed(1) + "%" + (variant.comparison?.adjustedRandIndex != null ? " \xB7 source ARI " + variant.comparison.adjustedRandIndex.toFixed(3) : ""))));
      }
      report.append(element6("p", result.modelSensitivity));
    }
    async function compareCoupling() {
      const graph3 = window.atlasSharedCanvas.graph(), ticket = generation5;
      try {
        if (!previousCoupling) throw new Error("Open source-article coupling, then build a MiniLM map to compare the same source IDs.");
        let result;
        if (window.BIBLIOMAP?.active) {
          remoteJob = window.BIBLIOMAP.stage(graph3, "semantic-comparison", { otherResultId: previousCoupling._resultId }, (message) => {
            if (ticket === generation5) status.textContent = message;
          });
          result = await remoteJob.promise;
        } else result = commonSourceComparison(previousCoupling, graph3);
        if (ticket !== generation5 || window.atlasSharedCanvas.graph() !== graph3) return;
        status.textContent = result.commonIds.length + " exact common source IDs \xB7 " + result.commonAssignedBoth + " assigned in both \xB7 " + result.firstUnassigned + "/" + result.secondUnassigned + " unassigned \xB7 ARI " + (result.adjustedRandIndex?.toFixed(3) ?? "not assessable") + (result.trivialPartition ? " \xB7 trivial partition" : "") + " \xB7 " + result.firstOnly + "/" + result.secondOnly + " outside the intersection. Agreement is not validation.";
        graph3.semanticComparison = result;
      } catch (problem) {
        status.textContent = analysisErrorMessage(problem);
      }
    }
    function method3(graph3) {
      const source = graph3.entityKind === "source";
      return { title: graph3.semantic.kind === "terms" ? "Literal term co-occurrence" : graph3.semantic.kind === "topics" ? "OpenAlex topic co-occurrence" : "MiniLM source-text similarity", node: source ? "Source article" : graph3.entityKind, plural: source ? "source articles" : graph3.entityKind + "s", group: "Cluster", size: source ? "Equal-sized articles" : "Supporting sources", edge: source ? "Text cosine similarity" : "Distinct supporting sources", question: source ? "Which articles have similar titles and abstracts?" : "Which observed features appear together?", explanation: graph3.semantic.evidencePolicy, weight: source ? "Line brightness is document-vector cosine, not a citation count." : "Raw support counts distinct sources. Analytical weight: " + graph3.normalization + ".", caveat: "Semantic similarity and feature co-occurrence do not establish agreement, relevance, thematic validity or statistical significance." };
    }
    function inspectNode(graph3, node2, host2, sourceArticles, selectNode) {
      host2.append(element6("h2", node2.title || node2.label), element6("p", method3(graph3).explanation));
      if (graph3.entityKind === "source") sourceArticles(host2, [node2.id]);
      else {
        host2.append(element6("p", node2.articles.length + " supporting sources \xB7 " + graph3.entityKind + " node, not an article."));
        const details = element6("details");
        details.append(element6("summary", "Supporting articles & observed evidence"));
        let loaded = 0;
        const more = element6("button");
        more.type = "button";
        const append = () => {
          for (const id of node2.articles.slice(loaded, loaded + 50)) {
            sourceArticles(details, [id]);
            const span = node2.evidence?.[id];
            if (span) details.append(element6("p", span.field + " [" + span.start + "\u2013" + span.end + "]: \u201C" + span.excerpt + "\u201D"));
            else if (node2.scores?.[id] != null) details.append(element6("p", "OpenAlex topic score: " + node2.scores[id]));
          }
          loaded = Math.min(loaded + 50, node2.articles.length);
          more.textContent = "Show more sources \xB7 " + loaded + " of " + node2.articles.length + " shown";
          more.hidden = loaded === node2.articles.length;
          details.append(more);
        };
        more.onclick = append;
        append();
        host2.append(details);
      }
      const neighbors = element6("details");
      neighbors.append(element6("summary", "Connected " + method3(graph3).plural));
      for (const edge of graph3.links.filter((edge2) => edge2.source === node2.id || edge2.target === node2.id).sort((left, right) => right.strength - left.strength).slice(0, 100)) {
        const other = graph3.nodes.find((item) => item.id === (edge.source === node2.id ? edge.target : edge.source)), button5 = element6("button", other.label || other.title);
        button5.type = "button";
        button5.onclick = () => selectNode(other.id);
        neighbors.append(button5);
      }
      host2.append(neighbors);
    }
    function inspectEdge(graph3, edge, host2, sourceArticles) {
      host2.append(element6("h2", graph3.entityKind === "source" ? "Text cosine " + edge.strength.toFixed(4) : edge.rawSupport + " distinct supporting sources"), element6("p", "Analytical weight: " + edge.strength.toPrecision(5) + " \xB7 " + graph3.normalization), element6("p", method3(graph3).caveat));
      sourceArticles(host2, graph3.entityKind === "source" ? [edge.source, edge.target] : edge.articles);
    }
    function overview(graph3, host2, cluster, sourceArticles) {
      const coverage = graph3.semantic.coverage;
      host2.append(element6("h2", method3(graph3).title), element6("p", graph3.semantic.evidencePolicy), element6("p", coverage.records + " source records \xB7 " + coverage.withText + " with text \xB7 " + coverage.withAbstract + " with abstracts" + (coverage.withTopics != null ? " \xB7 " + coverage.withTopics + " with classifier topics" : "")), element6("p", graph3.semantic.supplementalText?.verification || ""), element6("p", "Citation bootstrap and citation-margin null tests do not apply. Use text & threshold sensitivity; no alternative model has been validated."));
      if (graph3.entityKind !== "source") host2.append(element6("p", "Headings use observed features, not Qwen. Grounded feature descriptions are not implemented."));
      const section = element6("details");
      section.append(element6("summary", "Linked intellectual foundations"));
      host2.append(section);
      drawCrosswalk(graph3, section, cluster, sourceArticles);
      if (graph3.semanticSensitivity) renderReport(graph3.semanticSensitivity);
    }
    async function drawCrosswalk(graph3, section, cluster, sourceArticles) {
      const ticket = generation5;
      let works = sourceRecordsCorpus === window.ATLAS_DATA.summary.corpus_id ? sourceRecords : null;
      try {
        if (!works) {
          section.append(element6("p", "Loading pinned source-reference evidence\u2026"));
          works = (await evidence()).articles;
        }
        if (ticket !== generation5 || window.atlasSharedCanvas.graph() !== graph3 || !section.isConnected) return;
        section.replaceChildren(element6("summary", "Linked intellectual foundations"));
      } catch (problem) {
        if (section.isConnected) section.append(element6("p", "Crosswalk unavailable: " + analysisErrorMessage(problem)));
        return;
      }
      const linked = citationCrosswalk(graph3, works, cluster);
      if (linked.status === "unavailable") section.append(element6("p", linked.reason));
      else {
        section.append(element6("p", linked.selectedSources + " sources in this selection \xB7 " + linked.limitation));
        for (const group of linked.clusters.slice(0, 8)) section.append(element6("p", (Number(group.id) > 0 ? "Co-citation cluster " + group.id : "Unlinked references \xB7 outside linked communities") + " \xB7 " + group.sourceIds.length + " distinct supporting sources"));
        for (const reference of linked.references.slice(0, 20)) {
          const row = element6("details");
          row.append(element6("summary", reference.label + " \xB7 " + reference.sourceIds.length + " selected sources"));
          row.addEventListener("toggle", () => {
            if (!row.open || row.dataset.loaded) return;
            row.dataset.loaded = "true";
            sourceArticles(row, reference.sourceIds.slice(0, 50));
            if (reference.sourceIds.length > 50) row.append(element6("p", "Showing the first 50 supporting source IDs of " + reference.sourceIds.length + "; the complete list is in the crosswalk export."));
            const navigate = element6("button", "Open this reference in co-citation");
            navigate.type = "button";
            navigate.onclick = () => {
              window.atlasSharedCanvas.showReferences();
              if (window.atlasSharedCanvas.graph().nodes.some((node2) => node2.id === reference.id)) window.atlasInspectReference(reference.id);
              else status.textContent = "Open the parent co-citation result to inspect " + reference.label;
            };
            row.append(navigate);
          });
          section.append(row);
        }
        const download = element6("button", "Export complete citation crosswalk");
        download.type = "button";
        download.onclick = () => {
          const url = URL.createObjectURL(new Blob([JSON.stringify(linked, null, 2)], { type: "application/json" })), link = element6("a");
          link.href = url;
          link.download = "semantic-citation-crosswalk.json";
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1e3);
        };
        section.append(download);
      }
    }
    function sync3(graph3) {
      const body = document.querySelector("#analysisPanel .shell-panel-body");
      if (body && panel4.parentElement !== body) body.prepend(panel4);
      if (activeCorpus && activeCorpus !== window.ATLAS_DATA.summary.corpus_id) resetContext();
      activeCorpus = window.ATLAS_DATA.summary.corpus_id;
      installed = graph3;
      const settings2 = graph3.semantic;
      kind.value = settings2.kind;
      textScope.value = settings2.textScope;
      support.value = settings2.minimumSupport;
      vocabulary.value = settings2.vocabularyLimit;
      score.value = settings2.minimumScore;
      similarity.value = settings2.minimumSimilarity;
      resolution.value = settings2.resolution;
      cached.checked = !!settings2.supplementalText;
      construction.textContent = method3(graph3).title + " \xB7 " + graph3.nodes.length + " " + method3(graph3).plural + " \xB7 " + graph3.stats.clusters + " clusters \xB7 CPM " + settings2.resolution + " \xB7 3 seeded starts \xB7 " + (settings2.kind === "embeddings" ? "cosine \u2265" + settings2.minimumSimilarity : "source support \u2265" + settings2.minimumSupport) + ". Citation Auto CPM and connection orders do not apply.";
      build.disabled = sensitivity.disabled = window.BIBLIOMAP?.active && window.BIBLIOMAP.canCompute === false;
      explain();
      if (graph3.semanticSensitivity) renderReport(graph3.semanticSensitivity);
      else panel4.querySelector(".semantic-report")?.remove();
      status.textContent = "Completed semantic map for the current pinned source evidence.";
    }
    window.ATLAS_SEMANTIC = { method: method3, inspectNode, inspectEdge, overview, stop: stop2, resetContext, sync: sync3, recompute: () => run5(false, true), get sourceCache() {
      return sourceCache;
    }, get installed() {
      return installed;
    } };
    const host = document.querySelector("#analysisPanel .shell-panel-body") || document.querySelector(".community-controls");
    host.append(panel4);
    const revealControls = () => {
      const body = document.querySelector("#analysisPanel .shell-panel-body");
      if (body && panel4.parentElement !== body) body.prepend(panel4);
      panel4.open = true;
      window.atlasWorkspaceShell?.show("analysis");
      window.atlasWorkspaceShell?.reveal(panel4);
      panel4.scrollIntoView({ block: "nearest" });
    };
    const tab = element6("button", "Semantic maps");
    tab.type = "button";
    tab.id = "workspace-semantic";
    tab.dataset.view = "semantic";
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", "false");
    tab.onclick = revealControls;
    document.querySelector(".workspace-tabs").append(tab);
    window.addEventListener("bibliomap:selection-changed", resetContext);
  }

  // scripts/temporal-series.mjs
  var publicationYear = (work) => {
    const year = work.publication_year ?? work.year;
    return Number.isInteger(year) && year >= 1500 && year <= 2100 ? year : null;
  };
  function temporalSettings(options = {}) {
    const value = { from: Number(options.from), to: Number(options.to), width: Number(options.width ?? 5), step: Number(options.step ?? 5), universe: options.universe || "fixed", resolution: Number(options.resolution ?? 0.02), seed: Number(options.seed ?? 42), starts: 3, algorithm: options.algorithm || "leiden" };
    if (!Number.isInteger(value.from) || !Number.isInteger(value.to) || value.from < 1500 || value.to > 2100 || value.to < value.from || value.to - value.from > 100 || !Number.isInteger(value.width) || value.width < 1 || value.width > 20 || !Number.isInteger(value.step) || value.step < 1 || value.step > value.width || !["fixed", "changing"].includes(value.universe) || value.algorithm !== "leiden" || !Number.isFinite(value.resolution) || value.resolution <= 0 || !Number.isInteger(value.seed) || value.seed < 0) throw Error("Choose an ordered span up to 100 years, windows 1\u201320 years, step no wider than the window, fixed/changing universe and explicit Leiden CPM/seed.");
    if (Math.ceil((value.to - value.from + 1) / value.step) > 20) throw Error("At most 20 completed windows are supported. Increase the step or narrow the dates; no periods are sampled.");
    return value;
  }
  function temporalSupport(graph3) {
    if (graph3.temporalSelection) throw Error("Return to the full pinned map before computing another analysis. Completed windows are read-only analytical views.");
    if (graph3.collaboration || graph3.semantic || graph3.trial || graph3.directed || graph3.historiography || graph3.networkModel === "hypergraph" || (graph3.order ?? 2) !== 2 || !["leiden", "Leiden CPM", void 0].includes(graph3.clustering?.algorithm)) throw Error("Window tracking currently supports pairwise Leiden co-citation and source coupling only. Other methods, higher-order re-mining and joint temporal optimization are not implemented; no fallback is used.");
    if (graph3.nodes.length > 3e3) throw Error("Window tracking supports up to 3,000 analytical nodes. Narrow the analytical scope; no nodes are sampled.");
    if (graph3.links.length > 1e5 || graph3.nodes.reduce((sum, node2) => sum + (node2.articles?.length || node2.references?.length || 0), 0) > 5e5) throw Error("The parent exceeds 100,000 edges or 500,000 retained incidences. Narrow the analytical scope; no evidence is sampled.");
    if (graph3.extensionFilter || graph3.construction?.counting === "event-fractional" || graph3.counting === "fractional" || graph3.normalization && !(graph3.method === "coupling" || graph3.canvasKind === "coupling") && !["association_strength", "association", "Association strength"].includes(graph3.normalization)) throw Error("This parent has a filtered or alternative construction. Window tracking currently preserves full-count association-strength co-citation or cosine coupling only; restore that baseline first.");
    if (graph3.method !== "coupling" && graph3.canvasKind !== "coupling" && graph3.nodes.some((node2) => !Array.isArray(node2.articles))) throw Error("Pinned source-to-reference incidence is required for every parent reference.");
  }

  // scripts/publication-bursts.mjs
  function burstSettings(options = {}) {
    const settings = { kind: options.kind || "terms", from: Number(options.from), to: Number(options.to), width: Number(options.width ?? 1), scale: Number(options.scale ?? 2), penalty: Number(options.penalty ?? 1), states: Number(options.states ?? 3), minimumSupport: Number(options.minimumSupport ?? 3), vocabularyLimit: Number(options.vocabularyLimit ?? 100), minimumScore: Number(options.minimumScore ?? 0.3), textScope: options.textScope || "titles", excludeLatest: options.excludeLatest !== false };
    if (!["terms", "topics", "references"].includes(settings.kind) || !Number.isInteger(settings.from) || !Number.isInteger(settings.to) || settings.from < 1500 || settings.to > 2100 || settings.to < settings.from || settings.to - settings.from > 100 || !Number.isInteger(settings.width) || settings.width < 1 || settings.width > 10 || !Number.isFinite(settings.scale) || settings.scale <= 1 || settings.scale > 4 || !Number.isFinite(settings.penalty) || settings.penalty <= 0 || settings.penalty > 10 || !Number.isInteger(settings.states) || settings.states < 1 || settings.states > 5 || !Number.isInteger(settings.minimumSupport) || settings.minimumSupport < 1 || !Number.isInteger(settings.vocabularyLimit) || settings.vocabularyLimit < 2 || settings.vocabularyLimit > 200) throw Error("Choose bounded feature/year settings: up to 100 years, 1\u201310-year bins, scale >1\u20134, penalty >0\u201310, 1\u20135 elevated states and at most 200 features.");
    return settings;
  }

  // scripts/temporal-browser.mjs
  function mountTemporalBrowser() {
    if (window.ATLAS_TRIAL_WORKSPACE) return;
    const element6 = (tag, text = "") => {
      const node2 = document.createElement(tag);
      node2.textContent = text;
      return node2;
    }, panel4 = element6("details"), title = element6("summary", "Time windows & publication activity");
    panel4.id = "temporalControls";
    panel4.append(title);
    const form = element6("div");
    form.className = "semantic-controls";
    panel4.append(form);
    const field = (labelText, type, value) => {
      const label = element6("label", labelText), input = element6(type === "select" ? "select" : "input");
      if (type !== "select") input.type = type;
      input.value = value;
      label.append(input);
      form.append(label);
      return input;
    }, from = field("From publication year", "number", 2e3), to = field("Through publication year", "number", 2025), width = field("Window width \xB7 years", "number", 5), step = field("Step \xB7 years", "number", 5), universe = field("Node universe", "select");
    universe.append(new Option("Fixed parent nodes", "fixed"), new Option("Reselect within parent scope", "changing"));
    const cpm = field("Fixed Leiden CPM", "number", 0.02);
    cpm.step = "any";
    cpm.min = 1e-6;
    const seed = field("Leiden random seed", "number", 42);
    seed.min = 0;
    seed.step = 1;
    const burstKind = field("Activity feature", "select");
    for (const [value, text] of [["terms", "Literal title terms"], ["topics", "OpenAlex classifier topics"], ["references", "Cited references in parent scope"]]) burstKind.append(new Option(text, value));
    const penalty = field("Burst transition penalty", "number", 1);
    penalty.min = 0.05;
    penalty.max = 10;
    penalty.step = 0.05;
    const scale = field("Burst state multiplier", "number", 2);
    scale.min = 1.1;
    scale.max = 4;
    scale.step = 0.1;
    const excludeLabel = element6("label"), exclude = element6("input");
    exclude.type = "checkbox";
    exclude.checked = true;
    excludeLabel.append(exclude, document.createTextNode("Exclude potentially partial retrieval year (latest observed year if date unknown)"));
    panel4.append(excludeLabel);
    panel4.append(element6("p", "Windows rebuild pairwise Leiden evidence from source publication years, not a historical database replay. Fixed parent nodes or within-parent reselection; independent fits, not joint temporal Leiden. Activity uses distinct source documents divided by corpus publication exposure."));
    const actions = element6("div");
    actions.className = "science-actions";
    panel4.append(actions);
    const status = element6("p");
    status.setAttribute("role", "status");
    panel4.append(status);
    const button4 = (text, action3, parent = actions) => {
      const node2 = element6("button", text);
      node2.type = "button";
      node2.className = "secondary";
      node2.onclick = action3;
      parent.append(node2);
      return node2;
    }, build = button4("Build publication windows", () => run5("temporal-series")), bursts = button4("Find publication activity changes", () => run5("publication-bursts")), cancel2 = button4("Cancel", stop2);
    cancel2.hidden = true;
    const seriesView = element6("div"), burstView = element6("div");
    panel4.append(seriesView, burstView);
    const strip = element6("section");
    strip.id = "publicationTimeline";
    strip.className = "publication-timeline";
    strip.hidden = true;
    strip.setAttribute("aria-label", "Completed publication windows");
    document.querySelector(".map-intro").after(strip);
    let worker2, remoteJob, ticket = 0, currentSeries, baseSnapshot, activeCorpus, installedGraph;
    function stop2() {
      ticket++;
      worker2?.terminate();
      worker2 = null;
      remoteJob?.cancel();
      remoteJob = null;
      cancel2.hidden = true;
      build.disabled = bursts.disabled = !!window.atlasSharedCanvas?.graph()?.temporalSelection || window.BIBLIOMAP?.active && window.BIBLIOMAP.canCompute === false;
      status.textContent = "Stopped. Previous completed map and saved windows remain available.";
    }
    function download(value, name) {
      const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" })), link = element6("a");
      link.href = url;
      link.download = name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1e3);
    }
    function attach() {
      const host = document.querySelector("#analysisPanel .shell-panel-body") || document.querySelector(".community-controls");
      if (panel4.parentElement !== host) host.prepend(panel4);
    }
    function sync3(graph3) {
      if (installedGraph && installedGraph !== graph3 && (worker2 || remoteJob)) stop2();
      attach();
      const corpus = window.ATLAS_DATA?.summary?.corpus_id;
      if (activeCorpus !== corpus) {
        activeCorpus = corpus;
        currentSeries = null;
        baseSnapshot = null;
        seriesView.replaceChildren();
        burstView.replaceChildren();
        strip.hidden = true;
        const years = Object.values(window.ATLAS_DATA?.articles || {}).map(publicationYear).filter((year) => year !== null);
        if (years.length) {
          to.value = Math.max(...years);
          from.value = Math.max(Math.min(...years), Number(to.value) - 29);
        }
      }
      if (installedGraph?._resultId !== graph3._resultId) baseSnapshot = null;
      installedGraph = graph3;
      const footer = document.querySelector(".status-bar>span:last-child"), total = window.ATLAS_DATA?.summary?.source_corpus_size ?? Object.keys(window.ATLAS_DATA?.articles || {}).length;
      if (footer) footer.textContent = (graph3.temporalSelection ? graph3.temporal.sourceCount + " window sources of " + total + " pinned sources" : total + " pinned source articles") + " \xB7 Human validation pending";
      if (graph3.temporalSeries) {
        currentSeries = graph3.temporalSeries;
        const settings = currentSeries.settings;
        from.value = settings.from;
        to.value = settings.to;
        width.value = settings.width;
        step.value = settings.step;
        universe.value = settings.universe;
        cpm.value = settings.resolution;
        seed.value = settings.seed;
        renderSeries(graph3.temporalSelection?.index ?? null);
      } else {
        currentSeries = null;
        baseSnapshot = null;
        seriesView.replaceChildren();
        strip.hidden = true;
      }
      if (graph3.burstReport) renderBursts(graph3.burstReport);
      else burstView.replaceChildren();
      build.disabled = bursts.disabled = !!graph3.temporalSelection || window.BIBLIOMAP?.active && window.BIBLIOMAP.canCompute === false;
    }
    function local(stage, graph3, works, settings, generation5) {
      return new Promise((resolve, reject) => {
        const activeWorker = worker2 = new Worker("temporal-worker.js?v=coupling-errors-2");
        activeWorker.onmessage = (event) => {
          if (generation5 !== ticket) return;
          if (event.data.progress) {
            status.textContent = event.data.progress;
            return;
          }
          activeWorker.terminate();
          if (worker2 === activeWorker) worker2 = null;
          Object.hasOwn(event.data, "error") ? reject(Error(analysisErrorMessage(event.data.error))) : resolve(event.data.result);
        };
        activeWorker.onerror = (event) => {
          activeWorker.terminate();
          if (worker2 === activeWorker) worker2 = null;
          reject(Error(analysisErrorMessage(event)));
        };
        activeWorker.postMessage({ stage, graph: graph3, works, settings });
      });
    }
    async function run5(stage) {
      if (window.BIBLIOMAP?.active && window.BIBLIOMAP.canCompute === false) {
        status.textContent = "View-only project. Ask an editor to compute these results.";
        return;
      }
      stop2();
      const generation5 = ticket, canvas = window.atlasSharedCanvas, parent = canvas.graph(), corpus = window.ATLAS_DATA.summary.corpus_id;
      build.disabled = bursts.disabled = true;
      cancel2.hidden = false;
      status.textContent = "Preparing pinned publication evidence \xB7 previous map remains visible.";
      try {
        if (parent.temporalSelection) throw Error("Return to the full pinned map first. Completed windows are read-only analytical views.");
        let settings;
        if (stage === "temporal-series") {
          temporalSupport(parent);
          settings = temporalSettings({ from: +from.value, to: +to.value, width: +width.value, step: +step.value, universe: universe.value, resolution: +cpm.value, seed: +seed.value, algorithm: parent.clustering?.algorithm === "Leiden CPM" ? "leiden" : parent.clustering?.algorithm || "leiden" });
        } else settings = burstSettings({ kind: burstKind.value, from: +from.value, to: +to.value, penalty: +penalty.value, scale: +scale.value, excludeLatest: exclude.checked });
        let result;
        if (window.BIBLIOMAP?.active) {
          remoteJob = window.BIBLIOMAP.stage(parent, stage, settings, (message) => {
            if (generation5 === ticket) status.textContent = message;
          });
          result = await remoteJob.promise;
        } else {
          const evidence = await window.ATLAS_EVIDENCE.prepareDataset();
          if (evidence.sourceCorpusId !== corpus) throw Error("Pinned source evidence changed. Reopen this project.");
          result = await local(stage, parent, evidence.articles, settings, generation5);
        }
        if (generation5 !== ticket || canvas.graph() !== parent || window.ATLAS_DATA.summary.corpus_id !== corpus) return;
        if (stage === "temporal-series") {
          parent.temporalSeries = result;
          window.ATLAS_DESCRIPTIONS?.sync(parent);
          currentSeries = result;
          baseSnapshot = canvas.capture();
          renderSeries();
          status.textContent = result.windows.length + " completed windows \xB7 select any period to redraw without recomputing.";
        } else {
          parent.burstReport = result;
          renderBursts(result);
          status.textContent = "Activity model " + result.status + " \xB7 " + result.coverage.assessedFeatures + "/" + result.coverage.features + " features assessed. The map is unchanged.";
        }
        window.dispatchEvent(new CustomEvent("bibliomap:time-ready", { detail: parent }));
      } catch (problem) {
        if (generation5 === ticket) status.textContent = "No new result: " + analysisErrorMessage(problem);
      } finally {
        if (generation5 === ticket) {
          cancel2.hidden = true;
          build.disabled = bursts.disabled = !!window.atlasSharedCanvas?.graph()?.temporalSelection || window.BIBLIOMAP?.active && window.BIBLIOMAP.canCompute === false;
          remoteJob = null;
        }
      }
    }
    function select(index) {
      const canvas = window.atlasSharedCanvas, visible = canvas.graph(), series = visible.temporalSeries || currentSeries;
      if (!series?.windows[index]) return;
      if (!baseSnapshot || !visible.temporalSelection) baseSnapshot = canvas.capture();
      const next = structuredClone(series.windows[index].graph);
      Object.assign(next, { temporalSeries: series, temporalSelection: { index, settings: series.settings }, burstReport: visible.burstReport, _resultId: visible._resultId, _projectId: visible._projectId, _analysisKey: visible._analysisKey, _attachments: visible._attachments, sourceCorpusId: visible.sourceCorpusId });
      window.ATLAS_EVIDENCE.cancelCanvasReliability();
      if (next.canvasKind === "coupling") window.ATLAS_EVIDENCE.restoreCoupling(next);
      else canvas.showTemporal(next);
      sync3(canvas.graph());
      window.dispatchEvent(new CustomEvent("bibliomap:time-ready", { detail: canvas.graph() }));
      status.textContent = "Showing completed " + series.windows[index].from + "\u2013" + series.windows[index].to + " \xB7 no new calculation. Group numbers are local to this window.";
    }
    function fullMap() {
      const canvas = window.atlasSharedCanvas, visible = canvas.graph(), series = visible.temporalSeries || currentSeries;
      if (!series) return;
      if (baseSnapshot && !baseSnapshot.graph.temporalSelection) {
        canvas.restore(baseSnapshot);
        canvas.graph().temporalSeries = series;
      } else {
        const parent = structuredClone(series.parentGraph);
        Object.assign(parent, { temporalSeries: series, burstReport: visible.burstReport, _resultId: visible._resultId, _projectId: visible._projectId, _analysisKey: visible._analysisKey, _attachments: visible._attachments, sourceCorpusId: visible.sourceCorpusId });
        parent.appliedSettings ||= { settings: { label: "Full pinned parent analysis" } };
        if (parent.canvasKind === "coupling") window.ATLAS_EVIDENCE.restoreCoupling(parent);
        else canvas.showTemporal(parent);
      }
      sync3(canvas.graph());
      status.textContent = "Full pinned map restored \xB7 completed reports retained \xB7 no new calculation.";
      window.dispatchEvent(new CustomEvent("bibliomap:time-ready", { detail: canvas.graph() }));
    }
    function renderSeries(index = null) {
      strip.replaceChildren();
      strip.hidden = false;
      button4("Full pinned map", fullMap, strip);
      for (const [windowIndex, period] of currentSeries.windows.entries()) {
        const control = button4(period.from + "\u2013" + period.to + " \xB7 " + period.sourceCount, () => select(windowIndex), strip);
        control.setAttribute("aria-pressed", String(index === windowIndex));
        control.title = period.sourceCount + " distinct source publications \xB7 " + period.graph.stats.clusters + " local groups" + (period.truncatedBoundary ? " \xB7 truncated boundary window" : "") + (period.potentiallyPartial ? " \xB7 potentially partial latest period" : "");
      }
      seriesView.replaceChildren(element6("p", currentSeries.coverage.knownYear + "/" + currentSeries.coverage.sources + " sources have publication years; " + currentSeries.coverage.unknownYear + " unknown, " + currentSeries.coverage.outsideBoundary + " outside boundaries; " + currentSeries.windows.filter((window2) => window2.truncatedBoundary).length + " truncated boundary windows. " + currentSeries.settings.universe + " parent universe. Evidence date: " + (currentSeries.evidenceDate || currentSeries.evidence?.retrievedAt || "unknown") + ". " + (currentSeries.latestPeriod?.warning || (currentSeries.evidence?.retrievedAt ? "The retrieval year and later publication years may be partial; stored windows include them explicitly." : "Latest-period completeness is unknown.")) + " " + currentSeries.limitation));
      button4("Export complete windows & memberships", () => download(currentSeries, "bibliomap-publication-windows.json"), seriesView);
      const transitions = element6("details");
      transitions.append(element6("summary", "Community overlaps, split & merge candidates"));
      for (const transition of currentSeries.transitions) {
        const section = element6("details");
        section.append(element6("summary", currentSeries.windows[transition.fromWindow].from + " \u2192 " + currentSeries.windows[transition.toWindow].from + " \xB7 " + transition.commonAssignedBoth + "/" + transition.commonIds.length + " common nodes assigned both \xB7 " + transition.splits.length + " split / " + transition.merges.length + " merge candidates"));
        section.append(element6("p", transition.firstOnly.length + " leave node universe; " + transition.secondOnly.length + " enter; " + transition.firstUnassigned + "/" + transition.secondUnassigned + " common nodes unassigned. " + transition.interpretation));
        for (const overlap of transition.overlaps.slice(0, 30)) {
          const row = element6("details");
          row.append(element6("summary", "Group " + overlap.from + " \u2192 " + overlap.to + " \xB7 " + overlap.count + " members \xB7 " + (100 * overlap.fromShare).toFixed(0) + "% earlier / " + (100 * overlap.toShare).toFixed(0) + "% later"));
          row.append(element6("p", overlap.members.join(", ")));
          for (const id of overlap.members.slice(0, 20)) {
            const member = currentSeries.windows[transition.toWindow].graph.nodes.find((node2) => node2.id === id);
            button4("Inspect " + (member?.label || member?.title || id), () => {
              select(transition.toWindow);
              window.atlasInspectReference(id);
            }, row);
          }
          if (overlap.members.length > 20) row.append(element6("p", "First 20 member inspection buttons; all IDs are retained above and in export."));
          section.append(row);
        }
        if (transition.overlaps.length > 30) section.append(element6("p", "First 30 overlaps shown; all memberships/unmatched groups are in the complete export."));
        transitions.append(section);
      }
      seriesView.append(transitions);
    }
    function renderBursts(report) {
      burstView.replaceChildren(element6("h3", "Publication activity \xB7 " + report.status), element6("p", report.coverage.knownYear + "/" + report.coverage.sources + " dated sources \xB7 " + report.coverage.unknownYear + " unknown \xB7 " + report.coverage.exposedPeriods + " exposed periods. " + report.latestPeriod.warning), element6("p", report.baseline), element6("p", report.limitation));
      button4("Export activity, counts & sensitivity", () => download(report, "bibliomap-publication-activity.json"), burstView);
      const methodology = element6("details");
      methodology.append(element6("summary", "Model and exposure coverage"), element6("p", report.method));
      const reference = element6("a", "Kleinberg \xB7 original batched-document model");
      reference.href = report.reference;
      reference.target = "_blank";
      reference.rel = "noopener";
      methodology.append(reference);
      for (const period of report.periods) methodology.append(element6("p", period.from + "\u2013" + period.to + " \xB7 " + period.exposure + " usable model exposure of " + period.allSourceExposure + " corpus sources \xB7 " + period.availableMetadata + " with observed feature metadata / " + period.unavailableMetadata + " without \xB7 " + period.status));
      burstView.append(methodology);
      for (const feature of report.features.slice(0, 20)) {
        const row = element6("details");
        row.append(element6("summary", feature.label + " \xB7 " + feature.fit.intervals.length + " elevated-state intervals \xB7 " + feature.totalSources + " sources"));
        row.append(element6("p", feature.fit.reason || "Whole-span observed share " + (100 * feature.fit.baseRate).toFixed(2) + "% \xB7 " + feature.unknownYearSupport + " supporting sources have unknown years."));
        for (const period of feature.periods) row.append(element6("p", period.from + "\u2013" + period.to + ": " + period.count + "/" + period.exposure + " \xB7 " + (period.rate === null ? "no exposure" : (100 * period.rate).toFixed(1) + "%") + " \xB7 state " + (feature.fit.states[feature.periods.indexOf(period)] ?? "not assessed") + (period.baselineFlag ? " \xB7 descriptive 2\xD7share baseline flag" : "")));
        for (const interval of feature.fit.intervals) row.append(element6("p", "Elevated state " + interval.level + " \xB7 " + interval.from + "\u2013" + interval.to + " \xB7 " + interval.sourceCount + " distinct source publications"));
        const sources = element6("details");
        sources.append(element6("summary", "Inspect supporting source articles"));
        const articles = window.ATLAS_DATA?.articles || {};
        for (const id of feature.sourceIds.slice(0, 50)) {
          const article = articles[id] || {}, source = element6("details");
          source.append(element6("summary", article.title || article.display_name || id), element6("p", (article.year || article.publication_year || "Publication year unknown") + " \xB7 " + id));
          if (id.startsWith("https://openalex.org/W")) {
            const link = element6("a", "Open source record");
            link.href = id;
            link.target = "_blank";
            link.rel = "noopener";
            source.append(link);
          }
          sources.append(source);
        }
        if (feature.sourceIds.length > 50) sources.append(element6("p", "First 50 sources shown; complete IDs are exported."));
        row.append(sources);
        burstView.append(row);
      }
      if (report.features.length > 20) burstView.append(element6("p", "First 20 ranked features shown; all counts/source IDs are exported."));
      const sensitivity = element6("details");
      sensitivity.append(element6("summary", "Parameter, binning, partial-year & metadata sensitivity"));
      for (const check of report.sensitivity) sensitivity.append(element6("p", "Penalty " + check.settings.penalty + " \xB7 multiplier " + check.settings.scale + " \xB7 " + check.settings.width + "-year bins \xB7 " + (check.settings.excludeLatest ? "exclude" : "include") + " partial year \xB7 " + (check.settings.denominator || "all-source") + " denominator \xB7 " + check.assessedFeatures + " features assessed / " + check.features.filter((feature) => feature.intervals.length).length + " with elevated states."));
      burstView.append(sensitivity);
    }
    form.addEventListener("input", () => {
      if (worker2 || remoteJob) stop2();
    });
    form.addEventListener("change", () => {
      if (worker2 || remoteJob) stop2();
    });
    exclude.onchange = () => {
      if (worker2 || remoteJob) stop2();
    };
    window.ATLAS_TEMPORAL = { sync: sync3, select, stop: stop2, open: () => {
      attach();
      panel4.open = true;
      window.atlasWorkspaceShell?.show("analysis");
      window.atlasWorkspaceShell?.reveal(panel4);
    } };
    attach();
    const open2 = button4("Time windows & activity", () => window.ATLAS_TEMPORAL.open(), document.querySelector(".workspace-tabs"));
    open2.id = "workspace-time";
    open2.setAttribute("aria-label", "Open time windows and publication activity controls");
    window.addEventListener("bibliomap:selection-changed", () => {
      stop2();
      currentSeries = null;
      baseSnapshot = null;
      strip.hidden = true;
    });
    document.addEventListener("click", (event) => {
      if (event.target.closest(".workspace-tabs button") && event.target.id !== "workspace-time") stop2();
    });
    document.addEventListener("DOMContentLoaded", () => sync3(window.atlasSharedCanvas.graph()), { once: true });
  }

  // scripts/coupling-install.mjs
  function retainCouplingBaseline(graph3, settings) {
    if (!["leiden", "Leiden CPM"].includes(graph3?.clustering?.algorithm) || graph3.networkModel === "hypergraph" || graph3.temporalSelection) return null;
    return { graph: { ...graph3, nodes: graph3.nodes.map((node2) => ({ ...node2 })) }, settings: { ...settings } };
  }
  function reuseCouplingBaseline(baseline, settings) {
    if (!baseline || ["minimumShared", "minimumCosine", "resolution"].some((key) => (baseline.settings[key] ?? null) !== (settings[key] ?? null))) return null;
    return { ...baseline.graph, nodes: baseline.graph.nodes.map((node2) => ({ ...node2 })) };
  }
  function completeCouplingDiagnostics(graph3) {
    const memberships = Object.fromEntries(graph3.nodes.filter((node2) => node2.cluster > 0).map((node2) => [node2.id, node2.cluster]));
    return { ...graph3, clustering: { ...graph3.clustering, clusters: new Set(Object.values(memberships)).size }, fragmentation: graph3.temporal || !graph3.fragmentation ? fragmentation(graph3, memberships) : graph3.fragmentation };
  }

  // scripts/collaboration-networks.mjs
  function linkedSourceScope(graph3) {
    if (!graph3 || !(graph3.canvasKind === "coupling" || graph3.semantic && graph3.entityKind === "source")) return null;
    return { kind: graph3.canvasKind === "coupling" ? "coupling" : "source-text", evidenceId: graph3.evidenceProvenance?.evidenceId || null, parentAnalysisFingerprint: graph3.scientificManifest?.fingerprints?.analysis || null, parentFingerprintStatus: graph3.scientificManifest?.fingerprints?.analysis ? "Recorded completed analysis fingerprint" : "No historical fingerprint retained; explicit construction/memberships below identify the observed linkage.", construction: { method: graph3.method, counting: graph3.counting, normalization: graph3.normalization, minimumShared: graph3.minimumShared ?? null, minimumCosine: graph3.minimumCosine ?? null, clustering: graph3.clustering || null, semantic: graph3.semantic ? { kind: graph3.semantic.kind, textScope: graph3.semantic.textScope, minimumSimilarity: graph3.semantic.minimumSimilarity, model: graph3.semantic.model, textFingerprint: graph3.semantic.textFingerprint, embeddingFingerprint: graph3.semantic.embeddingFingerprint, implementationVersion: graph3.semantic.implementationVersion || graph3.semantic.version } : null }, nodes: graph3.nodes.map((node2) => ({ id: node2.id, cluster: node2.cluster })) };
  }
  var clean = (value) => String(value || "").normalize("NFKC").replace(/\s+/g, " ").trim();
  var unique = (values) => [...new Set(values)].sort();
  var actorId = (value, kind) => typeof value === "string" && new RegExp("^(?:https?://openalex\\.org/)?" + (kind === "author" ? "A" : "I") + "\\d+$", "i").test(value) ? "https://openalex.org/" + value.split("/").pop().toUpperCase() : null;
  async function preparedCollaborationEvidence(works, supplemental, corpusId, useSupplement = false, privateContext = false) {
    if (!useSupplement) return { works, supplementalMetadata: null };
    if (privateContext) throw Error("Private project evidence cannot use the public supplemental metadata endpoint.");
    if (!supplemental || supplemental.sourceCorpusId !== corpusId || supplemental.publicCorpus !== true || supplemental.works.length !== works.length) throw Error("Supplemental metadata does not match the complete allowlisted public source corpus.");
    const expected = new Map(works.map((work) => [work.id, work]));
    if (new Set(supplemental.works.map((work) => work.id)).size !== works.length || supplemental.works.some((work) => !expected.has(work.id) || clean(work.title) !== clean(expected.get(work.id).title || expected.get(work.id).display_name))) throw Error("Supplemental source IDs or titles differ from the pinned public corpus.");
    const checksum = await scienceDigest(supplemental.works);
    if (checksum !== supplemental.checksum) throw Error("Supplemental metadata checksum failed.");
    const lookup = new Map(supplemental.works.map((work) => [work.id, work]));
    return { works: works.map((work) => {
      const extra = lookup.get(work.id);
      if (Array.isArray(work.authorships) && JSON.stringify(work.authorships) !== JSON.stringify(extra.authorships)) throw Error("Retained authorships differ from the supplemental pin.");
      return { ...work, authors_count: work.authors_count ?? extra.authors_count, authorships: work.authorships || extra.authorships };
    }), supplementalMetadata: { checksum, sourceCorpusId: corpusId, preparedAt: supplemental.preparedAt, retrievedAt: supplemental.retrievedAt || null, extractionVersion: supplemental.extractionVersion, sourceFileChecksum: supplemental.sourceFileChecksum, scope: "Exact allowlisted public source IDs and titles. Retained authorship/affiliation evidence only; independently pinned, not a fresh retrieval or verified historical metadata completeness." } };
  }
  function collaborationSettings(options = {}) {
    const settings = { kind: options.kind || "author", counting: options.counting || "fractional-pair", minimumPublications: Number(options.minimumPublications ?? 1), minimumSupport: Number(options.minimumSupport ?? 1), resolution: Number(options.resolution ?? 0.02), seed: Number(options.seed ?? 42), institutionPolicy: options.institutionPolicy || "direct", parentInstitutionId: options.parentInstitutionId || null, maximumTeamSize: options.maximumTeamSize == null || options.maximumTeamSize === "" ? null : Number(options.maximumTeamSize), affiliationPolicy: options.affiliationPolicy || "all-recorded", identityScenario: options.identityScenario || null };
    if (!["author", "institution", "country"].includes(settings.kind) || !["full-pair", "fractional-pair"].includes(settings.counting) || !["direct", "recorded-parent"].includes(settings.institutionPolicy) || !["all-recorded", "single-institution-authorships"].includes(settings.affiliationPolicy)) throw Error("Unsupported collaboration construction.");
    if (!Number.isInteger(settings.minimumSupport) || settings.minimumSupport < 1 || settings.minimumSupport > 5e4 || !Number.isFinite(settings.resolution) || settings.resolution <= 0 || settings.resolution > 1 || !Number.isInteger(settings.seed) || settings.seed < 0 || settings.maximumTeamSize != null && (!Number.isInteger(settings.maximumTeamSize) || settings.maximumTeamSize < 2 || settings.maximumTeamSize > 1e3)) throw Error("Collaboration settings exceed the supported bounds.");
    if (settings.institutionPolicy === "recorded-parent" && !actorId(settings.parentInstitutionId, "institution")) throw Error("Choose an explicit recorded OpenAlex parent institution ID. No parent is inferred from a name.");
    if (settings.identityScenario && (settings.kind !== "author" || !clean(settings.identityScenario.note))) throw Error("Identity scenarios require author nodes and an explicit human audit note.");
    if (!Number.isInteger(settings.minimumPublications) || settings.minimumPublications < 1 || settings.minimumPublications > 5e4) throw Error("Actor publication minimum must be 1\u201350,000 distinct works in this pinned corpus, not global citations.");
    return settings;
  }
  function collaborationEgo(parent, seedId, hops = 1) {
    if (!parent.collaboration || parent.collaboration.ego || !parent.nodes.some((node2) => node2.id === seedId) || ![1, 2].includes(hops)) throw Error("Choose a retained actor in a full collaboration map, with one or two hops.");
    const selected = /* @__PURE__ */ new Set([seedId]);
    for (let hop = 0; hop < hops; hop++) {
      const next = new Set(selected);
      for (const edge of parent.links) {
        if (selected.has(edge.source)) next.add(edge.target);
        if (selected.has(edge.target)) next.add(edge.source);
      }
      for (const id of next) selected.add(id);
    }
    if (selected.size > 1e3) throw Error("The ego view exceeds 1,000 actors. Use one hop or a narrower graph. No neighbors are sampled.");
    const graph3 = structuredClone(parent);
    graph3.nodes = graph3.nodes.filter((node2) => selected.has(node2.id));
    graph3.links = graph3.links.filter((edge) => selected.has(edge.source) && selected.has(edge.target));
    delete graph3.scienceAudit;
    delete graph3.scientificManifest;
    delete graph3.collaborationSensitivity;
    const degrees = new Map(graph3.nodes.map((node2) => [node2.id, 0]));
    for (const edge of graph3.links) {
      degrees.set(edge.source, degrees.get(edge.source) + 1);
      degrees.set(edge.target, degrees.get(edge.target) + 1);
    }
    for (const node2 of graph3.nodes) node2.degree = degrees.get(node2.id);
    graph3.themeDescriptions = Object.fromEntries(unique(graph3.nodes.filter((node2) => node2.cluster > 0).map((node2) => node2.cluster)).map((cluster) => {
      const members = graph3.nodes.filter((node2) => node2.cluster === cluster), sources = new Set(members.flatMap((node2) => node2.articles)), previous = parent.themeDescriptions?.[cluster], keywords = (previous?.keywords || []).map((keyword) => ({ ...keyword, sources: keyword.sources.filter((source) => sources.has(source.id)) })).filter((keyword) => keyword.sources.length).sort((left, right) => right.sources.length - left.sources.length || left.text.localeCompare(right.text));
      return [cluster, { heading: keywords.slice(0, 2).map((keyword) => keyword.text).join(" \xB7 ") || members[0].label, keywords, representatives: (previous?.representatives || []).filter((record3) => sources.has(record3.id)), total: sources.size, evidenceMode: "Associated source titles \xB7 induced scope", method: "Retained observed parent title words filtered to the distinct source works associated with ego actors; not a re-mined theme or full-parent sensitivity result." }];
    }));
    graph3.collaboration.ego = { seedId, hops, nodeIds: [...selected].sort(), parentNodes: parent.nodes.length, parentEdges: parent.links.length, boundaryEdges: parent.links.filter((edge) => selected.has(edge.source) !== selected.has(edge.target)).length, definition: "Induced neighborhood of the completed parent graph. Parent cluster labels are retained; this is view-only, not reclustering. Parent metadata coverage remains full-pinned evidence; displayed degrees and any local roles describe only this induced scope." };
    graph3.egoParent = structuredClone(parent);
    graph3.stats = { ...graph3.stats, nodes: graph3.nodes.length, edges: graph3.links.length, isolated_nodes: graph3.nodes.filter((node2) => !node2.degree).length, clusters: new Set(graph3.nodes.filter((node2) => node2.cluster > 0).map((node2) => node2.cluster)).size };
    return graph3;
  }

  // scripts/collaboration-browser.mjs
  function mountCollaborationBrowser() {
    if (window.ATLAS_TRIAL_WORKSPACE) return;
    const element6 = (tag, text = "") => {
      const node2 = document.createElement(tag);
      node2.textContent = text;
      return node2;
    }, button4 = (text, action3) => {
      const node2 = element6("button", text);
      node2.type = "button";
      node2.onclick = action3;
      return node2;
    }, panel4 = element6("details");
    panel4.id = "collaborationControls";
    panel4.append(element6("summary", "Collaboration maps \xB7 observed authorships & affiliations"));
    const form = element6("form");
    form.className = "semantic-controls";
    panel4.append(form);
    const field = (labelText, type, value) => {
      const label = element6("label", labelText), input = element6(type === "select" ? "select" : type === "textarea" ? "textarea" : "input");
      if (!["select", "textarea"].includes(type)) input.type = type;
      if (value != null) input.value = value;
      label.append(input);
      form.append(label);
      return input;
    };
    const kind = field("Actors", "select");
    for (const [value, text] of [["author", "Authors \xB7 stable IDs"], ["institution", "Institutions \xB7 work affiliations"], ["country", "Countries \xB7 work affiliations"]]) kind.append(new Option(text, value));
    const counting = field("Pair contributions per source", "select");
    counting.append(new Option("Fractional \xB7 one total pair unit per work", "fractional-pair"), new Option("Full \xB7 one unit per observed pair", "full-pair"));
    const support = field("Minimum distinct source support", "number", 1);
    support.min = 1;
    support.step = 1;
    const publications = field("Minimum source works per actor \xB7 in this corpus, not global citations", "number", 2);
    publications.min = 1;
    publications.step = 1;
    const cpm = field("Leiden CPM \xB7 3 seeded starts", "number", 0.02);
    cpm.step = "any";
    cpm.min = 1e-6;
    cpm.max = 1;
    const policy = field("Institution identity policy", "select");
    policy.append(new Option("Direct retained institutions", "direct"), new Option("Collapse only recorded ancestry to explicit parent", "recorded-parent"));
    const parent = field("Recorded parent OpenAlex institution ID", "text", "");
    parent.placeholder = "https://openalex.org/I\u2026";
    const maximum = field("Exclude reported/retained teams larger than \xB7 blank keeps all", "number", "");
    maximum.min = 2;
    maximum.max = 1e3;
    const affiliation = field("Affiliations", "select");
    affiliation.append(new Option("All recorded affiliations", "all-recorded"), new Option("Only single-institution authorships", "single-institution-authorships"));
    const scenarioDetails = element6("details");
    scenarioDetails.append(element6("summary", "Human-audited author identity alternative"));
    const scenario = element6("textarea");
    scenario.setAttribute("aria-label", "Audited identity scenario JSON");
    scenario.placeholder = '{"note":"Why I audited these identities","merges":[{"from":["https://openalex.org/A1"],"into":"https://openalex.org/A2"}]}';
    scenarioDetails.append(element6("p", "Optional explicit sensitivity scenario, not automatic disambiguation. Merge only observed IDs. Splits assign observed source IDs to named local audit: keys. No identity probabilities are invented."), scenario);
    panel4.append(scenarioDetails);
    const auditForm = element6("div");
    auditForm.className = "semantic-controls";
    scenarioDetails.insertBefore(auditForm, scenario);
    const auditField = (labelText, type) => {
      const label = element6("label", labelText), input = element6(type);
      label.append(input);
      auditForm.append(label);
      return input;
    }, auditMode = auditField("Audited alternative", "select"), auditFrom = auditField("Observed author", "select"), auditInto = auditField("Merge into existing author", "select"), auditNote = auditField("What did you verify?", "textarea"), auditLabel = auditField("Split person label \xB7 local, not a new OpenAlex record", "input"), auditKey = auditField("Local split identity key", "input");
    auditMode.append(new Option("Combine two observed identities", "merge"), new Option("Separate selected source works", "split"));
    auditKey.value = "audit:reviewed-person";
    const auditWorks = element6("details");
    auditWorks.append(element6("summary", "Source works assigned to the split identity"));
    scenarioDetails.append(auditWorks);
    const auditBuild = button4("Build this audited alternative", () => {
      try {
        if (!auditNote.value.trim()) throw Error("Describe the evidence you personally checked. This note is private to the project.");
        let identity;
        if (auditMode.value === "merge") {
          if (auditFrom.value === auditInto.value) throw Error("Choose two different observed identities.");
          identity = { note: auditNote.value, merges: [{ from: [auditFrom.value], into: auditInto.value }] };
        } else {
          const sourceIds = [...auditWorks.querySelectorAll("input:checked")].map((input) => input.value);
          if (!sourceIds.length) throw Error("Choose the observed source works that belong to the separate person.");
          identity = { note: auditNote.value, splits: [{ actorId: auditFrom.value, assignments: [{ targetId: auditKey.value, label: auditLabel.value, sourceIds }] }] };
        }
        scenario.value = JSON.stringify(identity, null, 2);
        run5(false);
      } catch (problem) {
        status.textContent = analysisErrorMessage(problem);
      }
    });
    scenarioDetails.append(auditBuild);
    auditFrom.onchange = () => {
      auditWorks.replaceChildren(element6("summary", "Source works assigned to the split identity"));
      const node2 = window.atlasSharedCanvas.graph().nodes.find((node3) => node3.id === auditFrom.value);
      if (!node2) return;
      let shown = 0;
      const more = button4("Show more source works", () => append());
      const append = () => {
        for (const id of node2.articles.slice(shown, shown + 50)) {
          const label = element6("label"), input = element6("input");
          input.type = "checkbox";
          input.value = id;
          label.append(input, document.createTextNode(window.ATLAS_DATA.articles[id]?.title || id));
          auditWorks.append(label);
        }
        shown = Math.min(shown + 50, node2.articles.length);
        more.hidden = shown === node2.articles.length;
        more.textContent = "Show more source works \xB7 " + shown + "/" + node2.articles.length;
        auditWorks.append(more);
      };
      append();
    };
    const optLabel = element6("label"), opt = element6("input");
    opt.type = "checkbox";
    optLabel.append(opt, document.createTextNode("Use independently pinned public adaptive authorship supplement (only if source records lack IDs)"));
    panel4.append(optLabel);
    const actions = element6("div");
    actions.className = "science-actions";
    const build = button4("Build collaboration map", () => run5(false)), check = button4("Check construction sensitivity", () => run5(true)), cancel2 = button4("Cancel", stop2), back = button4("Full collaboration map", () => {
      const graph3 = window.atlasSharedCanvas.graph();
      if (graph3.egoParent) {
        window.atlasSharedCanvas.showCollaboration(graph3.egoParent);
        status.textContent = "Full completed collaboration map restored \xB7 no new computation.";
        window.dispatchEvent(new Event("bibliomap:collaboration-display"));
      }
    });
    cancel2.hidden = true;
    actions.append(build, check, cancel2, back);
    panel4.append(actions);
    const status = element6("p", "Choose observed actors and a counting rule. The previous map remains visible while a new result is built.");
    status.setAttribute("role", "status");
    const construction = element6("p"), reports = element6("div");
    panel4.append(status, construction, reports, element6("p", "Co-authorship/co-affiliation are observed metadata relationships, not proof of interpersonal collaboration, agreement or contribution. Names are labels, never identity keys. Citation Auto CPM, citation bootstrap/nulls, hypergraph combinations and actor-ID AI descriptions do not apply."));
    auditForm.addEventListener("input", () => {
      if (worker2 || remoteJob) stop2();
    });
    auditForm.addEventListener("change", () => {
      if (worker2 || remoteJob) stop2();
    });
    form.onsubmit = (event) => {
      event.preventDefault();
      run5(false);
    };
    let generation5 = 0, worker2, remoteJob, sourceRecords, corpus, previousGraph;
    const settings = () => collaborationSettings({ kind: kind.value, counting: counting.value, minimumPublications: +publications.value, minimumSupport: +support.value, resolution: +cpm.value, institutionPolicy: policy.value, parentInstitutionId: parent.value || null, maximumTeamSize: maximum.value || null, affiliationPolicy: affiliation.value, identityScenario: scenario.value.trim() ? JSON.parse(scenario.value) : null });
    function stop2() {
      generation5++;
      worker2?.terminate();
      worker2 = null;
      remoteJob?.cancel();
      remoteJob = null;
      cancel2.hidden = true;
      build.disabled = check.disabled = window.BIBLIOMAP?.active && window.BIBLIOMAP.canCompute === false;
      status.textContent = "Stopped. The previous completed map remains visible.";
    }
    for (const input of [...form.elements, scenario, opt]) input.addEventListener("change", () => {
      if (worker2 || remoteJob) stop2();
    });
    async function evidence(graph3, useSupplement) {
      const packet = await window.ATLAS_EVIDENCE.prepareDataset();
      if (packet.sourceCorpusId !== window.ATLAS_DATA.summary.corpus_id) throw Error("Source evidence changed.");
      let extra = null;
      if (useSupplement) {
        if (window.BIBLIOMAP?.active || window.atlasSharedCanvas.currentCorpus()) throw Error("Public metadata supplements cannot be used for private/project evidence.");
        const response = await fetch("workspace-api/public-collaboration-metadata?corpus=" + encodeURIComponent(packet.sourceCorpusId));
        if (!response.ok) throw Error("The allowlisted public authorship supplement is unavailable. No data was retrieved or inferred.");
        extra = await response.json();
      }
      const prepared = await preparedCollaborationEvidence(packet.articles, extra, packet.sourceCorpusId, useSupplement, !!window.BIBLIOMAP?.active);
      sourceRecords = prepared.works;
      corpus = packet.sourceCorpusId;
      return { ...prepared, packet };
    }
    function task(request, ticket) {
      return new Promise((resolve, reject) => {
        const activeWorker = worker2 = new Worker("collaboration-worker.js?v=coupling-errors-2");
        activeWorker.onmessage = (event) => {
          if (ticket !== generation5) return;
          if (event.data.progress) {
            status.textContent = event.data.progress;
            return;
          }
          activeWorker.terminate();
          if (worker2 === activeWorker) worker2 = null;
          Object.hasOwn(event.data, "error") ? reject(Error(analysisErrorMessage(event.data.error))) : resolve(event.data.result);
        };
        activeWorker.onerror = (event) => {
          activeWorker.terminate();
          if (worker2 === activeWorker) worker2 = null;
          reject(Error(analysisErrorMessage(event)));
        };
        activeWorker.postMessage(request);
      });
    }
    async function run5(sensitivity, force = false) {
      if (window.BIBLIOMAP?.active && window.BIBLIOMAP.canCompute === false) {
        status.textContent = "View-only project. An editor must build or check the network.";
        return;
      }
      stop2();
      const ticket = generation5, canvas = window.atlasSharedCanvas, base = canvas.graph(), id = window.ATLAS_DATA.summary.corpus_id;
      build.disabled = check.disabled = true;
      cancel2.hidden = false;
      status.textContent = "Preparing observed authorship evidence \xB7 previous map shown.";
      try {
        if (base.temporalSelection || base.collaboration?.ego) throw Error("Return to the full pinned map before starting analytical work.");
        if (sensitivity && !base.collaboration) throw Error("Build a collaboration map first.");
        const options = sensitivity ? collaborationSettings(base.collaboration) : settings();
        let result;
        if (window.BIBLIOMAP?.active) {
          if (opt.checked) throw Error("Private evidence cannot use the public supplement.");
          remoteJob = window.BIBLIOMAP.stage(base, sensitivity ? "collaboration-sensitivity" : "collaboration-network", options, (message) => {
            if (ticket === generation5) status.textContent = message;
          }, force);
          result = await remoteJob.promise;
        } else {
          const prepared = await evidence(base, sensitivity ? !!base.collaboration.supplementalMetadata : opt.checked), reference = base.collaboration?.referenceScope || base.semantic?.referenceScope || (!base.semantic && !base.collaboration && base.canvasKind !== "coupling" ? { nodes: base.nodes.map((node2) => ({ id: node2.id, key: node2.key, aliases: [...node2.aliases || [], ...node2.variants || []], label: node2.label, cluster: node2.cluster })) } : window.atlasEvidenceContext()?.graph);
          result = await task({ action: sensitivity ? "sensitivity" : "build", works: prepared.works, settings: options, graph: base, context: { sourceCorpusId: id, externalCorpus: base.externalCorpus, evidenceProvenance: base.evidenceProvenance, supplementalMetadata: prepared.supplementalMetadata, referenceScope: reference, linkedWorkScope: base.collaboration?.linkedWorkScope || linkedSourceScope(base) } }, ticket);
        }
        if (ticket !== generation5 || canvas.graph() !== base || id !== window.ATLAS_DATA.summary.corpus_id) return;
        if (sensitivity) {
          base.collaborationSensitivity = result;
          renderReport(result);
          status.textContent = result.completed + "/" + result.attempted + " construction alternatives completed; displayed memberships unchanged.";
          window.dispatchEvent(new CustomEvent("bibliomap:collaboration-check", { detail: base }));
          return;
        }
        if (base.canvasKind === "coupling" || base.semantic && base.entityKind === "source") previousGraph = base;
        window.ATLAS_HISTORY?.deactivate();
        canvas.showCollaboration(result);
        window.dispatchEvent(new CustomEvent("bibliomap:collaboration-ready", { detail: result }));
        status.textContent = result.nodes.length + " " + method3(result).plural + " \xB7 " + result.links.length + " observed connections.";
      } catch (problem) {
        if (ticket === generation5) status.textContent = "No new collaboration result: " + analysisErrorMessage(problem);
      } finally {
        if (ticket === generation5) {
          build.disabled = check.disabled = false;
          cancel2.hidden = true;
          remoteJob = null;
        }
      }
    }
    function renderReport(report) {
      reports.replaceChildren(element6("h3", "Construction sensitivity"), element6("p", report.completed + "/" + report.attempted + " alternatives completed \xB7 " + report.limitation));
      for (const item of report.variants) reports.append(element6("p", item.settings.counting + " \xB7 actor works \u2265" + item.settings.minimumPublications + " \xB7 team cap " + (item.settings.maximumTeamSize || "none") + " \xB7 " + item.settings.affiliationPolicy + " \xB7 " + (item.reason || item.nodes + " actors / " + item.edges + " lines \xB7 edge overlap " + (100 * item.edgeJaccard).toFixed(1) + "%")));
    }
    function method3(graph3) {
      const kind2 = graph3.entityKind, noun = kind2 === "country" ? "Country" : kind2 === "institution" ? "Institution" : "Author", plural = kind2 === "country" ? "countries" : kind2 + "s";
      return { title: noun + " collaboration \xB7 observed " + (kind2 === "author" ? "co-authorship" : "co-affiliation"), node: noun, plural, group: "Cluster", size: "Distinct associated source works", edge: "Distinct co-occurring source works", question: kind2 === "author" ? "Who appears together on the same work?" : "Which affiliations appear on the same work?", explanation: graph3.collaboration.evidencePolicy, weight: graph3.counting === "fractional-pair" ? "Pair weight: 2/[n(n\u22121)] per work, one total unit across the observed team before actor publication cutoff. Removed actor pair mass is not redistributed. Raw support separately counts distinct source works." : "Pair weight: one per observed pair per work. Raw support counts distinct source works.", caveat: graph3.collaboration.limitations };
    }
    function inspectNode(graph3, node2, host, sourceArticles, selectNode) {
      host.append(element6("h2", node2.label), element6("p", node2.id), element6("p", node2.articles.length + " distinct associated source works. " + method3(graph3).explanation));
      const evidence2 = element6("details");
      evidence2.append(element6("summary", "Associated source works & affiliation evidence"));
      sourceArticles(evidence2, node2.articles.slice(0, 50));
      if (node2.articles.length > 50) evidence2.append(element6("p", "First50shown; all source IDs and affiliations remain in Export data."));
      const raw = element6("details");
      raw.append(element6("summary", "Recorded authorships / affiliations"), element6("pre", JSON.stringify(node2.evidence, null, 2)));
      host.append(evidence2, raw);
      if (!graph3.collaboration.ego) {
        for (const hops of [1, 2]) host.append(button4("Show " + hops + "-hop induced ego view", () => {
          try {
            window.atlasSharedCanvas.showCollaboration(collaborationEgo(graph3, node2.id, hops));
            window.dispatchEvent(new Event("bibliomap:collaboration-display"));
          } catch (problem) {
            status.textContent = analysisErrorMessage(problem);
          }
        }));
      } else host.append(element6("p", graph3.collaboration.ego.definition));
      const neighbors = element6("details");
      neighbors.append(element6("summary", "Connected " + method3(graph3).plural));
      for (const edge of graph3.links.filter((edge2) => edge2.source === node2.id || edge2.target === node2.id).slice(0, 100)) {
        const other = graph3.nodes.find((item) => item.id === (edge.source === node2.id ? edge.target : edge.source));
        neighbors.append(button4(other.label, () => selectNode(other.id)));
      }
      host.append(neighbors);
      linked(graph3, host, new Set(node2.articles), sourceArticles);
    }
    function inspectEdge(graph3, edge, host, sourceArticles) {
      host.append(element6("h2", edge.rawSupport + " distinct co-occurring source works"), element6("p", "Analytical weight " + edge.strength.toPrecision(5) + " \xB7 " + graph3.counting), element6("p", method3(graph3).caveat));
      sourceArticles(host, edge.articles);
    }
    async function linked(graph3, host, ids, sourceArticles) {
      const details = element6("details");
      details.append(element6("summary", "Linked articles & intellectual foundations"));
      host.append(details);
      sourceArticles(details, [...ids].slice(0, 50));
      const linkedScope = graph3.collaboration.linkedWorkScope;
      if (linkedScope) {
        const groups = /* @__PURE__ */ new Map();
        for (const node2 of linkedScope.nodes) if (ids.has(node2.id)) {
          if (!groups.has(node2.cluster)) groups.set(node2.cluster, []);
          groups.get(node2.cluster).push(node2.id);
        }
        details.append(element6("p", "Observed source-ID linkage to the retained " + linkedScope.kind + " partition; actor and article universes are not compared using ARI."));
        for (const [cluster, members] of [...groups].sort((left, right) => right[1].length - left[1].length).slice(0, 8)) {
          const row = element6("details");
          row.append(element6("summary", (cluster > 0 ? "Source " + linkedScope.kind + " group " + cluster : "Unassigned sources") + " \xB7 " + members.length + " associated source works"));
          sourceArticles(row, members.slice(0, 50));
          details.append(row);
        }
      }
      try {
        const works = sourceRecords && corpus === window.ATLAS_DATA.summary.corpus_id ? sourceRecords : (await window.ATLAS_EVIDENCE.prepareDataset()).articles;
        if (window.atlasSharedCanvas.graph() !== graph3 || !details.isConnected) return;
        const selected = { ...graph3, nodes: graph3.nodes.filter((node2) => node2.articles.some((id) => ids.has(id))).map((node2) => ({ ...node2, articles: node2.articles.filter((id) => ids.has(id)) })), semantic: { referenceScope: graph3.collaboration.referenceScope } }, crosswalk = citationCrosswalk(selected, works);
        if (crosswalk.status === "unavailable") {
          details.append(element6("p", crosswalk.reason));
          return;
        }
        for (const group of crosswalk.clusters.slice(0, 8)) details.append(element6("p", (group.id > 0 ? "Co-citation group " + group.id : "Unlinked references") + " \xB7 " + group.sourceIds.length + " distinct associated sources"));
        for (const reference of crosswalk.references.slice(0, 12)) {
          const row = element6("details");
          row.append(element6("summary", reference.label + " \xB7 " + reference.sourceIds.length + " sources"));
          sourceArticles(row, reference.sourceIds.slice(0, 50));
          row.append(button4("Open reference in retained co-citation map", () => {
            window.atlasSharedCanvas.showReferences();
            if (window.atlasSharedCanvas.graph().nodes.some((node2) => node2.id === reference.id)) window.atlasInspectReference(reference.id);
            else status.textContent = "Open the parent co-citation result to inspect this reference.";
          }));
          details.append(row);
        }
        details.append(button4("Export complete actor/citation crosswalk", () => download(crosswalk, "collaboration-citation-crosswalk.json")));
        if (previousGraph && (previousGraph.canvasKind === "coupling" || previousGraph.entityKind === "source")) details.append(button4("Return to retained source-article view", () => openSourceView([...ids][0])));
      } catch (problem) {
        details.append(element6("p", "Linked evidence unavailable: " + analysisErrorMessage(problem)));
      }
    }
    function openSourceView(sourceId) {
      const target = structuredClone(previousGraph);
      target.linkedBrowse = true;
      if (target.canvasKind === "coupling") window.ATLAS_EVIDENCE.restoreCoupling(target);
      else window.atlasSharedCanvas.showSemantic(target);
      if (sourceId && target.nodes.some((node2) => node2.id === sourceId)) window.atlasSharedCanvas.selectSource(sourceId);
    }
    function overview(graph3, host, cluster, sourceArticles) {
      const info = method3(graph3), coverage = graph3.collaboration.coverage, selection = graph3.nodes.filter((node2) => !Number(cluster) || node2.cluster === Number(cluster));
      host.append(element6("h2", info.title), element6("p", info.explanation), element6("p", info.weight), element6("p", coverage.excludedLowPublicationActors + " actors / " + coverage.excludedActorWorkIncidences + " work incidences excluded by publication minimum; " + coverage.eligibleWorks + "/" + coverage.records + " sources contain eligible actors \xB7 " + coverage.withPairs + " contain pairs \xB7 " + coverage.missingAuthorshipLists + " lists unavailable \xB7 " + coverage.potentiallyTruncatedLists + " reported truncation flags \xB7 " + coverage.reportedAuthorCountsUnknown + " reported counts unknown."), element6("p", coverage.completeness), element6("p", graph3.collaboration.supplementalMetadata ? "Independently pinned supplemental public metadata; source retrieval date " + (graph3.collaboration.supplementalMetadata.retrievedAt || "unknown") + "." : "Pinned project/retained source metadata only."), element6("p", "Grounded headings count title words once per distinct associated work, not once per author. A work may support multiple actor clusters; overlapping cluster source counts must not be added. Qwen actor/person descriptions are not implemented."), element6("p", info.caveat));
      if (graph3.collaboration.ego) host.append(element6("p", graph3.collaboration.ego.definition + " " + graph3.nodes.length + "/" + graph3.collaboration.ego.parentNodes + " actors; " + graph3.collaboration.ego.boundaryEdges + " parent connections cross this boundary."));
      const diagnostics = element6("details");
      diagnostics.append(element6("summary", "Authorship, affiliation & lineage coverage"), element6("pre", JSON.stringify(coverage, null, 2)));
      host.append(diagnostics);
      const heading = graph3.themeDescriptions?.[cluster];
      if (heading) {
        host.append(element6("h3", "Associated source-title words"), element6("p", heading.heading));
        for (const keyword of heading.keywords) {
          const row = element6("details");
          row.append(element6("summary", keyword.text + " \xB7 " + keyword.sources.length + " distinct sources"));
          sourceArticles(row, keyword.sources.map((source) => source.id));
          host.append(row);
        }
      }
      linked(graph3, host, new Set(selection.flatMap((node2) => node2.articles)), sourceArticles);
      if (graph3.collaborationSensitivity) renderReport(graph3.collaborationSensitivity);
    }
    function download(value, name) {
      const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" })), link = element6("a");
      link.href = url;
      link.download = name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1e3);
    }
    function sync3(graph3) {
      const config = graph3.collaboration;
      kind.value = config.kind;
      counting.value = config.counting;
      support.value = config.minimumSupport;
      publications.value = config.minimumPublications;
      cpm.value = config.resolution;
      policy.value = config.institutionPolicy;
      parent.value = config.parentInstitutionId || "";
      maximum.value = config.maximumTeamSize || "";
      affiliation.value = config.affiliationPolicy;
      scenario.value = config.identityScenario ? JSON.stringify(config.identityScenario, null, 2) : "";
      auditFrom.replaceChildren(...graph3.nodes.map((node2) => new Option(node2.label + " \xB7 " + node2.articles.length + " source works", node2.id)));
      auditInto.replaceChildren(...graph3.nodes.map((node2) => new Option(node2.label, node2.id)));
      if (auditInto.options.length > 1) auditInto.selectedIndex = 1;
      auditFrom.onchange();
      auditBuild.disabled = config.kind !== "author" || !!config.ego || window.BIBLIOMAP?.active && window.BIBLIOMAP.canCompute === false;
      opt.checked = !!config.supplementalMetadata;
      optLabel.hidden = !!window.BIBLIOMAP?.active || !!window.atlasSharedCanvas.currentCorpus();
      back.hidden = !config.ego;
      construction.textContent = graph3.nodes.length + " " + method3(graph3).plural + " \xB7 " + graph3.stats.clusters + " clusters \xB7 " + config.counting + " \xB7 CPM " + config.resolution + ". Citation settings do not apply.";
      if (graph3.collaborationSensitivity) renderReport(graph3.collaborationSensitivity);
      else reports.replaceChildren();
      build.disabled = check.disabled = !!config.ego || window.BIBLIOMAP?.active && window.BIBLIOMAP.canCompute === false;
    }
    function resetContext() {
      panel4.open = false;
      construction.textContent = "";
      reports.replaceChildren();
      back.hidden = true;
      status.textContent = "Choose observed actors and a counting rule. The previous map remains visible while a new result is built.";
    }
    window.ATLAS_COLLABORATION = { method: method3, inspectNode, inspectEdge, overview, sync: sync3, stop: stop2, resetContext, recompute: () => run5(false, true), restoreEgo: (config) => {
      const graph3 = window.atlasSharedCanvas.graph();
      window.atlasSharedCanvas.showCollaboration(collaborationEgo(graph3, config.seedId, config.hops));
    } };
    const reveal = () => {
      const host = document.querySelector("#analysisPanel .shell-panel-body");
      if (host && panel4.parentElement !== host) host.prepend(panel4);
      panel4.open = true;
      window.atlasWorkspaceShell?.show("analysis");
      window.atlasWorkspaceShell?.reveal(panel4);
    };
    const tab = button4("Collaboration", reveal);
    tab.id = "workspace-collaboration";
    tab.dataset.view = "collaboration";
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", "false");
    document.querySelector(".workspace-tabs").append(tab);
    (document.querySelector("#analysisPanel .shell-panel-body") || document.querySelector(".community-controls")).prepend(panel4);
    window.addEventListener("bibliomap:selection-changed", () => {
      stop2();
      sourceRecords = null;
      corpus = null;
      previousGraph = null;
    });
    document.addEventListener("click", (event) => {
      if (event.target.closest(".workspace-tabs button") && event.target.id !== "workspace-collaboration") stop2();
    });
  }

  // scripts/evidence-provenance.mjs
  var canonical = (value) => value && typeof value === "object" ? Array.isArray(value) ? value.map(canonical) : Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
  var equal = (first, second) => JSON.stringify(canonical(first)) === JSON.stringify(canonical(second));
  function immutableEvidenceContext(graph3) {
    const provenance = graph3?.evidenceProvenance, previous = graph3?.scientificManifest;
    const value = provenance?.evidenceId ? provenance : previous?.evidence?.id ? { evidenceId: previous.evidence.id, retrievedAt: previous.evidence.retrievedAt, retrieval: previous.evidence.retrieval, completeness: previous.evidence.completeness, textVersions: previous.dependencies?.textVersions } : null;
    if (!value) return null;
    const context2 = { evidenceId: value.evidenceId, retrievedAt: value.retrievedAt ?? null, retrieval: value.retrieval ?? null, completeness: value.completeness };
    if (value.textVersions?.evidence !== void 0) context2.textVersions = { evidence: value.textVersions.evidence };
    return structuredClone(context2);
  }
  function inheritEvidenceContext(target, parent, sourceCorpusId) {
    if (typeof sourceCorpusId !== "string" || !sourceCorpusId) throw Error("The derived view has no verified source corpus. The previous map was retained.");
    if (target.sourceCorpusId && target.sourceCorpusId !== sourceCorpusId || parent?.sourceCorpusId && parent.sourceCorpusId !== sourceCorpusId) throw Error("The derived view and parent belong to different source corpora. The previous map was retained.");
    const context2 = immutableEvidenceContext(parent), existing = immutableEvidenceContext(target);
    if (context2 && parent.sourceCorpusId !== sourceCorpusId) throw Error("The pinned parent evidence has no verifiable source-corpus scope. Reopen its saved finding.");
    if (existing) {
      if (target.sourceCorpusId !== sourceCorpusId) throw Error("The derived evidence pin has no verifiable source-corpus scope.");
      if (context2 && ["evidenceId", "retrievedAt", "retrieval"].some((key) => existing[key] != null && context2[key] != null && !equal(existing[key], context2[key]))) throw Error("The derived view already identifies different pinned evidence. The previous map was retained.");
      if (existing.textVersions?.evidence != null && context2?.textVersions?.evidence != null && !equal(existing.textVersions.evidence, context2.textVersions.evidence)) throw Error("The derived view identifies a different retained evidence-text revision. The previous map was retained.");
    }
    return { ...target, sourceCorpusId, externalCorpus: parent?.externalCorpus === true || target.externalCorpus === true, ...existing || context2 ? { evidenceProvenance: existing || context2 } : {} };
  }

  // scripts/snapshot-transport.mjs
  var SNAPSHOT_TRANSPORT_VERSION = "pinned-source-fields-v1";
  var marker = "__bibliomapPinnedSourceFields";
  var fields = ["authorships", "abstract_inverted_index", "topics"];
  var maximumReferences = 1e5;
  var maximumDepth = 64;
  var maximumValues = 3e6;
  var maximumExpandedBytes = 256 * 1024 * 1024;
  var record2 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  var own = (value, key) => Object.hasOwn(value, key);
  var define = (object, key, value) => Object.defineProperty(object, key, { value, enumerable: true, writable: true, configurable: true });
  var normalized = (value) => JSON.parse(JSON.stringify(value, (key, item) => item instanceof Set ? [...item] : item));
  var validHash = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
  function scope(context2) {
    if (!record2(context2) || typeof context2.corpusId !== "string" || !context2.corpusId || typeof context2.evidenceId !== "string" || !context2.evidenceId) throw Error("Pinned snapshot transport needs a known corpus and evidence identity. Reopen the saved study.");
  }
  function sourceMap(records4) {
    if (!Array.isArray(records4)) throw Error("Pinned source records are unavailable. Reopen the saved study.");
    const result = /* @__PURE__ */ new Map();
    for (const source of records4) {
      if (!record2(source) || typeof source.id !== "string" || !source.id || result.has(source.id)) throw Error("Pinned source records have missing or ambiguous identities.");
      result.set(source.id, source);
    }
    return result;
  }
  function inspectScope(value, context2) {
    if (Array.isArray(value.nodes) && Array.isArray(value.links)) {
      if (value.sourceCorpusId && value.sourceCorpusId !== context2.corpusId) throw Error("A saved graph belongs to different pinned source evidence.");
      for (const pin of [value.evidenceProvenance?.evidenceId, value.scientificManifest?.evidence?.id]) if (pin && pin !== context2.evidenceId) throw Error("A saved graph identifies different pinned evidence.");
    }
    if (value.evidenceCorpusId && record2(value.graph) && value.evidenceCorpusId !== context2.corpusId) throw Error("A saved parent belongs to different pinned source evidence.");
  }
  function budget() {
    let values = 0, references = 0;
    return { value(depth) {
      if (depth > maximumDepth || ++values > maximumValues) throw Error("Snapshot transport exceeds the explicit nesting/value budget. No fields were discarded.");
    }, reference() {
      if (++references > maximumReferences) throw Error("Snapshot transport exceeds the explicit reference budget. No records were sampled.");
    }, count: () => references };
  }
  async function compactSnapshotTransport(snapshot, records4, index) {
    const plain = normalized(snapshot);
    if (!index) return { snapshot: plain };
    scope(index);
    if (index.version !== SNAPSHOT_TRANSPORT_VERSION || !Array.isArray(index.records)) throw Error("Pinned snapshot transport metadata is unsupported. Reopen the saved study.");
    const sources = sourceMap(records4), digests = /* @__PURE__ */ new Map(), cache = /* @__PURE__ */ new Map(), limits = budget();
    for (const item of index.records) {
      if (!record2(item) || typeof item.id !== "string" || digests.has(item.id) || !record2(item.fields) || Object.entries(item.fields).some(([field, digest]) => !fields.includes(field) || !validHash(digest))) throw Error("Pinned snapshot field checksums are invalid.");
      digests.set(item.id, item.fields);
    }
    async function visit(value, depth) {
      limits.value(depth);
      if (value === null || typeof value !== "object") return value;
      if (Array.isArray(value)) {
        const result3 = [];
        for (const item of value) result3.push(await visit(item, depth + 1));
        return result3;
      }
      if (own(value, marker)) throw Error("The saved view already contains a reserved transport marker.");
      inspectScope(value, index);
      const matching = [], source = typeof value.id === "string" ? sources.get(value.id) : null, expected = source && digests.get(value.id);
      if (expected) {
        for (const field of fields) if (own(value, field) && own(source, field) && expected[field] && canonicalScience(value[field]) === canonicalScience(source[field])) {
          const key = value.id + "\0" + field;
          if (!cache.has(key)) cache.set(key, await scienceDigest(source[field]));
          if (cache.get(key) === expected[field]) matching.push(field);
        }
      }
      const result2 = {};
      for (const [key, item] of Object.entries(value)) if (!matching.includes(key)) define(result2, key, await visit(item, depth + 1));
      if (matching.length) {
        limits.reference();
        define(result2, marker, { id: value.id, fields: matching.map((field) => ({ name: field, sha256: expected[field] })) });
      }
      return result2;
    }
    const result = await visit(plain, 0);
    if (!limits.count()) return { snapshot: plain };
    return { snapshot: result, snapshotTransport: { version: SNAPSHOT_TRANSPORT_VERSION, corpusId: index.corpusId, evidenceId: index.evidenceId, references: limits.count(), logicalSha256: await scienceDigest(plain) } };
  }

  // scripts/evidence-explorer.mjs
  var element5 = (tag, content = "", className = "") => {
    const node2 = document.createElement(tag);
    node2.textContent = content;
    node2.className = className;
    return node2;
  };
  var button3 = (label, action3) => {
    const node2 = element5("button", label, "secondary");
    node2.type = "button";
    node2.onclick = action3;
    return node2;
  };
  var paragraph = (parent, content) => parent.append(element5("p", content));
  var percent4 = (value) => value == null ? "N/A" : (100 * value).toFixed(1) + "%";
  var roleCache = /* @__PURE__ */ new WeakMap();
  var rolesFor = (graph3) => {
    if (!roleCache.has(graph3)) roleCache.set(graph3, connectionRoles(graph3));
    return roleCache.get(graph3);
  };
  var datasetPromise;
  var dataset;
  var context;
  var focusCluster;
  var coupling;
  var couplingRoles;
  var referenceStability;
  var couplingStability;
  var worker;
  var communityJob;
  var couplingBaseline;
  var generation4 = 0;
  var mode = "coupling";
  var sourceDetails;
  var contextKey;
  var settingsAudit;
  var draft = { minimumShared: 3, minimumCosine: 0.05, resolution: "" };
  var mapPanel = document.querySelector(".workspace");
  var workspaceTabs = element5("nav", "", "workspace-tabs");
  workspaceTabs.setAttribute("role", "tablist");
  workspaceTabs.setAttribute("aria-label", "Analysis workspace");
  mapPanel.id = "cocitation-workspace";
  mapPanel.setAttribute("role", "tabpanel");
  mapPanel.setAttribute("aria-labelledby", "workspace-map");
  var dialog = element5("section", "", "evidence-explorer");
  dialog.id = "evidence-workspace";
  dialog.hidden = true;
  dialog.setAttribute("role", "tabpanel");
  mapPanel.before(workspaceTabs);
  mapPanel.after(dialog);
  for (const [value, label] of [["map", "Co-citation map"], ["coupling", "Source-article coupling"]]) {
    const tab = button3(label, () => value === "map" ? showMap() : open(void 0, value));
    tab.id = "workspace-" + value;
    tab.dataset.view = value;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", value === "references" ? dialog.id : mapPanel.id);
    tab.onkeydown = (event) => {
      const tabs = [...workspaceTabs.children], position = tabs.indexOf(tab);
      const next = event.key === "ArrowRight" ? (position + 1) % tabs.length : event.key === "ArrowLeft" ? (position + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
      if (next != null) {
        event.preventDefault();
        tabs[next].focus();
        tabs[next].click();
      }
    };
    workspaceTabs.append(tab);
  }
  function selectTab(value, restoreReferences = true) {
    window.ATLAS_SEMANTIC?.stop();
    window.ATLAS_TEMPORAL?.stop();
    window.ATLAS_EXTENSIONS?.cancel();
    cancelCanvasReliability();
    for (const tab of workspaceTabs.children) {
      const selected = tab.dataset.view === value;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    mapPanel.hidden = value === "references";
    dialog.hidden = value === "map";
    if (window.atlasWorkspaceShell) window.atlasWorkspaceShell.placeCoupling(dialog);
    else if (value === "coupling") document.querySelector(".map-column").insertBefore(dialog, document.querySelector(".analysis-switches"));
    else mapPanel.after(dialog);
    mapPanel.setAttribute("aria-labelledby", "workspace-" + (value === "references" ? "map" : value));
    dialog.setAttribute("role", value === "coupling" ? "region" : "tabpanel");
    if (value !== "coupling" && restoreReferences) window.atlasSharedCanvas?.showReferences();
    document.body.classList.toggle("evidence-mode", value === "references");
    dialog.setAttribute("aria-labelledby", "workspace-" + value);
    syncSkipLink();
  }
  function syncSkipLink() {
    const link = document.querySelector(".skip-link");
    const target = !mapPanel.hidden ? "network" : "evidence-workspace";
    link.href = "#" + target;
    link.textContent = target === "evidence-workspace" ? "Skip to analysis" : "Skip to the network";
    link.onclick = (event) => {
      event.preventDefault();
      revealSection(document.getElementById(target), true);
    };
  }
  function stopWorker() {
    generation4++;
    worker?.terminate();
    worker = null;
    communityJob?.cancel();
    communityJob = null;
  }
  function showMap() {
    stopWorker();
    selectTab("map");
  }
  selectTab("map");
  function visibilityControls(parent, nodes, state, onChange, plural = "works") {
    const controls = element5("div", "", "visibility-controls"), toggle = button3(state.hideUnlinked ? "Show unlinked nodes" : "Hide unlinked nodes", () => {
      state.hideUnlinked = !state.hideUnlinked;
      refresh();
      onChange();
    });
    toggle.setAttribute("aria-pressed", String(state.hideUnlinked));
    controls.append(toggle);
    const sizeLabel = element5("label", "Minimum cluster size (" + plural + ")", "cluster-size-filter"), size = element5("input");
    size.type = "number";
    size.min = "1";
    size.step = "1";
    size.value = clusterSizeFilter(nodes, state.minimumClusterSize).minimum;
    size.setAttribute("aria-label", "Minimum cluster size (" + plural + ")");
    sizeLabel.append(size);
    controls.append(sizeLabel);
    const changeSize = () => {
      const filter = clusterSizeFilter(nodes, size.value);
      size.value = filter.minimum;
      state.minimumClusterSize = filter.minimum;
      refresh();
      onChange();
    };
    size.oninput = () => {
      if (size.value.trim() && size.validity.valid) changeSize();
    };
    size.onchange = changeSize;
    const disclosure = element5("details"), summary = element5("summary", "Show / hide clusters");
    disclosure.append(summary);
    const choices = element5("div", "", "cluster-visibility-list"), counts = /* @__PURE__ */ new Map();
    for (const node2 of nodes) if (node2.cluster > 0) counts.set(node2.cluster, (counts.get(node2.cluster) || 0) + 1);
    for (const [cluster, count] of [...counts].sort((left, right) => left[0] - right[0])) {
      const label = element5("label"), checkbox = element5("input");
      checkbox.type = "checkbox";
      checkbox.checked = !state.hiddenClusters.has(cluster);
      checkbox.onchange = () => {
        checkbox.checked ? state.hiddenClusters.delete(cluster) : state.hiddenClusters.add(cluster);
        refresh();
        onChange();
      };
      label.append(checkbox, document.createTextNode(`Cluster ${cluster} \xB7 ${count} ${plural}`));
      choices.append(label);
    }
    const restore = button3("Show all groups", () => {
      state.hideUnlinked = false;
      state.hiddenClusters.clear();
      state.minimumClusterSize = 1;
      size.value = 1;
      refresh();
      onChange();
    });
    const hideAll = button3("Hide all clusters", () => {
      for (const cluster of counts.keys()) state.hiddenClusters.add(cluster);
      for (const checkbox of choices.querySelectorAll("input")) checkbox.checked = false;
      refresh();
      onChange();
    });
    const search = element5("input");
    search.type = "search";
    search.placeholder = "Find a cluster by number\u2026";
    search.setAttribute("aria-label", "Find cluster visibility option");
    search.oninput = () => {
      for (const row of choices.children) row.hidden = !row.textContent.toLowerCase().includes(search.value.trim().toLowerCase());
    };
    disclosure.append(restore, hideAll, search, choices);
    controls.append(disclosure);
    const note = element5("p", "", "field-note");
    controls.append(note);
    function refresh() {
      const filter = clusterSizeFilter(nodes, state.minimumClusterSize), hidden = /* @__PURE__ */ new Set([...state.hiddenClusters, ...filter.hiddenClusters]);
      for (const [position, [cluster]] of [...counts].sort((left, right) => left[0] - right[0]).entries()) {
        const checkbox = choices.children[position].querySelector("input");
        checkbox.disabled = filter.hiddenClusters.has(Number(cluster));
        checkbox.checked = !checkbox.disabled && !state.hiddenClusters.has(cluster);
        checkbox.title = checkbox.disabled ? "Below the minimum cluster size. Lower the minimum to show this group." : "";
      }
      toggle.textContent = state.hideUnlinked ? "Show unlinked nodes" : "Hide unlinked nodes";
      toggle.setAttribute("aria-pressed", String(state.hideUnlinked));
      summary.textContent = `Show / hide clusters${hidden.size ? " \xB7 " + hidden.size + " hidden" : ""}`;
      note.textContent = `${filter.hiddenClusters.size} clusters below ${filter.minimum} ${plural} \xB7 ${state.hiddenClusters.size} manually hidden. Display only.`;
      note.title = "Small clusters are hidden from the canvas and tiles. Counts use full cluster membership. Unlinked nodes are controlled separately. Memberships, reliability and analytical edges stay unchanged.";
    }
    refresh();
    parent.append(controls);
  }
  async function loadData() {
    if (!datasetPromise) datasetPromise = fetch("source-evidence.json?v=dedup-1").then((response) => {
      if (!response.ok) throw new Error("Source evidence could not be loaded");
      return response.json();
    }).then((result) => {
      if (result.sourceCorpusId !== window.ATLAS_DATA.summary.corpus_id) throw new Error("Source evidence corpus mismatch");
      dataset = result;
      return result;
    }).catch((error) => {
      datasetPromise = null;
      throw error;
    });
    return datasetPromise;
  }
  function runWorker(request, onResult) {
    if (window.BIBLIOMAP?.active) {
      stopWorker();
      const ticket2 = generation4, progress2 = dialog.querySelector(".evidence-progress");
      const stage = request.action === "compare-coupling" ? "coupling-scan" : "reliability";
      communityJob = window.BIBLIOMAP.stage(window.atlasSharedCanvas.graph(), stage, { samples: request.samples || 10 }, (message) => {
        if (progress2) progress2.textContent = message;
      });
      communityJob.promise.then((value) => {
        if (ticket2 === generation4) onResult(request.action === "compare-coupling" ? { audit: value } : { stability: value });
      }).catch((problem) => {
        if (progress2) progress2.textContent = analysisErrorMessage(problem);
      });
      return;
    }
    worker?.terminate();
    communityJob?.cancel();
    communityJob = null;
    const ticket = ++generation4;
    const progress = dialog.querySelector(".evidence-progress");
    progress.textContent = "Preparing analysis\u2026";
    worker = new Worker("evidence-worker.js?v=coupling-errors-2");
    worker.onmessage = (event) => {
      if (ticket !== generation4) return;
      if (event.data.progress) {
        progress.textContent = event.data.progress;
        return;
      }
      worker.terminate();
      worker = null;
      if (Object.hasOwn(event.data, "error")) {
        progress.textContent = "Analysis failed: " + analysisErrorMessage(event.data.error);
        return;
      }
      progress.textContent = "Analysis complete.";
      onResult(event.data);
    };
    worker.onerror = (event) => {
      if (ticket === generation4) {
        progress.textContent = "Analysis failed: " + analysisErrorMessage(event);
        worker?.terminate();
        worker = null;
      }
    };
    worker.postMessage(request);
  }
  function scopeArticles() {
    return context?.graph ? sourcesForCluster(dataset.articles, context.graph, focusCluster) : dataset.articles;
  }
  var fullSourceScope = () => window.atlasSharedCanvas?.currentCorpus() ? "All project source articles" : "All conservative source articles";
  function shell() {
    dialog.replaceChildren();
    if (mode === "coupling") window.atlasSharedCanvas?.showCoupling(coupling, contextKey + "|" + focusCluster, coupling?.temporal ? coupling.scopeLabel : focusCluster == null ? fullSourceScope() : "Sources citing reference cluster " + focusCluster);
    document.getElementById("clusteringMethod").disabled = mode === "coupling" && !dataset;
    const header = element5("header", "", "evidence-header");
    const exportAction = button3("Export evidence JSON", exportEvidence);
    exportAction.dataset.workspaceGroup = "export";
    header.append(element5("h2", mode === "coupling" ? "Source-article coupling" : "Roles & reliability"), exportAction);
    if (mode === "coupling" && coupling) {
      const jump = button3("Jump to coupling map", () => revealSection(document.getElementById("network"), true));
      jump.dataset.workspaceGroup = "resources";
      header.append(jump);
    }
    header.id = "evidence-settings";
    dialog.append(header);
    paragraph(dialog, coupling?.temporal ? coupling.scopeLabel + ". Rebuild uses the parent source scope; Return to parent map restores its saved view." : focusCluster == null ? fullSourceScope() + "." : `Sources citing at least one reference in Cluster ${focusCluster}. This is a structural connection, not a relevance decision.`);
    if (focusCluster != null) dialog.append(button3("Use all source articles / reference clusters", () => open(null, mode)));
    const progress = element5("p", "", "evidence-progress");
    progress.setAttribute("role", "status");
    dialog.append(progress);
    if (!dataset) {
      progress.textContent = "Loading full source reference lists\u2026";
      return;
    }
    if (mode === "coupling") {
      couplingPanel();
      const settings = element5("details", "", "coupling-settings");
      settings.append(element5("summary", "Evidence thresholds & rebuild"));
      for (const child of [...dialog.children]) if (child !== header && child !== progress) settings.append(child);
      dialog.append(settings);
    }
    syncSkipLink();
  }
  async function open(cluster, selectedMode = "coupling") {
    if (selectedMode === "references") {
      showCanvasReliability(cluster);
      return;
    }
    const next = window.atlasEvidenceContext?.();
    if (!next?.graph) {
      if (window.atlasSharedCanvas?.isCoupling() && coupling) {
        mode = "coupling";
        selectTab("coupling", false);
        shell();
      }
      return;
    }
    const graph3 = next.graph, key = JSON.stringify([graph3.clustering?.algorithm, graph3.analysisId, graph3.order, graph3.maximumOrder, graph3.resolution, graph3.threshold, graph3.minimumSupport, graph3.drillPath, graph3.nodes.map((node2) => [node2.id, node2.cluster]), graph3.links.map((edge) => [edge.source, edge.target, edge.strength, edge.count]), next.articleIds]);
    const changed = key !== contextKey, nextFocus = cluster === void 0 ? changed ? null : focusCluster : cluster;
    if (changed || nextFocus !== focusCluster) {
      coupling = null;
      couplingBaseline = null;
      couplingRoles = null;
      couplingStability = null;
      settingsAudit = null;
      draft = { minimumShared: 3, minimumCosine: 0.05, resolution: "" };
    }
    if (changed) referenceStability = null;
    context = next;
    contextKey = key;
    focusCluster = nextFocus;
    mode = selectedMode;
    stopWorker();
    selectTab(mode);
    shell();
    const ticket = generation4;
    try {
      await loadData();
      if (ticket === generation4 && !dialog.hidden) {
        shell();
        if (!coupling) autoCoupling();
      }
    } catch (error) {
      if (ticket === generation4) dialog.querySelector(".evidence-progress").textContent = analysisErrorMessage(error) + ". Switch tabs to retry.";
    }
  }
  var inputSequence = 0;
  function autoCoupling() {
    const current = { minimumShared: +draft.minimumShared, minimumCosine: +draft.minimumCosine, resolution: +draft.resolution || null };
    buildCoupling(current);
  }
  function labeled(parent, label, input) {
    const wrapper = element5("div", "", "evidence-field"), caption = element5("label", label);
    input.id = "evidence-input-" + ++inputSequence;
    caption.htmlFor = input.id;
    wrapper.append(caption, input);
    parent.append(wrapper);
    return input;
  }
  function couplingPanel() {
    const articles = scopeArticles(), available = articles.filter((article) => article.references.length).length;
    paragraph(dialog, `${available}/${articles.length} sources have reference lists; completeness unknown.`);
    const controls = element5("div", "", "evidence-controls");
    const minimum = element5("input");
    minimum.type = "number";
    minimum.required = true;
    minimum.min = "1";
    minimum.max = "1000";
    minimum.value = draft.minimumShared;
    labeled(controls, "Minimum shared references", minimum);
    const cosine = element5("input");
    cosine.type = "number";
    cosine.required = true;
    cosine.min = "0";
    cosine.max = "1";
    cosine.step = ".01";
    cosine.value = draft.minimumCosine;
    labeled(controls, "Minimum cosine similarity (analytical)", cosine);
    const resolution = element5("input");
    resolution.type = "number";
    resolution.min = ".000001";
    resolution.step = "any";
    resolution.placeholder = "Blank: density \xF7 4";
    resolution.value = draft.resolution;
    labeled(controls, "CPM resolution", resolution);
    const alternative = ["infomap", "hypergraph", "sbm"].includes(document.getElementById("clusteringMethod").value) || document.getElementById("networkModel").value === "hypergraph";
    resolution.disabled = alternative;
    resolution.parentElement.hidden = alternative;
    const currentCPM = coupling?.resolution;
    resolution.parentElement.append(element5("small", (currentCPM ? "Current map: CPM " + Number(currentCPM.toPrecision(4)) + ". " : "") + "Blank rebuild uses the density-based starting value.", "field-note"));
    const valid = () => minimum.reportValidity() && cosine.reportValidity() && resolution.reportValidity() && Number.isInteger(+minimum.value) && +minimum.value >= 1;
    const remember = () => {
      draft = { minimumShared: minimum.value, minimumCosine: cosine.value, resolution: resolution.value };
    };
    for (const input of [minimum, cosine, resolution]) input.oninput = remember;
    const build = button3(coupling ? "Rebuild coupling" : "Build coupling network", () => {
      if (valid()) buildCoupling({ minimumShared: +minimum.value, minimumCosine: +cosine.value, resolution: +resolution.value || null });
    });
    controls.append(build, button3("Compare thresholds + CPM", () => {
      if (!valid()) return;
      if (document.getElementById("clusteringMethod").value !== "leiden" || document.getElementById("networkModel").value === "hypergraph") {
        dialog.querySelector(".evidence-progress").textContent = "Use Find settings for the active algorithm and network model. This threshold comparison evaluates ordinary pairwise Leiden only.";
        return;
      }
      runWorker({ action: "compare-coupling", articles, current: { minimumShared: +minimum.value, minimumCosine: +cosine.value, resolution: +resolution.value || null } }, (result) => {
        settingsAudit = result.audit;
        shell();
      });
    }));
    controls.lastElementChild.disabled = alternative;
    dialog.append(controls);
    const explanation = element5("details");
    explanation.append(element5("summary", "How coupling works"));
    dialog.append(explanation);
    paragraph(explanation, `${articles.length - available} sources have insufficient reference metadata. All available references are used, including rarely cited works. Thresholds change which analytical connections qualify.`);
    paragraph(explanation, "Auto settings tests clustering on the current network. Compare thresholds + CPM also changes which connections qualify; its results are applied only when you choose a setting. Switching tabs cancels unfinished work.");
    if (settingsAudit && !alternative) settingsComparison(dialog, settingsAudit);
    paragraph(explanation, "Pair connections use shared references \xF7 \u221A(reference count A \xD7 reference count B). Leiden uses ten CPM starts; blank CPM uses scaled density \xF7 4 as an exploratory starting point. Infomap uses weighted pair flow; hypergraph uses whole groups citing the same reference. A Leiden baseline is calculated for comparison. Thresholds change analysis; canvas filters only change display.");
    if (!coupling) return;
    paragraph(dialog, `Displayed analysis: shared \u2265${coupling.minimumShared}, cosine \u2265${coupling.minimumCosine}, CPM ${coupling.resolution == null ? "not applicable \xB7 " + coupling.clustering.label : Number(coupling.resolution.toPrecision(4))}. Editing controls does not change it until you rebuild.`);
    const linked = new Set(coupling.links.flatMap((edge) => [edge.source, edge.target]));
    paragraph(explanation, `${coupling.clustering.clusters} coupling clusters \xB7 ${coupling.fragmentation.components} disconnected components \xB7 ${linked.size} linked sources \xB7 ${coupling.nodes.length - linked.size} unlinked sources \xB7 ${coupling.links.length.toLocaleString()} analytical edges \xB7 CPM ${coupling.resolution == null ? "not applicable \xB7 " + coupling.clustering.label : coupling.resolution.toPrecision(5)}. Small isolated groups are not necessarily distinct themes. Unlinked does not mean irrelevant.`);
    const views = element5("div", "", "evidence-controls");
    views.append(button3("Roles & reliability in the canvas \u2193", () => showCanvasReliability()));
    paragraph(explanation, coupling.clustering.method || coupling.clustering.limitations || "Leiden CPM uses the cosine-weighted pair network.");
    if (coupling.comparison) paragraph(explanation, "Agreement with the Leiden baseline (adjusted Rand index): " + (coupling.comparison.adjustedRandIndex?.toFixed(3) ?? "undefined") + ". Agreement is not validation; cluster numbers do not correspond.");
    dialog.append(views);
  }
  function buildCoupling(settings, reuse = false) {
    if (window.BIBLIOMAP?.active) {
      window.ATLAS_PROJECTS.coupling({ ...settings, sourceMembers: focusCluster == null ? null : scopeArticles().map((article) => article.id) });
      return;
    }
    cancelCanvasReliability();
    const algorithm3 = document.getElementById("clusteringMethod").value;
    const networkModel = algorithm3 === "hypergraph" || document.getElementById("networkModel").value === "hypergraph" ? "hypergraph" : "pairwise";
    draft = { ...settings, resolution: settings.resolution || "" };
    const evidenceParent = context?.graph || window.atlasSharedCanvas.currentCorpus?.()?.graph, sourceCorpusId = dataset.sourceCorpusId;
    const install = async (result) => {
      const ticket = generation4;
      result.graph.networkModel = networkModel;
      if (algorithm3 !== "leiden" || networkModel === "hypergraph") {
        try {
          await loadCommunities();
          if (ticket !== generation4) return;
          communityJob = window.ATLAS_COMMUNITIES.start(result.graph, algorithm3, [], (message) => {
            if (ticket === generation4) dialog.querySelector(".evidence-progress").textContent = message;
          }, { networkModel, hypergraphSearch: algorithm3 === "hypergraph" ? document.getElementById("clusteringSearch")?.value || "mixed" : void 0, resolution: networkModel === "hypergraph" ? null : settings.resolution });
          result.graph = await communityJob.promise;
          if (ticket !== generation4) return;
          communityJob = null;
          result.roles = connectionRoles(result.graph);
        } catch (error) {
          if (ticket === generation4) dialog.querySelector(".evidence-progress").textContent = "Analysis failed; previous map retained: " + analysisErrorMessage(error);
          return;
        }
      }
      try {
        coupling = inheritEvidenceContext(result.graph, evidenceParent, sourceCorpusId);
      } catch (problem) {
        dialog.querySelector(".evidence-progress").textContent = analysisErrorMessage(problem);
        return;
      }
      coupling.deduplication = dataset.deduplication;
      couplingRoles = result.roles;
      couplingStability = null;
      if (algorithm3 === "leiden" && networkModel !== "hypergraph" && settingsAudit?.validation && settings.minimumShared === settingsAudit.validation.minimumShared && settings.minimumCosine === settingsAudit.validation.minimumCosine && settings.resolution === settingsAudit.validation.resolution) {
        couplingStability = { samples: 50, seed: settingsAudit.seed, seedOffset: 100, restarts: 2, resamplingUnit: "Distinct available reference IDs, with replacement", clusters: settingsAudit.validationClusters, limitations: settingsAudit.limitations };
      }
      if (couplingStability) coupling.reliability = { ...couplingStability, algorithm: "leiden", method: "Leiden CPM", preliminary: false };
      window.ATLAS_STARTUP_NAVIGATION?.installed();
      shell();
    };
    const baseline = reuse ? reuseCouplingBaseline(couplingBaseline, settings) : null;
    if (baseline) {
      stopWorker();
      dialog.querySelector(".evidence-progress").textContent = "Reusing completed coupling evidence; changing clustering only\u2026";
      void install({ graph: baseline, roles: connectionRoles(baseline) });
    } else runWorker({ action: "coupling", articles: scopeArticles(), ...settings }, (result) => {
      couplingBaseline = retainCouplingBaseline(result.graph, settings);
      void install(result);
    });
  }
  function settingsComparison(parent, audit) {
    const section = element5("section", "", "settings-comparison");
    section.append(element5("h3", audit.status === "promising" ? "Promising settings\u2014not a proven optimum" : "No clear best settings"));
    paragraph(section, audit.outcome);
    const chosen = audit.validation;
    if (chosen) {
      paragraph(section, `Selected trade-off: \u2265${chosen.minimumShared} shared references \xB7 cosine \u2265${chosen.minimumCosine} \xB7 CPM ${chosen.resolution.toPrecision(5)} \xB7 ${chosen.clusters} groups. Additional 50-resample check: ${percent4(chosen.coverage)} of all sources connected; ${percent4(chosen.recovery)} member-weighted group recovery; ${percent4(chosen.retention)} connected-member retention.`);
      if (chosen.reasons.length) paragraph(section, "Safeguards not met: " + chosen.reasons.join("; ") + ".");
      section.append(button3(audit.status === "promising" ? "Apply promising settings" : "Try exploratory trade-off", () => buildCoupling({ minimumShared: chosen.minimumShared, minimumCosine: chosen.minimumCosine, resolution: chosen.resolution })));
    }
    const details = element5("details");
    details.append(element5("summary", `Compare all ${audit.candidates.length} tested settings & method`));
    paragraph(details, "Recovery below uses eight screening resamples. The selected setting is separately checked above on 50 additional resamples. Coverage includes all scoped sources, including those with missing references. Cluster counts exclude unlinked sources. These scores are not probabilities of correctness.");
    const table = element5("table");
    table.append(tableHeading(["Shared \u2265", "Cosine \u2265", "CPM", "Groups", "Connected", "Recovery", "Safeguards", "Use"]));
    for (const candidate of audit.candidates) {
      const row = element5("tr");
      for (const value of [candidate.minimumShared, candidate.minimumCosine, candidate.resolution.toPrecision(4), candidate.clusters, percent4(candidate.coverage), percent4(candidate.recovery), candidate.reasons.join("; ") || "Pass screening"]) row.append(element5("td", value));
      const action3 = element5("td");
      action3.append(button3("Use setting " + candidate.id, () => buildCoupling({ minimumShared: candidate.minimumShared, minimumCosine: candidate.minimumCosine, resolution: candidate.resolution })));
      row.append(action3);
      table.append(row);
    }
    const wrap = element5("div", "", "evidence-table-wrap");
    wrap.append(table);
    details.append(wrap);
    paragraph(details, audit.method);
    paragraph(details, audit.limitations || "No eligible edges in the tested grid.");
    section.append(details);
    parent.append(section);
  }
  function roleDetails(parent, role) {
    if (!role) return;
    parent.append(element5("h3", role.label));
    if (role.partitionAssessed === false) {
      paragraph(parent, `${role.degree} neighbors \xB7 total connection weight ${role.strength}. Community assignment was not executed or this node is unassigned; participation and within-community position are not assessed.`);
      return;
    }
    paragraph(parent, `${role.degree} neighbors \xB7 external connection weight ${percent4(role.externalShare)} \xB7 participation ${role.participation == null ? "N/A" : role.participation.toFixed(3)} \xB7 within-cluster strength z ${role.withinClusterZ == null ? "N/A (no variation)" : role.withinClusterZ.toFixed(2)}.`);
    paragraph(parent, "Participation measures how evenly connection weight spans clusters; it is not relevance or importance. Roles use all analytical edges, before display filtering. Methods references can be generic connectors.");
    if (role.connectedClusters.length) paragraph(parent, "Connected clusters: " + role.connectedClusters.join(", ") + ".");
  }
  function tableHeading(labels) {
    const header = element5("thead"), row = element5("tr");
    for (const label of labels) {
      const cell = element5("th", label);
      cell.scope = "col";
      row.append(cell);
    }
    header.append(row);
    return header;
  }
  var foundationCache = /* @__PURE__ */ new WeakMap();
  var foundationGraph;
  var foundationPreference;
  var foundationCluster;
  var foundationThemes;
  function renderFoundations(preferredCluster, themes) {
    let panel4 = document.getElementById("couplingFoundations");
    if (!panel4) {
      panel4 = element5("section", "", "coupling-foundations");
      panel4.id = "couplingFoundations";
      panel4.setAttribute("aria-label", "Shared foundations of coupling clusters");
      document.getElementById("mapCaption").after(panel4);
    }
    panel4.hidden = !window.atlasSharedCanvas?.isCoupling() || !coupling;
    if (panel4.hidden) return;
    if (foundationGraph === coupling && foundationPreference === preferredCluster && foundationThemes === themes) return;
    const previousGraph = foundationGraph;
    foundationGraph = coupling;
    foundationPreference = preferredCluster;
    foundationThemes = themes;
    const counts = /* @__PURE__ */ new Map();
    for (const article of coupling.nodes) if (article.cluster > 0) counts.set(article.cluster, (counts.get(article.cluster) || 0) + 1);
    const groups = [...counts].sort((left, right) => right[1] - left[1] || left[0] - right[0]);
    foundationCluster = counts.has(Number(preferredCluster)) ? Number(preferredCluster) : previousGraph === coupling && counts.has(foundationCluster) ? foundationCluster : groups[0]?.[0];
    panel4.replaceChildren(element5("h3", "Shared foundations"));
    paragraph(panel4, "The references most frequently cited by articles in each coupling cluster. Counts use the full cluster, regardless of canvas filters. Shared means cited by at least two members\u2014not necessarily by every member, and not unique to this cluster.");
    if (!groups.length) {
      paragraph(panel4, "Build a network with linked clusters to inspect shared foundations. Unlinked sources are not a cluster.");
      return;
    }
    const select = element5("select");
    select.id = "foundationCluster";
    const label = element5("label", "Foundations for cluster");
    label.htmlFor = select.id;
    for (const [cluster, count] of groups) select.append(new Option(`Cluster ${cluster}${themes?.[cluster] ? " \xB7 " + titleCase(themes[cluster].heading) : ""} \xB7 ${count} articles`, String(cluster)));
    select.value = String(foundationCluster);
    panel4.append(label, select);
    const results = element5("div");
    results.setAttribute("aria-live", "polite");
    panel4.append(results);
    function show() {
      foundationCluster = Number(select.value);
      results.replaceChildren();
      if (!foundationCache.has(coupling)) foundationCache.set(coupling, /* @__PURE__ */ new Map());
      const cache = foundationCache.get(coupling);
      if (!cache.has(foundationCluster)) cache.set(foundationCluster, clusterFoundations(coupling.nodes, foundationCluster));
      const record3 = cache.get(foundationCluster);
      paragraph(results, `${record3.references.length.toLocaleString()} shared foundations \xB7 ${record3.members} cluster articles \xB7 ${record3.withReferences} with available reference lists. Sorted by citing-article count. Missing reference metadata may understate sharing; this is not a relevance or significance score.`);
      if (!record3.references.length) {
        paragraph(results, "No reference appears in at least two members\u2019 available reference lists.");
        return;
      }
      const search = element5("input");
      search.type = "search";
      search.placeholder = "Find a foundation by title, author or ID\u2026";
      search.setAttribute("aria-label", "Search shared foundations");
      results.append(search);
      const list = element5("div", "", "foundation-list"), status = element5("p", "", "field-note");
      results.append(list, status);
      let limit = 20;
      const more = button3("Show 20 more foundations", () => {
        limit += 20;
        draw5();
      });
      results.append(more);
      function draw5() {
        const query = search.value.trim().toLowerCase(), matches = record3.references.filter((reference) => ((dataset.referenceLabels[reference.id] || "") + " " + reference.id).toLowerCase().includes(query));
        list.replaceChildren();
        for (const reference of matches.slice(0, limit)) {
          const row = element5("details");
          row.append(element5("summary", `${dataset.referenceLabels[reference.id] || reference.id} \u2014 ${reference.count}/${record3.members} articles (${(100 * reference.share).toFixed(1)}%)`));
          row.addEventListener("toggle", () => {
            if (!row.open || row.dataset.loaded) return;
            row.dataset.loaded = "true";
            const link = element5("a", "Open cited reference \u2197");
            link.href = reference.id;
            link.target = "_blank";
            link.rel = "noopener";
            row.append(link);
            paragraph(row, "Cluster articles citing this reference:");
            for (const id of reference.sources) {
              const article = coupling.nodes.find((node2) => node2.id === id);
              row.append(button3(`${article.title || id}${article.year ? " (" + article.year + ")" : ""}`, () => window.atlasSharedCanvas.selectSource(id)));
            }
          });
          list.append(row);
        }
        status.textContent = `Showing ${Math.min(limit, matches.length)} of ${matches.length} matching foundations.`;
        more.hidden = matches.length <= limit;
      }
      search.oninput = () => {
        limit = 20;
        draw5();
      };
      draw5();
    }
    select.onchange = show;
    show();
  }
  function inspectSource(article) {
    sourceDetails.scrollTop = 0;
    sourceDetails.replaceChildren(button3("Back to coupling network", () => revealSection(document.getElementById("network"), true)), element5("h3", article.title));
    sourceDetails.append(button3("Clear selection \xB7 return to foundation labels", () => window.atlasSharedCanvas.clearSelection()));
    if (article.outsideWindow) paragraph(sourceDetails, "Outside this publication window: retained only as unassigned context. Its bibliography is not used here; return to the full pinned map for its complete retained reference evidence.");
    paragraph(sourceDetails, `${article.authors || "Authors unknown"} \xB7 ${article.yearLabel || article.year || "year unknown"} \xB7 ${article.references.length} available references. ${article.referenceMetadata || "Reference coverage retained as supplied"}.`);
    if (article.deduplicationNote) {
      paragraph(sourceDetails, article.deduplicationNote);
      const provenance = element5("details");
      provenance.append(element5("summary", "Combined source records"));
      for (const record3 of article.mergedRecords || []) paragraph(provenance, `${record3.year || "Year unknown"} \xB7 ${record3.title} \xB7 ${record3.id}${record3.doi ? " \xB7 " + record3.doi : ""}`);
      sourceDetails.append(provenance);
    }
    const link = element5("a", "Open source article \u2197");
    link.href = article.id;
    link.target = "_blank";
    link.rel = "noopener";
    sourceDetails.append(link);
    roleDetails(sourceDetails, couplingRoles[article.id]);
    const references = new Set(article.references), foundations = /* @__PURE__ */ new Map();
    for (const node2 of context?.graph?.nodes || []) if (node2.cluster > 0 && references.has(node2.key)) {
      if (!foundations.has(node2.cluster)) foundations.set(node2.cluster, []);
      foundations.get(node2.cluster).push(node2);
    }
    sourceDetails.append(element5("h3", "Connections to the co-citation map"));
    if (!context?.graph) paragraph(sourceDetails, "The saved finding does not retain a completed co-citation parent. Open a saved co-citation result from this study to inspect that relationship; no unrelated map is substituted.");
    else if (!foundations.size) paragraph(sourceDetails, "No references in the currently selected co-citation clusters. This does not establish irrelevance.");
    for (const [cluster, nodes] of foundations) {
      const section = element5("details");
      section.append(element5("summary", `Reference cluster ${cluster}: ${nodes.length} cited works`));
      for (const node2 of nodes) section.append(button3(node2.label, () => {
        showMap();
        window.atlasInspectReference(node2.id);
      }));
      sourceDetails.append(section);
    }
    const evidence = element5("details");
    evidence.append(element5("summary", "All " + article.references.length + " available references"));
    for (const id of article.references) {
      const item = element5("p"), reference = element5("a", dataset.referenceLabels[id] || id);
      reference.href = id;
      reference.target = "_blank";
      reference.rel = "noopener";
      item.append(reference);
      evidence.append(item);
    }
    sourceDetails.append(evidence);
    revealSection(sourceDetails);
  }
  function inspectPair(edge) {
    sourceDetails.scrollTop = 0;
    sourceDetails.replaceChildren(button3("Back to coupling network", () => revealSection(document.getElementById("network"), true)), element5("h3", edge.count + " shared references"));
    paragraph(sourceDetails, `Cosine similarity ${edge.strength.toFixed(4)}. Shared references do not establish agreement, topical relevance or causation.`);
    for (const id of [edge.source, edge.target]) {
      const article = coupling.nodes.find((node2) => node2.id === id);
      sourceDetails.append(button3(article.title, () => window.atlasSharedCanvas.selectSource(article.id)));
    }
    for (const id of edge.references) {
      const item = element5("p"), link = element5("a", dataset.referenceLabels[id] || id);
      link.href = id;
      link.target = "_blank";
      link.rel = "noopener";
      item.append(link);
      sourceDetails.append(item);
    }
    revealSection(sourceDetails);
  }
  async function exportEvidence() {
    const studySummary = window.atlasSharedCanvas?.studySummary?.();
    const completed = window.atlasSharedCanvas.graph(), exportedCoupling = window.atlasSharedCanvas.isCoupling() ? completed : coupling;
    const output = { version: 1, createdAt: (/* @__PURE__ */ new Date()).toISOString(), sourceCorpusId: dataset?.sourceCorpusId, incidenceHash: dataset?.incidenceHash, focusReferenceCluster: focusCluster, parentAnalysis: context?.graph ? { clustering: context.graph.clustering, comparison: context.graph.comparison || null, hyperedges: context.graph.hyperedges || null, analysisId: context.graph.analysisId, order: context.graph.order, maximumOrder: context.graph.maximumOrder, resolution: context.graph.resolution, threshold: context.graph.threshold, drillPath: context.graph.drillPath || [], memberships: Object.fromEntries(context.graph.nodes.map((node2) => [node2.id, node2.cluster])) } : null, referenceRoles: context?.graph ? rolesFor(context.graph) : null, referenceStability, coupling: exportedCoupling, couplingRoles, couplingStability, display: window.atlasSharedCanvas?.isCoupling() ? window.atlasSharedCanvas.displayState() : {}, limitations: "Exploratory structural evidence, not automatic relevance decisions. Coupling uses all available references; completeness unknown. Analysis results are downloadable, not automatically persisted to Neo4j." };
    output.version = 2;
    output.settingsAudit = settingsAudit;
    output.reliabilityInterpretationRules = RELIABILITY_RULES;
    output.temporalSeries = completed.temporalSeries || null;
    output.temporalSelection = completed.temporalSelection || null;
    output.burstReport = completed.burstReport || null;
    output.evidenceProvenance = completed.evidenceProvenance || null;
    output.scientificManifest = await createScientificManifest(exportedCoupling || context?.graph, dataset?.articles || Object.values(window.ATLAS_DATA?.articles || {}));
    if (studySummary) output.summary = studySummary;
    const url = URL.createObjectURL(new Blob([JSON.stringify(output, null, 2)], { type: "application/json" })), link = element5("a");
    link.href = url;
    link.download = "bibliomap-linked-evidence.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
  }
  window.ATLAS_EVIDENCE = {
    bindImportedThemes,
    importedThemeBinding,
    clearImportedThemes,
    compactSnapshotTransport,
    currentStudySummary,
    currentStudyMethod,
    prepareCanvasSnapshot,
    validateCanvasPacket,
    showReferenceWorkspace() {
      mode = "references";
      selectTab("map", false);
    },
    adoptCoupling(next, parentGraph = null) {
      next = completeCouplingDiagnostics(next);
      context = parentGraph ? { graph: parentGraph } : null;
      contextKey = "saved-" + dataset.sourceCorpusId;
      mode = "coupling";
      focusCluster = null;
      coupling = next;
      couplingBaseline = null;
      couplingRoles = connectionRoles(next);
      couplingStability = next.reliability;
      draft = { minimumShared: next.minimumShared, minimumCosine: next.minimumCosine, resolution: next.resolution || "" };
      selectTab("coupling", false);
      return next;
    },
    showCouplingControls() {
      shell();
    },
    prepareDataset: loadData,
    restoreCoupling(next) {
      next = completeCouplingDiagnostics(next);
      context = window.atlasEvidenceContext();
      contextKey = "saved-" + dataset.sourceCorpusId;
      mode = "coupling";
      focusCluster = null;
      selectTab("coupling");
      coupling = next;
      couplingBaseline = null;
      couplingRoles = connectionRoles(next);
      couplingStability = next.reliability;
      draft = { minimumShared: next.minimumShared, minimumCosine: next.minimumCosine, resolution: next.resolution || "" };
      shell();
    },
    setDataset(next) {
      stopWorker();
      cancelCanvasReliability();
      dataset = next;
      datasetPromise = next ? Promise.resolve(next) : null;
      context = null;
      contextKey = null;
      focusCluster = null;
      coupling = null;
      couplingBaseline = null;
      couplingRoles = null;
      couplingStability = null;
      settingsAudit = null;
      mode = "references";
      dialog.replaceChildren();
      selectTab("map", false);
    },
    applyCouplingSettings(next) {
      next = completeCouplingDiagnostics(next);
      mode = "coupling";
      selectTab("coupling");
      cancelCanvasReliability();
      coupling = next;
      couplingBaseline = null;
      couplingRoles = connectionRoles(next);
      couplingStability = next.reliability;
      draft.resolution = next.resolution || "";
      shell();
    },
    recordSettingsAudit(graph3) {
      if (graph3.canvasKind === "coupling" && coupling) {
        coupling.settingsSearch = graph3.settingsSearch;
        coupling.evidenceSensitivity = graph3.evidenceSensitivity;
        coupling.sourceReliability = graph3.sourceReliability;
      }
    },
    loadCommunities,
    errorMessage: analysisErrorMessage,
    syncCanvasReliability,
    showCanvasReliability,
    cancelCanvasReliability,
    recordCanvasReliability(graph3, result) {
      if (graph3.canvasKind === "coupling") {
        couplingStability = result;
        if (coupling) coupling.reliability = result;
      } else referenceStability = result;
    },
    foundationLabel(node2) {
      const label = dataset?.referenceLabels[node2.foundation?.id] || node2.foundation?.id;
      if (!label) return null;
      const title = label.includes(", ") ? label.slice(label.indexOf(", ") + 2) : label;
      return "Shares: " + (title.length > 48 ? title.slice(0, 45) + "\u2026" : title);
    },
    renderFoundations,
    changeCouplingMethod() {
      if (mode !== "coupling" || !dataset) return;
      const input = dialog.querySelector('input[placeholder="Blank: density \xF7 4"]');
      for (const button4 of dialog.querySelectorAll("button")) if (button4.textContent === "Compare thresholds + CPM") button4.disabled = document.getElementById("clusteringMethod").value !== "leiden";
      const audit = dialog.querySelector(".settings-comparison");
      if (audit) audit.hidden = document.getElementById("clusteringMethod").value !== "leiden";
      if (input) {
        input.disabled = document.getElementById("clusteringMethod").value !== "leiden";
        input.parentElement.hidden = input.disabled;
      }
      buildCoupling({ minimumShared: +draft.minimumShared, minimumCosine: +draft.minimumCosine, resolution: +draft.resolution || null }, true);
    },
    couplingCanvasGraph,
    couplingNodeRadius,
    couplingMethod: COUPLING_METHOD,
    exportCanvasEvidence: exportEvidence,
    inspectCanvasSource(id, container) {
      sourceDetails = container;
      const article = coupling?.nodes.find((node2) => node2.id === id);
      if (article) inspectSource(article);
    },
    inspectCanvasPair(edge, container) {
      sourceDetails = container;
      inspectPair(edge);
    },
    open,
    revealSection,
    visibilityControls,
    clusterSizeFilter,
    hasObservedLinks,
    addClusterActions(parent, graph3, cluster) {
      if (!(cluster > 0)) return;
      if (graph3.trial) {
        parent.append(button3("Cluster roles & stability", () => showCanvasReliability(cluster)));
        return;
      }
      parent.append(element5("h3", "Linked evidence"), button3("Explore sources citing this cluster", () => open(cluster)), button3("Cluster roles & stability", () => open(cluster, "references")));
    },
    addNodeRole(parent, graph3, id) {
      const section = element5("section", "", "evidence-role");
      roleDetails(section, rolesFor(graph3)[id]);
      parent.append(section);
    }
  };
  window.ATLAS_EVIDENCE.showEntityWorkspace = (kind) => {
    stopWorker();
    mode = kind;
    mapPanel.hidden = false;
    dialog.hidden = true;
    document.body.classList.remove("evidence-mode");
    for (const tab of workspaceTabs.children) {
      const selected = tab.id === "workspace-" + kind;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
  };
  window.ATLAS_EVIDENCE.showSemanticWorkspace = () => window.ATLAS_EVIDENCE.showEntityWorkspace("semantic");
  mountSemanticBrowser();
  mountTemporalBrowser();
  mountCollaborationBrowser();
})();
//# sourceMappingURL=evidence-explorer.js.map

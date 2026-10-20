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

  // scripts/network-roles.mjs
  var ROLE_VERSION = "network-roles-v1";
  function roleNetwork(graph) {
    const ids = graph.nodes.map((node) => node.id);
    if (new Set(ids).size !== ids.length || ids.some((id) => typeof id !== "string" || !id)) throw new Error("Roles require unique entity identifiers.");
    const positions = new Map(ids.map((id, position) => [id, position]));
    const directed = graph.directed === true || graph.method === "direct_citation" || graph.canvasKind === "historiography";
    const edges = /* @__PURE__ */ new Map();
    for (const link of graph.links || []) {
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
  function analyzeRoles(graph, options = {}) {
    const network = roleNetwork(graph);
    if (network.ids.length > 1500 || network.edges.length > 1e5) throw new Error("Role analysis supports at most 1,500 articles and 100,000 connections. Narrow the analytical scope.");
    const cores = coreNumbers(network.weak), roles = Object.fromEntries(network.ids.map((id, position) => [id, { degree: network.weak[position].size, strength: 0, internalStrength: 0, externalStrength: 0, incoming: 0, outgoing: 0, core: cores[position], connections: {} }]));
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
    for (const edge of network.edges) {
      const source = network.ids[edge.source], target = network.ids[edge.target];
      if (network.directed) {
        roles[source].outgoing++;
        roles[target].incoming++;
      }
      for (const [id, other] of [[source, target], [target, source]]) {
        const role = roles[id], cluster = Number(nodes.get(other).cluster) || 0;
        role.strength += edge.strength;
        role.connections[cluster] = (role.connections[cluster] || 0) + edge.strength;
        if (cluster > 0 && cluster === Number(nodes.get(id).cluster)) role.internalStrength += edge.strength;
        else role.externalStrength += edge.strength;
      }
    }
    const groups = /* @__PURE__ */ new Map();
    for (const node of graph.nodes) {
      const cluster = Number(node.cluster) || 0;
      if (!groups.has(cluster)) groups.set(cluster, []);
      groups.get(cluster).push(roles[node.id].internalStrength);
    }
    for (const node of graph.nodes) {
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
  function methodSupport(graph) {
    if (graph._backend === "independent-bnr-standalone" && graph.importedStandalone) {
      const settings = graph.clustering || {}, objective = settings.objective;
      if (settings.algorithm !== "leiden" || objective !== "modularity" || graph.importedStandalone.objective && graph.importedStandalone.objective !== objective || graph.directed === true || graph.networkModel && graph.networkModel !== "pairwise" || graph.order != null && graph.order !== 2) return { supported: false, algorithm: settings.algorithm || "unspecified", objective: objective || "unspecified", reason: "Unsupported retained standalone objective or representation; no native CPM fallback is permitted." };
      return { supported: true, algorithm: "leiden", representation: "pairwise", score: "Modularity", objective: "modularity", label: "Imported Leiden modularity", seed: Number.isSafeInteger(settings.seed) ? settings.seed : null, iterations: Number.isSafeInteger(settings.iterations) && settings.iterations > 0 ? settings.iterations : null, parameters: ["seed", "iterations"], execution: "retained-standalone-import", nativeRecomputation: false, evidenceResampling: false, wholeHyperedgeRoles: false, constructionComparison: false, marginNull: false, reminingAudit: false, semanticSensitivity: false, collaborationSensitivity: false };
    }
    if (graph.collaboration && (!["author", "institution", "country"].includes(graph.collaboration.kind) || graph.entityKind !== graph.collaboration.kind || graph.networkModel !== "pairwise" || graph.order !== 2 || graph.clustering?.algorithm !== "leiden" || !["full-pair", "fractional-pair"].includes(graph.collaboration.counting))) return { supported: false, reason: "Unknown collaboration actor construction/search. Only declared pairwise Leiden CPM is implemented." };
    if (graph.semantic && (!["terms", "topics", "embeddings"].includes(graph.semantic.kind) || graph.networkModel !== "pairwise" || graph.clustering?.algorithm !== "leiden")) return { supported: false, reason: "Unknown or unsupported semantic construction/search. Semantic views currently use pairwise Leiden CPM." };
    const history = graph.directed === true || graph.method === "direct_citation" || graph.canvasKind === "historiography";
    const declared = graph.clustering?.algorithm;
    const algorithm = history ? "direct_citation" : graph.trial ? "trial" : declared === "Leiden CPM" ? "leiden" : declared;
    const representation = history ? "directed" : graph.networkModel === "hypergraph" || algorithm === "hypergraph" ? "hypergraph" : graph.networkModel === "higher-order" || graph.order === "all" || Number(graph.order) > 2 ? "higher-order" : "pairwise";
    const entry = METHOD_REGISTRY[algorithm];
    if (graph.networkModel && !["pairwise", "hypergraph", "higher-order", ...history ? ["direct-citation"] : []].includes(graph.networkModel)) return { supported: false, algorithm, representation: graph.networkModel, reason: "Unknown network representation." };
    if (!entry) return { supported: false, algorithm: algorithm || "unspecified", representation, reason: "Unknown or unspecified method. No algorithm fallback is permitted." };
    if (!entry.representations.includes(representation)) return { supported: false, algorithm, representation, reason: "This score/search does not support the selected representation." };
    if (algorithm === "trial" && !["spectral", "aon", "balanced", "local", "categorical"].includes(graph.trial?.result?.family)) return { supported: false, algorithm, representation, reason: "Unknown experimental family." };
    if (algorithm === "hypergraph" && (!["linear", "majority", "quadratic", "strict"].includes(graph.clustering?.hypergraphObjective || "linear") || !["mixed", "leiden-seeded", "group-moves", "annealing"].includes(graph.clustering?.hypergraphSearch || "mixed"))) return { supported: false, algorithm, representation, reason: "Unknown direct hypergraph objective or search." };
    return { supported: true, algorithm, representation, ...entry, evidenceResampling: !graph.collaboration && !graph.temporalSelection && !graph.semantic && entry.evidenceResampling, wholeHyperedgeRoles: false, constructionComparison: !graph.collaboration && !graph.temporalSelection && !graph.semantic && !history && representation === "pairwise", marginNull: !graph.collaboration && !graph.temporalSelection && !graph.semantic && !history && representation === "pairwise", reminingAudit: false, semanticSensitivity: !!graph.semantic, collaborationSensitivity: !!graph.collaboration };
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
  function scientificInputs(graph, records = [], context = {}) {
    const evidence = (Array.isArray(records) ? records : Object.values(records || {})).map((work) => ({ id: work.id, references: sorted(work.references || work.referenced_works), year: work.publication_year ?? work.year ?? null, publicationDate: work.publication_date || null, variants: sorted(work.variants || work.sourceIds || [work.id]) })).sort((left, right) => left.id.localeCompare(right.id));
    const text = { sources: (Array.isArray(records) ? records : Object.values(records || {})).map((work) => ({ id: work.id, title: work.display_name || work.title || null, abstract: work.abstract || work.abstract_inverted_index || null, topics: work.topics || null })).sort((left, right) => left.id.localeCompare(right.id)), analyzedNodes: graph.nodes.map((node) => ({ id: node.id, title: node.title || node.label || null, abstract: node.abstract || node.abstract_inverted_index || null })).sort((left, right) => left.id.localeCompare(right.id)) };
    const nodes = graph.nodes.map((node) => ({ id: node.id, references: sorted(node.references), articles: sorted(node.articles), cluster: node.cluster ?? null })).sort((left, right) => left.id.localeCompare(right.id));
    const directed = graph.directed === true || graph.method === "direct_citation" || graph.canvasKind === "historiography";
    const links = graph.links.map((edge) => {
      const ends = directed ? [edge.source, edge.target] : [edge.source, edge.target].sort();
      return { source: ends[0], target: ends[1], rawSupport: Object.hasOwn(edge, "rawSupport") ? edge.rawSupport : edge.count ?? null, weight: edge.strength ?? edge.weight ?? 1, articles: sorted(edge.articles), references: sorted(edge.references) };
    }).sort((left, right) => canonicalScience(left).localeCompare(canonicalScience(right)));
    const hyperedges = (graph.hyperedges || []).map((edge) => ({ members: sorted(edge.members), articles: sorted(edge.articles), reference: edge.reference || null, weight: edge.weight, support: edge.support ?? edge.articles?.length ?? null })).sort((left, right) => canonicalScience(left).localeCompare(canonicalScience(right)));
    return { version: SCIENCE_VERSION, evidence, text, network: { nodes, links, hyperedges, directed, method: graph.method || graph.canvasKind || "cocitation", order: graph.order ?? 2, maximumOrder: graph.maximumOrder ?? null, threshold: graph.threshold ?? null, minimumSupport: graph.minimumSupport ?? graph.minimumShared ?? null, minimumCosine: graph.minimumCosine ?? null, normalization: graph.normalization || context.normalization || "Legacy definition; inspect source analysis", counting: graph.construction?.counting || graph.counting || context.counting || "Legacy definition; inspect source analysis", metric: graph.metric || null }, settings: { ...graph.clustering, collaboration: graph.collaboration || null, semantic: graph.semantic || null, temporal: graph.temporalSelection || graph.temporalSeries?.settings || null, bursts: graph.burstReport?.settings || null, temporalImplementation: graph.temporalSeries?.implementationVersion || graph.temporalSeries?.version || null, burstImplementation: graph.burstReport?.implementationVersion || graph.burstReport?.version || null, resolution: graph.resolution ?? null, trial: graph.trial?.result?.settings || null, history: graph.historiography?.settings || null }, identity: graph.deduplication || context.identity || null, versions: context.versions || { implementation: "Legacy/unverified; not eligible for equivalent-computation reuse" } };
  }
  async function createScientificManifest(graph, records = [], context = {}) {
    const previous = graph.scientificManifest;
    context = { evidenceId: previous?.evidence?.id || graph.evidenceId || null, retrievedAt: previous?.evidence?.retrievedAt || graph.retrievedAt || null, retrieval: previous?.evidence?.retrieval || graph.retrieval || null, completeness: previous?.evidence?.completeness, versions: previous?.versions, textVersions: previous?.dependencies?.textVersions, ...graph.evidenceProvenance, ...context };
    const input = scientificInputs(graph, records, context), support = methodSupport(graph);
    const [evidence, text, network, analysis] = await Promise.all([scienceDigest({ evidence: input.evidence, identity: input.identity }), scienceDigest({ text: input.text, versions: context.textVersions || null }), scienceDigest({ network: { ...input.network, nodes: input.network.nodes.map(({ cluster, ...node }) => node) }, versions: input.versions }), scienceDigest(input)]);
    return { version: SCIENCE_VERSION, createdAt: (/* @__PURE__ */ new Date()).toISOString(), fingerprints: { algorithm: "SHA-256", evidence, text, network, analysis, eligibility: "Audit fingerprints only. Server authorization, dependency versions and scope decide shared reuse." }, evidence: { id: context.evidenceId || graph.evidenceId || null, retrievedAt: context.retrievedAt || graph.retrievedAt || null, retrieval: context.retrieval || graph.retrieval || null, completeness: context.completeness || "Unknown unless recorded by retrieval", coverage: evidenceCoverage(records) }, method: support, construction: { ...input.network, nodes: void 0, links: void 0, hyperedges: void 0, nodesCount: input.network.nodes.length, linksCount: input.network.links.length, hyperedgesCount: input.network.hyperedges.length, rawSupportMeaning: graph._backend === "independent-bnr-standalone" && graph.importedStandalone ? graph.construction?.method === "bibliographic_coupling" ? "Distinct shared references for each imported bibliographic-coupling edge, not supporting source records." : graph.construction?.method === "semantic_embeddings" ? "Not defined for imported semantic edges: rawSupport is null. Edge weight is the retained MiniLM cosine, not citation evidence or a count of supporting records." : "Imported raw-support semantics are not specified here; inspect the original construction and retained report." : "Distinct supporting records. Weighted bootstrap multiplicities and fractional contributions are different quantities." }, settings: input.settings, identity: input.identity, versions: input.versions, dependencies: { textVersions: context.textVersions || null, descriptions: "Generated descriptions require their model, prompt, text evidence and sibling memberships; these audit hashes alone do not authorize reuse." }, humanInterpretation: { status: "Not established by mathematical checks", aiDescriptions: "Suggested summaries, not evidence of thematic validity." } };
  }

  // scripts/evidence-metrics.mjs
  function bootstrapWeights(ids, sample) {
    let seed = 20261016 + sample;
    const weights = {};
    for (let draw = 0; draw < ids.length; draw++) {
      seed = Math.imul(seed, 1664525) + 1013904223 >>> 0;
      const id = ids[Math.floor(seed / 4294967296 * ids.length)];
      weights[id] = (weights[id] || 0) + 1;
    }
    return weights;
  }

  // scripts/scientific-invalidation.mjs
  function invalidateScientificOutputs(graph) {
    if (graph.scientificManifest && !graph.evidenceProvenance) {
      const manifest = graph.scientificManifest;
      graph.evidenceProvenance = { evidenceId: manifest.evidence?.id || null, retrievedAt: manifest.evidence?.retrievedAt || null, retrieval: manifest.evidence?.retrieval || null, completeness: manifest.evidence?.completeness, versions: manifest.versions, textVersions: manifest.dependencies?.textVersions };
    }
    delete graph.scienceAudit;
    delete graph.collaborationSensitivity;
    delete graph.temporalSeries;
    delete graph.temporalSelection;
    delete graph.burstReport;
    delete graph.scientificManifest;
    return graph;
  }

  // scripts/network-extensions.mjs
  function holmAdjust(values, familySize = values.length) {
    if (!Number.isInteger(familySize) || familySize < values.length) throw new Error("Invalid test family");
    const ordered = values.map((value, index) => ({ value, index })).sort((left, right) => left.value - right.value), adjusted = [];
    let previous = 0;
    for (const [rank, item] of ordered.entries()) {
      if (!(item.value >= 0 && item.value <= 1)) throw new Error("Invalid p value");
      previous = Math.max(previous, Math.min(1, item.value * (familySize - rank)));
      adjusted[item.index] = previous;
    }
    return adjusted;
  }

  // scripts/construction-audit.mjs
  var CONSTRUCTION_VERSION = "incidence-audit-v1";
  var keyFor = (left, right) => JSON.stringify([left, right].sort());
  var chooseTwo = (size) => size * (size - 1) / 2;
  function incidenceEvidence(graph) {
    if (graph.collaboration) throw Error("Citation incidence audits are not defined for collaboration actors.");
    if (graph.directed || graph.canvasKind === "historiography" || graph.method === "direct_citation") throw new Error("This audit requires an undirected citation-derived projection.");
    const ids = graph.nodes.map((node) => node.id), eligible = new Set(ids);
    if (eligible.size !== ids.length) throw new Error("Evidence identifiers must be unique.");
    const coupling = graph.method === "coupling" || graph.canvasKind === "coupling", rows = /* @__PURE__ */ new Map();
    if (coupling) {
      for (const node of graph.nodes) {
        if (!Array.isArray(node.references)) throw new Error("Full available source reference lists are required.");
        for (const reference of new Set(node.references)) {
          if (!rows.has(reference)) rows.set(reference, /* @__PURE__ */ new Set());
          rows.get(reference).add(node.id);
        }
      }
    } else {
      for (const node of graph.nodes) {
        if (!Array.isArray(node.articles)) throw new Error("Source-to-reference incidence is required.");
        for (const source of new Set(node.articles)) {
          if (!rows.has(source)) rows.set(source, /* @__PURE__ */ new Set());
          rows.get(source).add(node.id);
        }
      }
    }
    const records = [...rows].sort(([left], [right]) => left.localeCompare(right)).map(([id, members]) => ({ id, members: [...members].filter((member) => eligible.has(member)).sort() }));
    const incidences = records.reduce((sum, row) => sum + row.members.length, 0), pairs = records.reduce((sum, row) => sum + chooseTwo(row.members.length), 0);
    if (ids.length > 800 || incidences > 5e4 || pairs > 3e6) throw new Error("Deep projection audits support up to 800 articles, 50,000 incidences and 3 million event-pair contributions. Narrow the analytical scope; no evidence was truncated.");
    return { ids: [...ids].sort(), rows: records, coupling, incidences, contributions: pairs, scope: coupling ? "Selected source articles and their full available reference lists" : "Selected reference universe and observed citing-source incidence" };
  }
  function projectIncidence(evidence, options = {}) {
    const counting = options.counting || "full", normalization = options.normalization || "cosine", minimumSupport = options.minimumSupport ?? 1;
    if (!["full", "event-fractional"].includes(counting) || !["raw", "cosine", "jaccard", "association"].includes(normalization) || !Number.isInteger(minimumSupport) || minimumSupport < 1) throw new Error("Invalid construction definition.");
    const candidates = /* @__PURE__ */ new Map(), masses = Object.fromEntries(evidence.ids.map((id) => [id, 0]));
    for (const row of evidence.rows) {
      const multiplicity = options.rowWeights ? options.rowWeights[row.id] || 0 : 1;
      if (!multiplicity) continue;
      const weight = multiplicity * (counting === "event-fractional" ? row.members.length > 1 ? 1 / chooseTwo(row.members.length) : 1 : 1);
      for (const member of row.members) masses[member] += weight;
      for (let left = 0; left < row.members.length; left++) for (let right = left + 1; right < row.members.length; right++) {
        const source = row.members[left], target = row.members[right], key = keyFor(source, target);
        if (!candidates.has(key)) candidates.set(key, { source, target, rawSupport: 0, weightedSupport: 0 });
        const pair = candidates.get(key);
        pair.rawSupport++;
        pair.weightedSupport += weight;
      }
    }
    const links = [];
    for (const pair of candidates.values()) if (pair.rawSupport >= minimumSupport) {
      const left = masses[pair.source], right = masses[pair.target], denominator = normalization === "cosine" ? Math.sqrt(left * right) : normalization === "jaccard" ? left + right - pair.weightedSupport : normalization === "association" ? left * right : 1;
      const strength = denominator > 0 ? pair.weightedSupport / denominator : 0;
      if (strength > 0) links.push({ ...pair, count: pair.rawSupport, strength });
    }
    return { links, counting, normalization, minimumSupport, candidatePairs: candidates.size, scope: evidence.scope, supportMeaning: evidence.coupling ? "Distinct shared reference IDs" : "Distinct citing source IDs", weightingMeaning: counting === "full" ? "Each incidence event contributes one to each member pair." : "Each multi-member incidence event contributes total pair weight one; singleton events retain marginal weight one. For coupling, events are shared references, not source bibliographies." };
  }
  function constructionCandidates(graph) {
    const evidence = incidenceEvidence(graph), minimumSupport = Math.max(1, graph.method === "coupling" || graph.canvasKind === "coupling" ? graph.minimumShared || 3 : graph.minimumSupport || 5);
    const variants = [
      { counting: "full", normalization: "raw", minimumSupport },
      { counting: "full", normalization: "cosine", minimumSupport },
      { counting: "full", normalization: "jaccard", minimumSupport },
      { counting: "full", normalization: "association", minimumSupport },
      { counting: "event-fractional", normalization: "cosine", minimumSupport },
      { counting: "full", normalization: "cosine", minimumSupport: minimumSupport + 1 }
    ];
    return variants.map((definition) => {
      const construction = projectIncidence(evidence, definition), adjacent = new Set(construction.links.flatMap((edge) => [edge.source, edge.target]));
      return { ...graph, nodes: graph.nodes.map((node) => ({ ...node, cluster: 0 })), links: construction.links, scienceAudit: void 0, reliability: void 0, appliedSettings: void 0, autoCPM: void 0, themeDescriptions: void 0, generatedDescriptions: void 0, construction: { ...construction, links: void 0 }, stats: { nodes: graph.nodes.length, edges: construction.links.length, clusters: 0, isolated_nodes: graph.nodes.length - adjacent.size }, normalization: construction.normalization };
    });
  }
  function randomSource(seed) {
    let state = seed >>> 0;
    return () => {
      state = Math.imul(1664525, state) + 1013904223 >>> 0;
      return state / 4294967296;
    };
  }
  function marginSignature(evidence) {
    const columns = Object.fromEntries(evidence.ids.map((id) => [id, 0]));
    for (const row of evidence.rows) for (const id of row.members) columns[id]++;
    return JSON.stringify({ rows: evidence.rows.map((row) => [row.id, row.members.length]), columns });
  }
  function switchIncidence(evidence, options = {}) {
    const rows = evidence.rows.map((row) => ({ id: row.id, members: [...row.members], membership: new Set(row.members) })), random = randomSource(options.seed ?? 42), attempts = options.attempts ?? Math.max(100, evidence.incidences * 20);
    if (!Number.isInteger(attempts) || attempts < 1 || attempts > 1e7) throw new Error("Invalid switch-chain budget.");
    let accepted = 0, feasible = false;
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (rows.length < 2) break;
      const left = Math.floor(random() * rows.length), right = Math.floor(random() * rows.length);
      if (left === right || !rows[left].members.length || !rows[right].members.length) continue;
      const leftPosition = Math.floor(random() * rows[left].members.length), rightPosition = Math.floor(random() * rows[right].members.length), first = rows[left].members[leftPosition], second = rows[right].members[rightPosition];
      if (first === second || rows[left].membership.has(second) || rows[right].membership.has(first)) continue;
      rows[left].membership.delete(first);
      rows[left].membership.add(second);
      rows[right].membership.delete(second);
      rows[right].membership.add(first);
      rows[left].members[leftPosition] = second;
      rows[right].members[rightPosition] = first;
      accepted++;
      feasible = true;
    }
    const next = { ...evidence, rows: rows.map((row) => ({ id: row.id, members: [...row.members].sort() })) };
    if (marginSignature(next) !== marginSignature(evidence)) throw new Error("Incidence margin preservation failed; no null result published.");
    let shared = 0;
    for (let position = 0; position < rows.length; position++) for (const member of evidence.rows[position].members) if (rows[position].membership.has(member)) shared++;
    return { evidence: next, attempted: attempts, accepted, acceptance: accepted / attempts, overlap: evidence.incidences ? shared / evidence.incidences : 1, feasible };
  }
  function switchFeasibility(evidence, maximumComparisons = 1e5) {
    const rows = evidence.rows.map((row) => new Set(row.members));
    let comparisons = 0;
    for (let left = 0; left < rows.length; left++) for (let right = left + 1; right < rows.length; right++) {
      if (++comparisons > maximumComparisons) return { status: "undetermined-within-budget", comparisons };
      const first = [...rows[left]].some((id) => !rows[right].has(id)), second = [...rows[right]].some((id) => !rows[left].has(id));
      if (first && second) return { status: "feasible-switch-found", comparisons };
    }
    return { status: "frozen-margins-proven", comparisons };
  }
  function incidenceNull(graph, options = {}, progress = () => {
  }) {
    const samples = options.samples ?? 50, seed = options.seed ?? 20261019;
    if (![10, 50, 199].includes(samples)) throw new Error("Choose 10, 50 or 199 null samples.");
    const evidence = incidenceEvidence(graph), signature = marginSignature(evidence), observed = projectIncidence(evidence, { normalization: "raw" }), byPair = new Map(observed.links.map((edge) => [keyFor(edge.source, edge.target), edge.rawSupport]));
    const keys = graph.links.map((edge) => keyFor(edge.source, edge.target));
    if (new Set(keys).size !== keys.length) throw new Error("Null tests require unique undirected analytical pairs.");
    const records = keys.map((key) => ({ key, observed: byPair.get(key) || 0, exceedances: 0, total: 0, totalSquared: 0 })), diagnostics = [], feasibility = switchFeasibility(evidence), statistics = [];
    let current = evidence;
    for (let position = 0; position < samples; position++) {
      progress("Margin-preserving null " + (position + 1) + "/" + samples);
      const chain = switchIncidence(current, { seed: seed + position * 104729, attempts: Math.max(100, evidence.incidences * (position === 0 ? 200 : 100)) });
      current = chain.evidence;
      if (marginSignature(current) !== signature) throw new Error("Null margins changed; no result published.");
      const nullPairs = new Map(projectIncidence(current, { normalization: "raw" }).links.map((edge) => [keyFor(edge.source, edge.target), edge.rawSupport]));
      for (const record of records) {
        const value = nullPairs.get(record.key) || 0;
        record.exceedances += value >= record.observed ? 1 : 0;
        record.total += value;
        record.totalSquared += value * value;
      }
      statistics.push(records.reduce((sum, record) => sum + (nullPairs.get(record.key) || 0), 0));
      const originalRows = new Map(evidence.rows.map((row) => [row.id, new Set(row.members)]));
      const originalShared = current.rows.reduce((sum, row) => sum + row.members.filter((id) => originalRows.get(row.id).has(id)).length, 0);
      diagnostics.push({ attempted: chain.attempted, accepted: chain.accepted, acceptance: chain.acceptance, consecutiveOverlap: chain.overlap, originalOverlap: evidence.incidences ? originalShared / evidence.incidences : 1 });
    }
    const accepted = diagnostics.reduce((sum, item) => sum + item.accepted, 0), familySize = chooseTwo(evidence.ids.length), adjusted = holmAdjust(records.map((record) => (record.exceedances + 1) / (samples + 1)), familySize);
    const status = feasibility.status === "frozen-margins-proven" ? "degenerate-not-assessed" : diagnostics.some((item) => item.accepted < evidence.incidences) || !accepted ? "insufficient-movement" : "exploratory-null";
    const average = statistics.reduce((sum, value) => sum + value, 0) / statistics.length, variance = statistics.reduce((sum, value) => sum + (value - average) ** 2, 0), lagOne = variance ? statistics.slice(1).reduce((sum, value, position) => sum + (value - average) * (statistics[position] - average), 0) / variance : null;
    return { version: CONSTRUCTION_VERSION, status, samples, seed, familySize, minimumP: 1 / (samples + 1), multiplicityResolution: familySize / (samples + 1) > 0.05 ? "Too few simulations to attain Holm-adjusted 0.05 for the smallest p value across this pair family; no absence-of-significance reassurance is warranted." : "Finite Monte Carlo resolution still limits attainable p values.", marginsPreserved: true, scope: evidence.scope, diagnostics, feasibility, lagOne: { statistic: "Total overlap on examined pairs", value: lagOne, limitation: "One scalar movement diagnostic; low autocorrelation is not proof of mixing." }, acceptedSwitches: accepted, records: records.map((record, position) => {
      const mean = record.total / samples, variance2 = Math.max(0, record.totalSquared / samples - mean * mean);
      return { key: record.key, observed: record.observed, nullMean: mean, enrichment: mean ? record.observed / mean : null, excess: record.observed - mean, nullSD: Math.sqrt(variance2), p: (record.exceedances + 1) / (samples + 1), adjustedP: status === "exploratory-null" ? adjusted[position] : null };
    }), limitation: "Exploratory binary-incidence switch-chain baseline preserving each event size and article incidence frequency exactly. Attempt/acceptance counts and successive/original overlaps diagnose movement, not convergence or independence. Empirical p values use +1 correction and Holm over all possible pairs in the selected universe. This is a pair-overlap test, not whole-hyperedge significance, thematic validity or evidence-bootstrap reliability. Frozen or low-movement chains are not assessed. Higher-order combination re-mining is not performed." };
  }

  // node_modules/ngraph.events/index.js
  function eventify(subject) {
    validateSubject(subject);
    const eventsStorage = createEventsStorage(subject);
    subject.on = eventsStorage.on;
    subject.off = eventsStorage.off;
    subject.fire = eventsStorage.fire;
    return subject;
  }
  function createEventsStorage(subject) {
    let registeredEvents = /* @__PURE__ */ Object.create(null);
    return {
      on: function(eventName, callback, ctx) {
        if (typeof callback !== "function") {
          throw new Error("callback is expected to be a function");
        }
        let handlers = registeredEvents[eventName];
        if (!handlers) {
          handlers = registeredEvents[eventName] = [];
        }
        handlers.push({ callback, ctx });
        return subject;
      },
      off: function(eventName, callback) {
        const wantToRemoveAll = typeof eventName === "undefined";
        if (wantToRemoveAll) {
          registeredEvents = /* @__PURE__ */ Object.create(null);
          return subject;
        }
        if (registeredEvents[eventName]) {
          const deleteAllCallbacksForEvent = typeof callback !== "function";
          if (deleteAllCallbacksForEvent) {
            delete registeredEvents[eventName];
          } else {
            const callbacks = registeredEvents[eventName];
            for (let i = 0; i < callbacks.length; ++i) {
              if (callbacks[i].callback === callback) {
                callbacks.splice(i, 1);
              }
            }
          }
        }
        return subject;
      },
      fire: function(eventName) {
        const callbacks = registeredEvents[eventName];
        if (!callbacks) {
          return subject;
        }
        let fireArguments;
        if (arguments.length > 1) {
          fireArguments = Array.prototype.slice.call(arguments, 1);
        }
        for (let i = 0; i < callbacks.length; ++i) {
          const callbackInfo = callbacks[i];
          callbackInfo.callback.apply(callbackInfo.ctx, fireArguments);
        }
        return subject;
      }
    };
  }
  function validateSubject(subject) {
    if (!subject) {
      throw new Error("Eventify cannot use falsy object as events subject");
    }
    const reservedWords = ["on", "fire", "off"];
    for (let i = 0; i < reservedWords.length; ++i) {
      if (subject.hasOwnProperty(reservedWords[i])) {
        throw new Error("Subject cannot be eventified, since it already has property '" + reservedWords[i] + "'");
      }
    }
  }

  // node_modules/ngraph.graph/index.js
  var ngraph_default = createGraph;
  function createGraph(options) {
    options = options || {};
    if ("uniqueLinkId" in options) {
      console.warn(
        "ngraph.graph: Starting from version 0.14 `uniqueLinkId` is deprecated.\nUse `multigraph` option instead\n",
        "\n",
        "Note: there is also change in default behavior: From now on each graph\nis considered to be not a multigraph by default (each edge is unique)."
      );
      options.multigraph = options.uniqueLinkId;
    }
    if (options.multigraph === void 0) options.multigraph = false;
    if (typeof Map !== "function") {
      throw new Error("ngraph.graph requires `Map` to be defined. Please polyfill it before using ngraph");
    }
    var nodes = /* @__PURE__ */ new Map();
    var links = /* @__PURE__ */ new Map();
    var multiEdges = {};
    var suspendEvents = 0;
    var createLink = options.multigraph ? createUniqueLink : createSingleLink, changes = [], recordLinkChange = noop, recordNodeChange = noop, enterModification = noop, exitModification = noop;
    var graphPart = {
      /**
       * Sometimes duck typing could be slow. Giving clients a hint about data structure
       * via explicit version number here:
       */
      version: 20,
      /**
       * Adds node to the graph. If node with given id already exists in the graph
       * its data is extended with whatever comes in 'data' argument.
       *
       * @param nodeId the node's identifier. A string or number is preferred.
       * @param [data] additional data for the node being added. If node already
       *   exists its data object is augmented with the new one.
       *
       * @return {node} The newly added node or node with given id if it already exists.
       */
      addNode,
      /**
       * Adds a link to the graph. The function always create a new
       * link between two nodes. If one of the nodes does not exists
       * a new node is created.
       *
       * @param fromId link start node id;
       * @param toId link end node id;
       * @param [data] additional data to be set on the new link;
       *
       * @return {link} The newly created link
       */
      addLink,
      /**
       * Removes link from the graph. If link does not exist does nothing.
       *
       * @param link - object returned by addLink() or getLinks() methods.
       *
       * @returns true if link was removed; false otherwise.
       */
      removeLink,
      /**
       * Removes node with given id from the graph. If node does not exist in the graph
       * does nothing.
       *
       * @param nodeId node's identifier passed to addNode() function.
       *
       * @returns true if node was removed; false otherwise.
       */
      removeNode,
      /**
       * Gets node with given identifier. If node does not exist undefined value is returned.
       *
       * @param nodeId requested node identifier;
       *
       * @return {node} in with requested identifier or undefined if no such node exists.
       */
      getNode,
      /**
       * Gets number of nodes in this graph.
       *
       * @return number of nodes in the graph.
       */
      getNodeCount,
      /**
       * Gets total number of links in the graph.
       */
      getLinkCount,
      /**
       * Synonym for `getLinkCount()`
       */
      getEdgeCount: getLinkCount,
      /**
       * Synonym for `getLinkCount()`
       */
      getLinksCount: getLinkCount,
      /**
       * Synonym for `getNodeCount()`
       */
      getNodesCount: getNodeCount,
      /**
       * Gets all links (inbound and outbound) from the node with given id.
       * If node with given id is not found null is returned.
       *
       * @param nodeId requested node identifier.
       *
       * @return Set of links from and to requested node if such node exists;
       *   otherwise null is returned.
       */
      getLinks,
      /**
       * Invokes callback on each node of the graph.
       *
       * @param {Function(node)} callback Function to be invoked. The function
       *   is passed one argument: visited node.
       */
      forEachNode,
      /**
       * Invokes callback on every linked (adjacent) node to the given one.
       *
       * @param nodeId Identifier of the requested node.
       * @param {Function(node, link)} callback Function to be called on all linked nodes.
       *   The function is passed two parameters: adjacent node and link object itself.
       * @param oriented if true graph treated as oriented.
       */
      forEachLinkedNode,
      /**
       * Enumerates all links in the graph
       *
       * @param {Function(link)} callback Function to be called on all links in the graph.
       *   The function is passed one parameter: graph's link object.
       *
       * Link object contains at least the following fields:
       *  fromId - node id where link starts;
       *  toId - node id where link ends,
       *  data - additional data passed to graph.addLink() method.
       */
      forEachLink,
      /**
       * Suspend all notifications about graph changes until
       * endUpdate is called.
       */
      beginUpdate: enterModification,
      /**
       * Resumes all notifications about graph changes and fires
       * graph 'changed' event in case there are any pending changes.
       */
      endUpdate: exitModification,
      /**
       * Removes all nodes and links from the graph.
       */
      clear,
      /**
       * Detects whether there is a link between two nodes.
       * Operation complexity is O(n) where n - number of links of a node.
       * NOTE: this function is synonym for getLink()
       *
       * @returns link if there is one. null otherwise.
       */
      hasLink: getLink,
      /**
       * Detects whether there is a node with given id
       * 
       * Operation complexity is O(1)
       * NOTE: this function is synonym for getNode()
       *
       * @returns node if there is one; Falsy value otherwise.
       */
      hasNode: getNode,
      /**
       * Gets an edge between two nodes.
       * Operation complexity is O(n) where n - number of links of a node.
       *
       * @param {string} fromId link start identifier
       * @param {string} toId link end identifier
       *
       * @returns link if there is one; undefined otherwise.
       */
      getLink,
      /**
       * Gets a link by its id.
       *
       * @param {string} linkId link identifier
       *
       * @returns link if there is one; undefined otherwise.
       */
      getLinkById
    };
    eventify(graphPart);
    monitorSubscribers();
    return graphPart;
    function monitorSubscribers() {
      var realOn = graphPart.on;
      graphPart.on = on;
      function on() {
        graphPart.beginUpdate = enterModification = enterModificationReal;
        graphPart.endUpdate = exitModification = exitModificationReal;
        recordLinkChange = recordLinkChangeReal;
        recordNodeChange = recordNodeChangeReal;
        graphPart.on = realOn;
        return realOn.apply(graphPart, arguments);
      }
    }
    function recordLinkChangeReal(link, changeType) {
      changes.push({
        link,
        changeType
      });
    }
    function recordNodeChangeReal(node, changeType) {
      changes.push({
        node,
        changeType
      });
    }
    function addNode(nodeId, data) {
      if (nodeId === void 0) {
        throw new Error("Invalid node identifier");
      }
      enterModification();
      var node = getNode(nodeId);
      if (!node) {
        node = new Node(nodeId, data);
        recordNodeChange(node, "add");
      } else {
        node.data = data;
        recordNodeChange(node, "update");
      }
      nodes.set(nodeId, node);
      exitModification();
      return node;
    }
    function getNode(nodeId) {
      return nodes.get(nodeId);
    }
    function removeNode(nodeId) {
      var node = getNode(nodeId);
      if (!node) {
        return false;
      }
      enterModification();
      var prevLinks = node.links;
      if (prevLinks) {
        prevLinks.forEach(removeLinkInstance);
        node.links = null;
      }
      nodes.delete(nodeId);
      recordNodeChange(node, "remove");
      exitModification();
      return true;
    }
    function addLink(fromId, toId, data) {
      enterModification();
      var fromNode = getNode(fromId) || addNode(fromId);
      var toNode = getNode(toId) || addNode(toId);
      var link = createLink(fromId, toId, data);
      var isUpdate = links.has(link.id);
      links.set(link.id, link);
      addLinkToNode(fromNode, link);
      if (fromId !== toId) {
        addLinkToNode(toNode, link);
      }
      recordLinkChange(link, isUpdate ? "update" : "add");
      exitModification();
      return link;
    }
    function createSingleLink(fromId, toId, data) {
      var linkId = makeLinkId(fromId, toId);
      var prevLink = links.get(linkId);
      if (prevLink) {
        prevLink.data = data;
        return prevLink;
      }
      return new Link(fromId, toId, data, linkId);
    }
    function createUniqueLink(fromId, toId, data) {
      var linkId = makeLinkId(fromId, toId);
      var isMultiEdge = multiEdges.hasOwnProperty(linkId);
      if (isMultiEdge || getLink(fromId, toId)) {
        if (!isMultiEdge) {
          multiEdges[linkId] = 0;
        }
        var suffix = "@" + ++multiEdges[linkId];
        linkId = makeLinkId(fromId + suffix, toId + suffix);
      }
      return new Link(fromId, toId, data, linkId);
    }
    function getNodeCount() {
      return nodes.size;
    }
    function getLinkCount() {
      return links.size;
    }
    function getLinks(nodeId) {
      var node = getNode(nodeId);
      return node ? node.links : null;
    }
    function removeLink(link, otherId) {
      if (otherId !== void 0) {
        link = getLink(link, otherId);
      }
      return removeLinkInstance(link);
    }
    function removeLinkInstance(link) {
      if (!link) {
        return false;
      }
      if (!links.get(link.id)) return false;
      enterModification();
      links.delete(link.id);
      var fromNode = getNode(link.fromId);
      var toNode = getNode(link.toId);
      if (fromNode) {
        fromNode.links.delete(link);
      }
      if (toNode) {
        toNode.links.delete(link);
      }
      recordLinkChange(link, "remove");
      exitModification();
      return true;
    }
    function getLink(fromNodeId, toNodeId) {
      if (fromNodeId === void 0 || toNodeId === void 0) return void 0;
      return links.get(makeLinkId(fromNodeId, toNodeId));
    }
    function getLinkById(linkId) {
      if (linkId === void 0) return void 0;
      return links.get(linkId);
    }
    function clear() {
      enterModification();
      forEachNode(function(node) {
        removeNode(node.id);
      });
      exitModification();
    }
    function forEachLink(callback) {
      if (typeof callback === "function") {
        var valuesIterator = links.values();
        var nextValue = valuesIterator.next();
        while (!nextValue.done) {
          if (callback(nextValue.value)) {
            return true;
          }
          nextValue = valuesIterator.next();
        }
      }
    }
    function forEachLinkedNode(nodeId, callback, oriented) {
      var node = getNode(nodeId);
      if (node && node.links && typeof callback === "function") {
        if (oriented) {
          return forEachOrientedLink(node.links, nodeId, callback);
        } else {
          return forEachNonOrientedLink(node.links, nodeId, callback);
        }
      }
    }
    function forEachNonOrientedLink(links2, nodeId, callback) {
      var quitFast;
      var valuesIterator = links2.values();
      var nextValue = valuesIterator.next();
      while (!nextValue.done) {
        var link = nextValue.value;
        var linkedNodeId = link.fromId === nodeId ? link.toId : link.fromId;
        quitFast = callback(nodes.get(linkedNodeId), link);
        if (quitFast) {
          return true;
        }
        nextValue = valuesIterator.next();
      }
    }
    function forEachOrientedLink(links2, nodeId, callback) {
      var quitFast;
      var valuesIterator = links2.values();
      var nextValue = valuesIterator.next();
      while (!nextValue.done) {
        var link = nextValue.value;
        if (link.fromId === nodeId) {
          quitFast = callback(nodes.get(link.toId), link);
          if (quitFast) {
            return true;
          }
        }
        nextValue = valuesIterator.next();
      }
    }
    function noop() {
    }
    function enterModificationReal() {
      suspendEvents += 1;
    }
    function exitModificationReal() {
      suspendEvents -= 1;
      if (suspendEvents === 0 && changes.length > 0) {
        graphPart.fire("changed", changes);
        changes.length = 0;
      }
    }
    function forEachNode(callback) {
      if (typeof callback !== "function") {
        throw new Error("Function is expected to iterate over graph nodes. You passed " + callback);
      }
      var valuesIterator = nodes.values();
      var nextValue = valuesIterator.next();
      while (!nextValue.done) {
        if (callback(nextValue.value)) {
          return true;
        }
        nextValue = valuesIterator.next();
      }
    }
  }
  function Node(id, data) {
    this.id = id;
    this.links = null;
    this.data = data;
  }
  function addLinkToNode(node, link) {
    if (node.links) {
      node.links.add(link);
    } else {
      node.links = /* @__PURE__ */ new Set([link]);
    }
  }
  function Link(fromId, toId, data, id) {
    this.fromId = fromId;
    this.toId = toId;
    this.data = data;
    this.id = id;
  }
  function makeLinkId(fromId, toId) {
    return fromId.toString() + "\u{1F449} " + toId.toString();
  }

  // node_modules/ngraph.leiden/dist/ngraph-leiden.es.js
  function K(t, n = {}) {
    const o = n.linkWeight || ((A) => A.data && typeof A.data.weight == "number" ? A.data.weight : 1), u = n.nodeSize || ((A) => A.data && typeof A.data.size == "number" ? A.data.size : 1), r = !!n.directed, i = n.baseNodeIds, f = [], c = /* @__PURE__ */ new Map();
    if (Array.isArray(i) && i.length > 0)
      for (let A = 0; A < i.length; A++) {
        const T = i[A];
        if (!(t.getNode ? t.getNode(T) : null)) throw new Error("Multilayer graphs must share identical node ids. Missing: " + T);
        c.set(T, A), f.push(T);
      }
    else
      t.forEachNode((A) => {
        c.set(A.id, f.length), f.push(A.id);
      });
    const e = f.length, s = new Float64Array(e), y = new Float64Array(e), I = new Float64Array(e), C = new Float64Array(e), w = new Array(e), h = new Array(e);
    for (let A = 0; A < e; A++)
      w[A] = [], h[A] = [];
    if (r)
      t.forEachLink((A) => {
        const T = c.get(A.fromId), d = c.get(A.toId);
        if (T == null || d == null) return;
        const a = +o(A) || 0;
        if (T === d) {
          y[T] += a, I[T] += a, C[T] += a;
          return;
        }
        w[T].push({ to: d, w: a }), h[d].push({ from: T, w: a }), I[T] += a, C[d] += a;
      });
    else {
      const A = /* @__PURE__ */ new Map();
      t.forEachLink((T) => {
        const d = c.get(T.fromId), a = c.get(T.toId);
        if (d == null || a == null) return;
        const x = +o(T) || 0;
        if (d === a) {
          y[d] += x;
          return;
        }
        const S = d < a ? d : a, k = d < a ? a : d, P = S + ":" + k;
        let F = A.get(P);
        F || (F = { sum: 0, seenAB: 0, seenBA: 0 }, A.set(P, F)), F.sum += x, d === S ? F.seenAB = 1 : F.seenBA = 1;
      });
      for (const [T, d] of A.entries()) {
        const [a, x] = T.split(":"), S = +a, k = +x, P = (d.seenAB ? 1 : 0) + (d.seenBA ? 1 : 0), F = P > 0 ? d.sum / P : 0;
        F !== 0 && (w[S].push({ to: k, w: F }), w[k].push({ to: S, w: F }), h[S].push({ from: k, w: F }), h[k].push({ from: S, w: F }), I[S] += F, I[k] += F, C[S] += F, C[k] += F);
      }
      for (let T = 0; T < e; T++) {
        const d = y[T];
        d !== 0 && (I[T] += 2 * d, C[T] += 2 * d);
      }
    }
    t.forEachNode((A) => {
      const T = c.get(A.id);
      s[T] = +u(A) || 0;
    });
    const g = I.reduce((A, T) => A + T, 0);
    function b(A, T) {
      const d = w[A];
      for (let a = 0; a < d.length; a++) T(d[a].to, d[a].w);
    }
    return {
      n: e,
      nodeIds: f,
      idToIndex: c,
      size: s,
      selfLoop: y,
      strengthOut: I,
      strengthIn: C,
      outEdges: w,
      inEdges: h,
      directed: r,
      totalWeight: g,
      forEachNeighbor: b
    };
  }
  function tt(t) {
    const n = t.n, o = new Int32Array(n);
    for (let m = 0; m < n; m++) o[m] = m;
    let u = n, r = new Float64Array(u), i = new Int32Array(u), f = new Float64Array(u), c = new Float64Array(u), e = new Float64Array(u), s = new Float64Array(u), y = new Int32Array(n), I = 0, C = new Float64Array(n), w = new Float64Array(n), h = new Float64Array(n), g = new Uint8Array(n);
    function b(m) {
      if (m <= r.length) return;
      const l = Math.max(m, Math.ceil(r.length * 1.5));
      r = R(r, l), i = Y(i, l), f = R(f, l), c = R(c, l), e = R(e, l), s = R(s, l), m > C.length && (C = R(C, l), w = R(w, l), h = R(h, l), g = it(g, l), y = Y(y, l));
    }
    function A() {
      r.fill(0), i.fill(0), f.fill(0), c.fill(0), e.fill(0), s.fill(0);
      for (let m = 0; m < n; m++) {
        const l = o[m];
        r[l] += t.size[m], i[l] += 1, t.directed ? (e[l] += t.strengthOut[m], s[l] += t.strengthIn[m]) : c[l] += t.strengthOut[m], t.selfLoop[m] !== 0 && (f[l] += t.selfLoop[m]);
      }
      if (t.directed)
        for (let m = 0; m < n; m++) {
          const l = o[m], M = t.outEdges[m];
          for (let E = 0; E < M.length; E++) {
            const { to: z, w: _ } = M[E];
            l === o[z] && (f[l] += _);
          }
        }
      else
        for (let m = 0; m < n; m++) {
          const l = o[m], M = t.outEdges[m];
          for (let E = 0; E < M.length; E++) {
            const { to: z, w: _ } = M[E];
            z <= m || l === o[z] && (f[l] += _);
          }
        }
    }
    function T() {
      for (let m = 0; m < I; m++) {
        const l = y[m];
        g[l] = 0, C[l] = 0, w[l] = 0, h[l] = 0;
      }
      I = 0;
    }
    function d(m) {
      g[m] || (g[m] = 1, y[I++] = m);
    }
    function a(m) {
      T();
      const l = o[m];
      if (d(l), t.directed) {
        const M = t.outEdges[m];
        for (let z = 0; z < M.length; z++) {
          const _ = M[z].to, v = M[z].w, W = o[_];
          d(W), w[W] += v;
        }
        const E = t.inEdges[m];
        for (let z = 0; z < E.length; z++) {
          const _ = E[z].from, v = E[z].w, W = o[_];
          d(W), h[W] += v;
        }
      } else {
        const M = t.outEdges[m];
        for (let E = 0; E < M.length; E++) {
          const z = M[E].to, _ = M[E].w, v = o[z];
          d(v), C[v] += _;
        }
      }
      return I;
    }
    const x = t.totalWeight;
    function S(m, l) {
      const M = o[m];
      if (l === M) return 0;
      const E = t.strengthOut[m], z = l < C.length && C[l] || 0, _ = C[M] || 0, v = l < c.length ? c[l] : 0, W = c[M], L = x, B = -(_ / L - E * (W - E) / (L * L)), N = z / L - E * v / (L * L);
      return 2 * (B + N);
    }
    function k(m, l) {
      const M = o[m];
      if (l === M) return 0;
      const E = t.totalWeight, z = t.strengthOut[m], _ = t.strengthIn[m], v = l < h.length && h[l] || 0, W = l < w.length && w[l] || 0, L = h[M] || 0, B = w[M] || 0, N = l < s.length ? s[l] : 0, O = l < e.length ? e[l] : 0, D = s[M], j = e[M], Q = (v + W - L - B) / E, J = (z * (N - (D - _)) + _ * (O - (j - z))) / (E * E);
      return Q - J;
    }
    function P(m, l, M = 1) {
      const E = o[m];
      if (l === E) return 0;
      const z = C[E] || 0, _ = l < C.length && C[l] || 0, v = t.size[m] || 1, W = r[E] || 0, L = l < r.length ? r[l] : 0;
      return _ - z - M * v * (L - W + v);
    }
    function F(m, l) {
      const M = o[m];
      if (M === l) return false;
      l >= u && (b(l + 1), u = l + 1);
      const E = t.strengthOut[m], z = t.strengthIn[m], _ = t.selfLoop[m], v = t.size[m];
      if (i[M] -= 1, i[l] += 1, r[M] -= v, r[l] += v, t.directed ? (e[M] -= E, e[l] += E, s[M] -= z, s[l] += z) : (c[M] -= E, c[l] += E), t.directed) {
        const W = w[M] || 0, L = h[M] || 0, B = l < w.length && w[l] || 0, N = l < h.length && h[l] || 0;
        f[M] -= W + L + _, f[l] += B + N + _;
      } else {
        const W = C[M] || 0, L = C[l] || 0;
        f[M] -= W + _, f[l] += L + _;
      }
      return o[m] = l, true;
    }
    function U(m = {}) {
      const l = [];
      for (let N = 0; N < u; N++) i[N] > 0 && l.push(N);
      m.keepOldOrder ? l.sort((N, O) => N - O) : m.preserveMap instanceof Map ? l.sort((N, O) => {
        const D = m.preserveMap.get(N), j = m.preserveMap.get(O);
        return D != null && j != null && D !== j ? D - j : D != null && j == null ? -1 : j != null && D == null ? 1 : r[O] - r[N] || i[O] - i[N] || N - O;
      }) : l.sort((N, O) => r[O] - r[N] || i[O] - i[N] || N - O);
      const M = new Int32Array(u).fill(-1);
      l.forEach((N, O) => {
        M[N] = O;
      });
      for (let N = 0; N < o.length; N++) o[N] = M[o[N]];
      const E = l.length, z = new Float64Array(E), _ = new Int32Array(E), v = new Float64Array(E), W = new Float64Array(E), L = new Float64Array(E), B = new Float64Array(E);
      for (let N = 0; N < n; N++) {
        const O = o[N];
        z[O] += t.size[N], _[O] += 1, t.directed ? (L[O] += t.strengthOut[N], B[O] += t.strengthIn[N]) : W[O] += t.strengthOut[N], t.selfLoop[N] !== 0 && (v[O] += t.selfLoop[N]);
      }
      if (t.directed)
        for (let N = 0; N < n; N++) {
          const O = o[N], D = t.outEdges[N];
          for (let j = 0; j < D.length; j++) {
            const { to: Q, w: J } = D[j];
            O === o[Q] && (v[O] += J);
          }
        }
      else
        for (let N = 0; N < n; N++) {
          const O = o[N], D = t.outEdges[N];
          for (let j = 0; j < D.length; j++) {
            const { to: Q, w: J } = D[j];
            Q <= N || O === o[Q] && (v[O] += J);
          }
        }
      u = E, r = z, i = _, f = v, c = W, e = L, s = B;
    }
    function p() {
      const m = new Array(u);
      for (let l = 0; l < u; l++) m[l] = [];
      for (let l = 0; l < n; l++) m[o[l]].push(l);
      return m;
    }
    function q(m) {
      return m < r.length ? r[m] : 0;
    }
    function G(m) {
      return m < i.length ? i[m] : 0;
    }
    return {
      n,
      get communityCount() {
        return u;
      },
      nodeCommunity: o,
      get communityTotalSize() {
        return r;
      },
      get communityNodeCount() {
        return i;
      },
      get communityInternalEdgeWeight() {
        return f;
      },
      get communityTotalStrength() {
        return c;
      },
      get communityTotalOutStrength() {
        return e;
      },
      get communityTotalInStrength() {
        return s;
      },
      initializeAggregates: A,
      accumulateNeighborCommunityEdgeWeights: a,
      getCandidateCommunityCount: () => I,
      getCandidateCommunityAt: (m) => y[m],
      getNeighborEdgeWeightToCommunity: (m) => C[m] || 0,
      getOutEdgeWeightToCommunity: (m) => w[m] || 0,
      getInEdgeWeightFromCommunity: (m) => h[m] || 0,
      deltaModularityUndirected: S,
      deltaModularityDirected: k,
      deltaCPM: P,
      moveNodeToCommunity: F,
      compactCommunityIds: U,
      getCommunityMembers: p,
      getCommunityTotalSize: q,
      getCommunityNodeCount: G
    };
  }
  function R(t, n) {
    const o = new Float64Array(n);
    return o.set(t), o;
  }
  function Y(t, n) {
    const o = new Int32Array(n);
    return o.set(t), o;
  }
  function it(t, n) {
    const o = new Uint8Array(n);
    return o.set(t), o;
  }
  function st(t) {
    return t && t.__esModule && Object.prototype.hasOwnProperty.call(t, "default") ? t.default : t;
  }
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
  var ut = /* @__PURE__ */ st(ct);
  function lt(t, n, o, u) {
    if (n.directed) return et(t, n, o, u);
    const r = t.nodeCommunity[o];
    if (u === r) return 0;
    const i = n.strengthOut[o], f = n.totalWeight, c = t.getNeighborEdgeWeightToCommunity(u) || 0, e = t.getNeighborEdgeWeightToCommunity(r) || 0, s = u < t.communityTotalStrength.length ? t.communityTotalStrength[u] : 0, y = t.communityTotalStrength[r], I = -(e / f - i * (y - i) / (f * f)), C = c / f - i * s / (f * f);
    return 2 * (I + C);
  }
  function et(t, n, o, u) {
    const r = t.nodeCommunity[o];
    if (u === r) return 0;
    const i = n.totalWeight, f = n.strengthOut[o], c = n.strengthIn[o], e = u < n.n && t.getInEdgeWeightFromCommunity(u) || 0, s = u < n.n && t.getOutEdgeWeightToCommunity(u) || 0, y = t.getInEdgeWeightFromCommunity(r) || 0, I = t.getOutEdgeWeightToCommunity(r) || 0, C = u < t.communityTotalInStrength.length ? t.communityTotalInStrength[u] : 0, w = u < t.communityTotalOutStrength.length ? t.communityTotalOutStrength[u] : 0, h = t.communityTotalInStrength[r], g = t.communityTotalOutStrength[r], b = (e + s - y - I) / i, A = (f * (C - (h - c)) + c * (w - (g - f))) / (i * i);
    return b - A;
  }
  function ft(t, n, o, u, r = 1) {
    const i = t.nodeCommunity[o];
    if (u === i) return 0;
    const f = t.getNeighborEdgeWeightToCommunity(i) || 0, c = u < n.n && t.getNeighborEdgeWeightToCommunity(u) || 0, e = n.size[o] || 1, s = t.communityTotalSize[i] || 0, y = u < t.communityTotalSize.length ? t.communityTotalSize[u] : 0;
    return c - f - r * e * (y - s + e);
  }
  var dt = 50;
  var at = 1e-12;
  var mt = 0.01;
  function gt(t, n = {}) {
    const o = It(n), u = ut(o.randomSeed), r = () => u.nextDouble(), i = K(t, { directed: o.directed, ...n }), f = i.n;
    let c = null;
    if (o.fixedNodes) {
      const w = new Uint8Array(f), h = o.fixedNodes instanceof Set ? o.fixedNodes : new Set(o.fixedNodes);
      for (const g of h) {
        const b = i.idToIndex.get(g);
        b != null && (w[b] = 1);
      }
      c = w;
    }
    const e = new Int32Array(f);
    for (let w = 0; w < f; w++) e[w] = w;
    let s = i, y = null;
    const I = [];
    for (let w = 0; w < o.maxLevels; w++) {
      const h = tt(s);
      if (h.graph = s, y)
        for (let a = 0; a < s.n; a++)
          h.nodeCommunity[a] = y[a];
      h.initializeAggregates();
      const g = w === 0 ? c : null;
      if (ht(s, h, o, r, g), ot(h, o.preserveLabels), h.communityCount === s.n) {
        I.push({ graph: s, partition: h });
        const a = h.nodeCommunity;
        for (let x = 0; x < e.length; x++)
          e[x] = a[e[x]];
        break;
      }
      let b = h, A = null;
      if (o.refine) {
        const a = yt(s, h, o, r, g);
        A = a.refinedToMacro, b = a.partition;
      }
      I.push({ graph: s, partition: b });
      const T = b.nodeCommunity;
      for (let a = 0; a < e.length; a++)
        e[a] = T[e[a]];
      const d = Ct(s, b);
      s = K(d, { directed: o.directed, ...n }), y = A;
    }
    const C = I[I.length - 1];
    return {
      graph: C.graph,
      partition: C.partition,
      levels: I,
      originalToCurrent: e,
      originalNodeIds: i.nodeIds
    };
  }
  function ht(t, n, o, u, r) {
    const i = t.n, f = Math.max(i, 1), c = new Int32Array(f), e = new Uint8Array(i), s = new Int32Array(i);
    for (let g = 0; g < i; g++) s[g] = g;
    nt(s, u);
    let y = 0, I = 0, C = 0;
    for (let g = 0; g < i; g++)
      c[I] = s[g], I = (I + 1) % f, C++, e[s[g]] = 1;
    const w = o.allowNewCommunity, h = o.candidateStrategyCode;
    for (; C > 0; ) {
      const g = c[y];
      if (y = (y + 1) % f, C--, e[g] = 0, r && r[g]) continue;
      const b = n.accumulateNeighborCommunityEdgeWeights(g);
      let A = n.nodeCommunity[g], T = 0;
      if (h === 1)
        for (let d = 0; d < n.communityCount; d++) {
          if (d === n.nodeCommunity[g] || !X(n, t, g, d, o.maxCommunitySize)) continue;
          const a = H(n, g, d, o);
          a > T && (T = a, A = d);
        }
      else if (h === 2) {
        const d = Math.min(10, Math.max(1, n.communityCount));
        for (let a = 0; a < d; a++) {
          const x = u() * n.communityCount | 0;
          if (x === n.nodeCommunity[g] || !X(n, t, g, x, o.maxCommunitySize)) continue;
          const S = H(n, g, x, o);
          S > T && (T = S, A = x);
        }
      } else if (h === 3) {
        const d = Math.min(10, Math.max(1, b));
        for (let a = 0; a < d; a++) {
          const x = n.getCandidateCommunityAt(u() * b | 0);
          if (x === n.nodeCommunity[g] || !X(n, t, g, x, o.maxCommunitySize)) continue;
          const S = H(n, g, x, o);
          S > T && (T = S, A = x);
        }
      } else
        for (let d = 0; d < b; d++) {
          const a = n.getCandidateCommunityAt(d);
          if (!X(n, t, g, a, o.maxCommunitySize)) continue;
          const x = H(n, g, a, o);
          x > T && (T = x, A = a);
        }
      if (w) {
        const d = n.communityCount;
        if (X(n, t, g, d, o.maxCommunitySize)) {
          const a = H(n, g, d, o);
          a > T && (T = a, A = d);
        }
      }
      if (A !== n.nodeCommunity[g] && T > at) {
        n.moveNodeToCommunity(g, A);
        const d = t.outEdges[g];
        for (let a = 0; a < d.length; a++) {
          const x = d[a].to;
          x !== g && n.nodeCommunity[x] !== A && (e[x] || (c[I] = x, I = (I + 1) % f, C++, e[x] = 1));
        }
      }
    }
  }
  function X(t, n, o, u, r) {
    return Number.isFinite(r) ? t.getCommunityTotalSize(u) + n.size[o] <= r : true;
  }
  function yt(t, n, o, u, r) {
    const i = tt(t);
    i.graph = t, i.initializeAggregates();
    const f = n.nodeCommunity, c = [];
    for (let h = 0; h < t.n; h++) {
      const g = f[h];
      c[g] || (c[g] = []), c[g].push(h);
    }
    const e = new Uint8Array(t.n), s = new Float64Array(t.n), y = new Float64Array(t.n), I = new Float64Array(t.n);
    for (let h = 0; h < c.length; h++) {
      const g = c[h];
      !g || g.length <= 1 || wt(t, i, g, o, u, r, e, s, y, I);
    }
    const C = new Int32Array(i.communityCount).fill(-1);
    for (let h = 0; h < t.n; h++) {
      const g = i.nodeCommunity[h];
      C[g] === -1 && (C[g] = f[h]);
    }
    ot(i, o.preserveLabels);
    const w = new Int32Array(i.communityCount).fill(-1);
    for (let h = 0; h < t.n; h++) {
      const g = i.nodeCommunity[h];
      w[g] === -1 && (w[g] = f[h]);
    }
    return { partition: i, refinedToMacro: w };
  }
  function wt(t, n, o, u, r, i, f, c, e, s) {
    const y = u.resolution, I = u.theta;
    let C, w;
    u.quality === "cpm" ? (C = (d) => t.size[d], w = y) : t.directed ? (C = (d) => t.strengthOut[d] + t.strengthIn[d], w = y / (2 * t.totalWeight)) : (C = (d) => t.strengthOut[d], w = y / t.totalWeight);
    let h = 0;
    for (let d = 0; d < o.length; d++) {
      const a = o[d];
      f[a] = 1, h += C(a);
    }
    for (let d = 0; d < o.length; d++) {
      const a = o[d];
      let x = 0;
      const S = t.outEdges[a];
      for (let k = 0; k < S.length; k++) {
        const P = S[k].to;
        f[P] && (x += S[k].w);
      }
      c[a] = x;
    }
    for (let d = 0; d < o.length; d++) {
      const a = o[d];
      e[a] = C(a), s[a] = c[a];
    }
    const g = [];
    for (let d = 0; d < o.length; d++) {
      const a = o[d], x = C(a);
      c[a] >= w * x * (h - x) && g.push(a);
    }
    nt(g, r);
    const b = [], A = [], T = [];
    for (let d = 0; d < g.length; d++) {
      const a = g[d];
      if (i && i[a]) continue;
      const x = n.nodeCommunity[a];
      if (n.communityNodeCount[x] !== 1) continue;
      const S = n.accumulateNeighborCommunityEdgeWeights(a);
      b.length = 0, A.length = 0, T.length = 0;
      let k = 0;
      for (let q = 0; q < S; q++) {
        const G = n.getCandidateCommunityAt(q);
        if (G === x || !f[G]) continue;
        const m = e[G];
        if (s[G] < w * m * (h - m)) continue;
        const l = H(n, a, G, u);
        l < 0 || (b.push(G), A.push(l), l > k && (k = l));
      }
      if (b.length === 0) continue;
      let P = 0;
      for (let q = 0; q < b.length; q++) {
        const G = Math.exp((A[q] - k) / I);
        T.push(G), P += G;
      }
      let F = r() * P, U = b[b.length - 1];
      for (let q = 0; q < b.length; q++)
        if (F -= T[q], F <= 0) {
          U = b[q];
          break;
        }
      const p = n.getNeighborEdgeWeightToCommunity(U);
      s[U] = s[U] + c[a] - 2 * p, e[U] += C(a), s[x] = 0, e[x] = 0, n.moveNodeToCommunity(a, U);
    }
    for (let d = 0; d < o.length; d++) {
      const a = o[d];
      f[a] = 0, c[a] = 0, e[a] = 0, s[a] = 0;
    }
  }
  function Ct(t, n) {
    const o = ngraph_default();
    for (let i = 0; i < n.communityCount; i++)
      o.addNode(i, { size: n.communityTotalSize[i] });
    const u = n.communityCount, r = /* @__PURE__ */ new Map();
    if (t.directed) {
      for (let i = 0; i < t.n; i++) {
        const f = n.nodeCommunity[i], c = t.outEdges[i];
        for (let e = 0; e < c.length; e++) {
          const s = n.nodeCommunity[c[e].to], y = f * u + s;
          r.set(y, (r.get(y) || 0) + c[e].w);
        }
      }
      for (let i = 0; i < t.n; i++) {
        if (!t.selfLoop[i]) continue;
        const f = n.nodeCommunity[i], c = f * u + f;
        r.set(c, (r.get(c) || 0) + t.selfLoop[i]);
      }
    } else {
      for (let i = 0; i < t.n; i++) {
        const f = n.nodeCommunity[i], c = t.outEdges[i];
        for (let e = 0; e < c.length; e++) {
          const s = c[e].to;
          if (s <= i) continue;
          const y = n.nodeCommunity[s], I = f * u + y;
          r.set(I, (r.get(I) || 0) + c[e].w);
        }
      }
      for (let i = 0; i < t.n; i++) {
        if (!t.selfLoop[i]) continue;
        const f = n.nodeCommunity[i], c = f * u + f;
        r.set(c, (r.get(c) || 0) + t.selfLoop[i]);
      }
    }
    for (const [i, f] of r.entries()) {
      const c = i / u | 0, e = i - c * u;
      o.addLink(c, e, { weight: f });
    }
    return o;
  }
  function H(t, n, o, u) {
    const r = t.graph;
    return u.quality === "cpm" ? ft(t, r, n, o, u.resolution) : u.directed ? et(t, r, n, o) : lt(t, r, n, o);
  }
  function nt(t, n = Math.random) {
    for (let o = t.length - 1; o > 0; o--) {
      const u = Math.floor(n() * (o + 1)), r = t[o];
      t[o] = t[u], t[u] = r;
    }
    return t;
  }
  function At(t) {
    const n = t.candidateStrategy;
    if (typeof n != "string") return 0;
    switch (n) {
      case "neighbors":
        return 0;
      case "all":
        return 1;
      case "random":
        return 2;
      case "random-neighbor":
        return 3;
      default:
        return 0;
    }
  }
  function It(t = {}) {
    const n = !!t.directed, o = Number.isFinite(t.randomSeed) ? t.randomSeed : 42, u = Number.isFinite(t.maxLevels) ? t.maxLevels : dt, r = !!t.allowNewCommunity, i = At(t), f = (t.quality || "modularity").toLowerCase(), c = typeof t.resolution == "number" ? t.resolution : 1, e = t.refine !== false, s = t.preserveLabels, y = Number.isFinite(t.maxCommunitySize) ? t.maxCommunitySize : 1 / 0, I = Number.isFinite(t.theta) ? t.theta : mt;
    return {
      directed: n,
      randomSeed: o,
      maxLevels: u,
      allowNewCommunity: r,
      candidateStrategyCode: i,
      quality: f,
      resolution: c,
      refine: e,
      preserveLabels: s,
      maxCommunitySize: y,
      theta: I,
      fixedNodes: t.fixedNodes
    };
  }
  function ot(t, n) {
    n && n instanceof Map ? t.compactCommunityIds({ preserveMap: n }) : n === true ? t.compactCommunityIds({ keepOldOrder: true }) : t.compactCommunityIds();
  }
  function Tt(t, n = {}) {
    if (!Array.isArray(t) || t.length === 0) throw new Error("layers must be a non-empty array");
    n.directed;
    const o = t[0].graph, u = [], r = /* @__PURE__ */ new Set();
    o.forEachNode((e) => {
      u.push(e.id), r.add(e.id);
    });
    for (let e = 1; e < t.length; e++)
      t[e].graph.forEachNode((y) => {
        if (!r.has(y.id)) throw new Error("All layers must share identical node ids. Missing in base: " + y.id);
      });
    const i = ngraph_default(), f = t[0].nodeSize || ((e) => e.data && typeof e.data.size == "number" ? e.data.size : 1);
    for (let e = 0; e < u.length; e++) {
      const s = u[e], y = o.getNode ? o.getNode(s) : null, I = y ? f(y) : 1;
      i.addNode(s, { size: I });
    }
    const c = /* @__PURE__ */ new Map();
    for (let e = 0; e < t.length; e++) {
      const { graph: s, weight: y = 1, linkWeight: I } = t[e], C = I || ((w) => w.data && typeof w.data.weight == "number" ? w.data.weight : 1);
      s.forEachLink((w) => {
        const h = w.fromId, g = w.toId;
        if (!r.has(h) || !r.has(g)) return;
        const b = y * C(w);
        if (b === 0) return;
        const A = h + "\0" + g;
        c.set(A, (c.get(A) || 0) + b);
      });
    }
    for (const [e, s] of c.entries()) {
      const y = e.indexOf("\0"), I = e.substring(0, y), C = e.substring(y + 1);
      i.addLink(I, C, { weight: s });
    }
    return i;
  }
  function Nt(t, n, o = {}) {
    const u = !!o.directed, r = K(t, { directed: u }), i = (s) => n instanceof Map ? n.get(s) : n?.[s], f = /* @__PURE__ */ new Map();
    function c(s) {
      let y = f.get(s);
      return y || (y = u ? { strengthOut: 0, strengthIn: 0, internal: 0, nodeCount: 0, size: 0 } : { strength: 0, internal: 0, nodeCount: 0, size: 0 }, f.set(s, y)), y;
    }
    for (let s = 0; s < r.n; s++) {
      const y = r.nodeIds[s], I = i(y);
      if (I == null) {
        if (o.requireMembership) throw new Error("Missing membership for node: " + y);
        continue;
      }
      const C = c(I);
      u ? (C.strengthOut += r.strengthOut[s], C.strengthIn += r.strengthIn[s]) : C.strength += r.strengthOut[s], C.nodeCount += 1, C.size += r.size[s] || 0, r.selfLoop[s] && (C.internal += r.selfLoop[s]);
    }
    if (u)
      for (let s = 0; s < r.n; s++) {
        const y = i(r.nodeIds[s]);
        if (y == null) continue;
        const I = f.get(y), C = r.outEdges[s];
        for (let w = 0; w < C.length; w++) {
          const { to: h, w: g } = C[w], b = i(r.nodeIds[h]);
          y === b && (I.internal += g);
        }
      }
    else
      for (let s = 0; s < r.n; s++) {
        const y = i(r.nodeIds[s]);
        if (y == null) continue;
        const I = f.get(y), C = r.outEdges[s];
        for (let w = 0; w < C.length; w++) {
          const { to: h, w: g } = C[w], b = i(r.nodeIds[h]);
          y === b && (I.internal += g / 2);
        }
      }
    return (o.quality || "modularity").toLowerCase() === "cpm" ? Et(f, r, o) : xt(f, r, u);
  }
  function xt(t, n, o) {
    if (o) {
      const u = n.totalWeight || 1;
      let r = 0;
      for (const i of t.values())
        r += i.internal / u - i.strengthOut * i.strengthIn / (u * u);
      return r;
    } else {
      const u = n.totalWeight || 1;
      let r = 0;
      for (const i of t.values()) {
        const f = i.strength;
        r += 2 * i.internal / u - f * f / (u * u);
      }
      return r;
    }
  }
  function Et(t, n, o) {
    const u = typeof o.resolution == "number" ? o.resolution : 1, r = (o.cpmMode || "unit") === "size-aware";
    let i = 0;
    for (const f of t.values())
      if (r) {
        const c = f.size || 0;
        i += f.internal - u * (c * (c - 1)) / 2;
      } else {
        const c = f.nodeCount;
        i += f.internal - u * (c * (c - 1)) / 2;
      }
    return i;
  }
  function bt(t, n = {}) {
    let o = t;
    Array.isArray(t) && (o = Tt(t, { directed: !!n.directed }));
    const { levels: u, originalToCurrent: r, originalNodeIds: i } = gt(o, n), f = /* @__PURE__ */ new Map();
    for (let c = 0; c < i.length; c++)
      f.set(i[c], r[c]);
    return {
      getClass(c) {
        return f.get(c);
      },
      getCommunities() {
        const c = /* @__PURE__ */ new Map();
        for (const [e, s] of f)
          c.has(s) || c.set(s, []), c.get(s).push(e);
        return c;
      },
      quality() {
        const c = {};
        for (const [e, s] of f) c[e] = s;
        return Nt(o, c, n);
      },
      toJSON() {
        const c = {};
        for (const [e, s] of f) c[e] = s;
        return { membership: c, meta: { levels: u.length, quality: this.quality(), options: n } };
      }
    };
  }

  // scripts/hypergraph-network.mjs
  var HYPERGRAPH_MODEL_VERSION = "incidence-v1";
  function incidenceNetwork(graph) {
    if (!Array.isArray(graph.hyperedges)) throw new Error("Hypergraph evidence must be reconstructed before clustering.");
    const universe = new Set(graph.nodes.map((node) => node.id)), edges = [];
    let occurrences = 0;
    for (const edge of graph.hyperedges) {
      if (!Number.isFinite(edge.weight) || edge.weight < 0) throw new Error("Invalid hyperedge weight");
      const members = [...new Set(edge.members)].sort();
      if (members.some((id) => !universe.has(id))) throw new Error("Unknown hypergraph member");
      if (members.length < 2 || !edge.weight) continue;
      occurrences += members.length;
      if (occurrences > 2e5 || edges.length >= 2e4) throw new Error("Hypergraph incidence exceeds safe limits. Narrow the scope; no truncated network was used.");
      edges.push({ ...edge, members });
    }
    const articleIds = [...new Set(edges.flatMap((edge) => edge.members))].sort(), positions = new Map(articleIds.map((id, position) => [id, position]));
    const links = edges.flatMap((edge, position) => edge.members.map((id) => ({ source: positions.get(id), target: articleIds.length + position, strength: edge.weight })));
    const scale = links.reduce((sum, edge) => sum + edge.strength, 0) / Math.max(1, links.length);
    return { articleIds, groups: edges, links, scale, density: articleIds.length && edges.length ? links.length / (articleIds.length * edges.length) : 0, modelVersion: HYPERGRAPH_MODEL_VERSION };
  }
  function isIncidenceModel(graph) {
    return graph.networkModel === "hypergraph" && graph.clustering?.algorithm !== "hypergraph" && graph.clustering?.modelVersion === HYPERGRAPH_MODEL_VERSION;
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
  function analysisNetwork(graph) {
    if (graph.networkModel !== "hypergraph" || graph.clustering?.algorithm === "hypergraph") return graph;
    if (!graph.hyperedges) throw new Error("Hypergraph evidence must be reconstructed before clustering.");
    if (isIncidenceModel(graph)) {
      const incidence = incidenceNetwork(graph);
      return { ...graph, links: incidence.links.map((edge) => ({ ...edge, source: edge.source < incidence.articleIds.length ? incidence.articleIds[edge.source] : JSON.stringify(["group", edge.source]), target: JSON.stringify(["group", edge.target]) })) };
    }
    return { ...graph, links: hypergraphProjection(graph.hyperedges) };
  }

  // scripts/auto-cpm.mjs
  function partition(graph, resolution, restarts = 10, initialSeed = 42) {
    if (isIncidenceModel(graph)) throw new Error("Bipartite CPM must use the incidence Leiden engine; pair projection is not a fallback.");
    graph = analysisNetwork(graph);
    const network = ngraph_default(), connected = new Set(graph.links.flatMap((edge) => [edge.source, edge.target]));
    for (const node of graph.nodes) if (connected.has(node.id)) network.addNode(node.id);
    const scale = graph.links.reduce((sum, edge) => sum + edge.strength, 0) / Math.max(1, graph.links.length);
    for (const edge of graph.links) network.addLink(edge.source, edge.target, { weight: edge.strength / scale });
    if (!graph.links.length) return { memberships: {}, clusters: 0, singletonFraction: 1, scale: 0 };
    let best;
    for (let seed = initialSeed; seed < initialSeed + restarts; seed++) {
      const result = bt(network, { quality: "cpm", resolution, randomSeed: seed, linkWeight: (link) => link.data.weight }), quality = result.quality();
      if (!best || quality > best.quality) best = { result, quality, seed };
    }
    const groups = [...best.result.getCommunities().values()].sort((left, right) => right.length - left.length);
    return { memberships: Object.fromEntries(groups.flatMap((members, position) => members.map((id) => [id, position + 1]))), clusters: groups.length, singletonFraction: groups.filter((group) => group.length === 1).length / connected.size, scale, quality: best.quality, seed: best.seed };
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
  function applyCommunityResult(graph, result, hyperedges = null) {
    const baseline = Object.fromEntries(graph.nodes.filter((node) => node.cluster > 0).map((node) => [node.id, node.cluster]));
    const shared = Object.keys(baseline).filter((id) => result.memberships[id]);
    const comparison = { baseline: "Leiden CPM", baselineResolution: graph.resolution, baselineClusters: new Set(Object.values(baseline)).size, sharedNodes: shared.length, baselineLinkedNodes: Object.keys(baseline).length, methodLinkedNodes: Object.keys(result.memberships).length, adjustedRandIndex: shared.length > 1 ? agreement(baseline, result.memberships) : null, note: "Agreement on shared linked nodes only; cluster numbers and colors do not correspond across methods. Agreement is not thematic validation. Quality scores have different definitions and cannot be compared across methods." };
    for (const node of graph.nodes) node.cluster = result.memberships[node.id] || 0;
    const communities = new Set(Object.values(result.memberships)).size;
    const resolution = result.algorithm === "leiden" ? result.resolution : null;
    return invalidateScientificOutputs({ ...graph, reliability: null, settingsSearch: null, appliedSettings: null, analysisId: null, derivedFromAnalysisId: graph.analysisId || graph.derivedFromAnalysisId, resolution, autoCPM: null, clustering: { ...result, memberships: void 0, communities, clusters: communities, resolution }, comparison, hyperedges, stats: { ...graph.stats, clusters: communities, isolated_nodes: graph.nodes.filter((node) => !node.cluster).length } });
  }

  // scripts/role-sensitivity.mjs
  function roleSensitivity(graph, options = {}, progress = () => {
  }) {
    const samples = options.samples ?? 10;
    if (![10, 50].includes(samples)) throw new Error("Choose 10 or 50 role resamples.");
    const evidence = incidenceEvidence(graph), ids = evidence.rows.map((row) => row.id), ranks = Object.fromEntries(evidence.ids.map((id) => [id, { topTen: 0, meanPercentile: 0 }]));
    const minimumSupport = graph.minimumShared || graph.minimumSupport || 1, normalization = graph.construction?.normalization || (evidence.coupling ? "cosine" : "association"), counting = graph.construction?.counting || "full";
    const compared = ["raw", "cosine", "jaccard", "association"].includes(normalization) ? normalization : null;
    if (!compared) throw new Error("The original normalization is not reproducible for role resampling.");
    for (let sample = 0; sample < samples; sample++) {
      progress("Role sensitivity " + (sample + 1) + "/" + samples);
      const weights = bootstrapWeights(ids, sample + 4e3), projection = projectIncidence(evidence, { normalization: compared, counting, minimumSupport, rowWeights: weights });
      if (evidence.coupling) projection.links = projection.links.filter((edge) => edge.strength >= (graph.minimumCosine || 0));
      const roles = analyzeRoles({ ...graph, links: projection.links }).roles;
      const ordered = graph.nodes.map((node) => ({ id: node.id, score: roles[node.id].externalStrength })).sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
      for (const item of ordered) {
        const greater = ordered.filter((other) => other.score > item.score).length, equal = ordered.filter((other) => other.score === item.score).length, midrank = greater + (equal + 1) / 2;
        const topFraction = item.score > 0 ? Math.max(0, Math.min(equal, 10 - greater)) / equal : 0;
        ranks[item.id].topTen += topFraction / samples;
        ranks[item.id].meanPercentile += (ordered.length > 1 ? 1 - (midrank - 1) / (ordered.length - 1) : 1) / samples;
      }
    }
    return { version: "role-sensitivity-v1", samples, preliminary: samples < 50, metric: "External connection weight with original memberships held fixed", normalization: compared, counting, minimumSupport, minimumCosine: evidence.coupling ? graph.minimumCosine || 0 : null, rawSupport: evidence.coupling ? "Distinct shared references present at least once; multiplicity affects weight only." : "Distinct citing source articles present at least once; multiplicity affects weight only.", ranks, limitation: "Conditional structural rank sensitivity, not confidence or substantive bridge validation. Source/reference incidence events are resampled; pair evidence and thresholds, including the coupling cosine minimum, are rebuilt, but communities are held fixed. Raw support counts distinct retained event IDs, never fractional weight or bootstrap multiplicity. Ties share top-ten credit; all-zero scores receive none. PageRank and whole-hyperedge roles are not assessed." };
  }

  // scripts/science-worker.mjs
  self.onmessage = async (event) => {
    const { kind, graph, records, options = {} } = event.data;
    try {
      const result = kind === "roles" ? analyzeRoles(graph, options) : kind === "roleSensitivity" ? roleSensitivity(graph, options, (progress) => self.postMessage({ progress })) : kind === "manifest" ? await createScientificManifest(graph, records, options) : kind === "construction" ? constructionCandidates(graph) : kind === "null" ? incidenceNull(graph, options, (progress) => self.postMessage({ progress })) : kind === "fit" && options.algorithm === "leiden" ? applyCommunityResult(graph, { ...partition(graph, graph.resolution, options.trials || 2, options.seed || 42), algorithm: "leiden" }) : null;
      if (!result) throw new Error("Unknown scientific audit.");
      self.postMessage({ result });
    } catch (error) {
      self.postMessage({ error: analysisErrorMessage(error) });
    }
  };
})();

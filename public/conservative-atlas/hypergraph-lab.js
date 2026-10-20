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

  // scripts/hypergraph-trials.mjs
  var TRIAL_METHODS = {
    spectral: { name: "Spectral \xB7 normalized cut", score: "Zhou normalized-cut relaxation", search: "Symmetric eigendecomposition + k-means", help: "Embed articles using the weighted incidence Laplacian, then group the embedding. Eigenvector accuracy is checked explicitly. This is a matrix method, not a tensor method.", reference: "https://papers.neurips.cc/paper/3128-learning-with-hypergraphs-clustering-classification-and-embedding.pdf" },
    aon: { name: "Degree-adjusted AON \xB7 approximation", score: "Assortative AON weighted profile objective", search: "Seeded vertex coordinate ascent", help: "Estimate within/outside rates for each combination size, with fixed degree-derived propensities. Fractional evidence weights make this a quasi-likelihood trial, NOT a full jointly fitted DCHSBM or an MDL-selected hierarchy.", reference: "https://arxiv.org/abs/2101.09611" },
    balanced: { name: "Balanced hyperedge cut", score: "Weighted cut-net cost with size bounds", search: "Balanced initialization + vertex/swap refinement", help: "Request k roughly balanced groups while cutting as little whole-combination weight as possible. This custom bounded heuristic is not hMETIS, KaHyPar or their multilevel algorithms. Equal-size constraints can split natural communities.", reference: "https://kahypar.org/" },
    local: { name: "Local \xB7 explore around an article", score: "Whole-hyperedge conductance", search: "Incidence PageRank + seed-containing sweep", help: "Return one neighborhood around a seed. The random walk includes self-returns; the sweep evaluates whole cut hyperedges. This is a custom diffusion/sweep trial, not the published flow solver.", reference: "https://www.cs.cornell.edu/~arb/papers/hypergraph-ratio-cut-KDD-2020.pdf" },
    categorical: { name: "Categorical \xB7 source-period demo", score: "Weight of category-consistent whole hyperedges", search: "Seeded categorical label moves", help: "Label each combination by the most common publication decade among its supporting sources, then seek agreement with those labels. These are constructed period categories, NOT semantic themes. This is a heuristic, not the paper\u2019s approximation algorithm or a tensor decomposition.", reference: "https://www.cs.cornell.edu/~arb/papers/cat-edge-clus-WWW-2020.pdf" }
  };

  // scripts/trial-canvas-core.mjs
  function trialCanvasGraph(source, result, edges) {
    if (!result?.definition || !Array.isArray(edges)) throw new Error("A completed trial and its exact combinations are required.");
    const ids = new Set(source.nodes.map((node) => node.id));
    for (const [id, cluster] of Object.entries(result.memberships)) {
      if (!ids.has(id) || !Number.isInteger(cluster) || cluster < 1) throw new Error("Invalid trial membership.");
    }
    const linked = new Set(edges.flatMap((edge) => edge.members));
    if ([...linked].some((id) => !ids.has(id))) throw new Error("Unknown combination member.");
    if (!result.localOnly && [...linked].some((id) => !result.memberships[id])) throw new Error("Missing trial membership.");
    const next = structuredClone(source);
    next.nodes = next.nodes.map((node) => ({ ...node, cluster: result.memberships[node.id] || 0 }));
    const positions = /* @__PURE__ */ new Map();
    for (const node of next.nodes) {
      const position = positions.get(node.cluster) || 0, angle = position * 2.399963229728653;
      node.x = Math.cos(angle) * Math.sqrt(position) * 14;
      node.y = Math.sin(angle) * Math.sqrt(position) * 14;
      positions.set(node.cluster, position + 1);
    }
    next.networkModel = "hypergraph";
    next.hyperedges = structuredClone(edges);
    const { canvasEdges, audit: audit2, memberships, ...diagnostics2 } = result;
    next.trial = { result: structuredClone({ ...diagnostics2, memberships }) };
    next.clustering = { algorithm: "trial", trialFamily: result.family, trialVersion: result.version, trialSettings: structuredClone(result.settings), diagnostics: structuredClone(diagnostics2), method: result.definition.name, limitations: result.limitations };
    for (const key of ["reliability", "reliabilityState", "sourceReliability", "settingsSearch", "evidenceSensitivity", "autoCPM", "comparison", "themeDescriptions", "generatedDescriptions", "themeError", "analysisId", "extensionFilter", "extensionResults", "temporal", "drillConfig"]) delete next[key];
    next.resolution = null;
    next.appliedSettings = { settings: { label: result.definition.name + (["spectral", "aon", "balanced"].includes(result.family) ? " \xB7 k=" + result.settings.k : "") } };
    next.stats = { ...next.stats, nodes: next.nodes.length, clusters: result.clusters, isolated_nodes: next.nodes.filter((node) => !node.cluster).length };
    next.reliability = result.audit || null;
    return invalidateScientificOutputs(next);
  }

  // scripts/trial-canvas.mjs
  var byId = (id) => document.getElementById(id);
  var data = window.ATLAS_DATA;
  var element = (tag, text = "") => {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
  };
  var canvas = window.atlasSharedCanvas;
  var shell = window.atlasWorkspaceShell;
  var worker;
  var ticket = 0;
  var current;
  var pinned;
  var history = [];
  var controls = element("section");
  controls.id = "trialControls";
  controls.className = "trial-controls";
  var fields = element("div");
  fields.className = "trial-fields";
  function selectField(id, title, values) {
    const label = element("label", title), select = element("select");
    select.id = id;
    for (const [value, caption] of values) select.append(new Option(caption, value));
    label.append(select);
    fields.append(label);
    return select;
  }
  function numberField(id, title, value, minimum, maximum, step = 1) {
    const label = element("label", title), input = element("input");
    input.id = id;
    input.type = "number";
    input.value = value;
    input.min = minimum;
    input.max = maximum;
    input.step = step;
    label.append(input);
    fields.append(label);
    return input;
  }
  var scope = selectField("trialScope", "Reference scope", [10, 20, 30].map((value) => [value, "Cited by \u2265" + value + " sources"]));
  var orders = selectField("trialOrders", "Combination orders", [["all", "Combined 2\u201310"], [3, "3-way"], [4, "4-way"]]);
  var groups = numberField("trialGroups", "Requested groups (k)", 24, 2, 60);
  var imbalance = numberField("trialImbalance", "Size tolerance", 0.15, 0, 1, 0.05);
  var restart = numberField("trialRestart", "Return to seed probability", 0.15, 0.01, 0.95, 0.01);
  var seed = selectField("trialSeed", "Seed article", []);
  var choice = element("label", "Hypergraph trial");
  var family = element("select");
  family.id = "trialFamily";
  for (const [value, definition] of Object.entries(TRIAL_METHODS)) family.append(new Option(definition.name, value));
  choice.append(family);
  choice.className = "trial-method";
  byId("workspaceControls").prepend(choice);
  var representation = byId("hypergraphRepresentation");
  var representationField = representation.parentElement;
  representationField.firstChild.textContent = "Canvas";
  representationField.classList.add("trial-representation");
  representation.querySelector('option[value="network"]').textContent = "Pair connections";
  representation.title = "Envelopes show whole combinations of 3+ articles (up to 60 strongest eligible). Pair connections are citation context, not the hypergraph clustering score. Filter a cluster to inspect its combinations, or choose 3D to explode the clusters.";
  choice.after(representationField);
  var methodOption = new Option("Experimental trial", "trial");
  methodOption.hidden = true;
  byId("clusteringMethod").append(methodOption);
  var summary = canvas.summary;
  canvas.summary = () => {
    const value = summary(), graph = canvas.graph();
    return graph?.trial ? { ...value, algorithm: "trial", trialLabel: graph.trial.result.definition.name } : value;
  };
  var description = element("p");
  var actions = element("div");
  actions.className = "trial-actions";
  function button(title, handler) {
    const node = element("button", title);
    node.type = "button";
    node.onclick = handler;
    actions.append(node);
    return node;
  }
  var runButton = button("Run trial", () => run());
  var continueButton = button("Continue refinement", () => run(true));
  var cancelButton = button("Cancel", stop);
  var status = element("p", "Preparing trial\u2026");
  status.id = "trialStatus";
  status.setAttribute("role", "status");
  var diagnostics = element("details");
  var audit = element("pre");
  diagnostics.append(element("summary", "Method & diagnostics"), audit);
  var historyPanel = element("details");
  historyPanel.append(element("summary", "This session\u2019s trials"));
  controls.append(element("h3", "Trial settings"), fields, description, actions, diagnostics, historyPanel);
  byId("analysisPanel").querySelector(".shell-panel-body").prepend(controls);
  var chip = element("div");
  chip.className = "trial-status-chip";
  chip.append(status);
  var returnLink = element("a", "Main workspace \u2197");
  returnLink.href = "index.html";
  returnLink.className = "trial-return";
  chip.append(returnLink);
  byId("workspaceControls").after(chip);
  byId("workspace-map").textContent = "Hypergraph trials";
  byId("workspace-coupling").hidden = true;
  document.querySelector(".workspace-tabs").setAttribute("aria-label", "Experimental co-citation workspace");
  var originalReset = byId("reset").onclick;
  byId("reset").onclick = () => {
    if (current) install(current, pinned, false);
    else originalReset();
  };
  function graphForForm() {
    const graph = window.resolveAtlasGraph("cocitation_s" + scope.value + "_" + (orders.value === "all" ? "all" : "n" + orders.value) + "_cpm0_02", "auto", 10);
    return structuredClone({ ...graph, networkModel: "hypergraph", maximumOrder: Math.min(10, graph.maximumOrder || 10) });
  }
  function seedOptions() {
    const previous = seed.value;
    seed.replaceChildren(...graphForForm().nodes.slice().sort((left, right) => right.citations - left.citations).map((node) => new Option(node.label + " \u2014 " + (node.title || node.id), node.id)));
    if ([...seed.options].some((option) => option.value === previous)) seed.value = previous;
  }
  function settings() {
    for (const input of [groups, imbalance, restart]) if (!input.checkValidity()) {
      input.reportValidity();
      throw new Error("Check the trial settings.");
    }
    return { family: family.value, k: +groups.value, seed: 42, starts: 3, imbalance: +imbalance.value, restart: +restart.value, seedId: seed.value };
  }
  function explain(changed = true) {
    const definition = TRIAL_METHODS[family.value];
    description.textContent = definition.help;
    groups.parentElement.hidden = ["local", "categorical"].includes(family.value);
    imbalance.parentElement.hidden = family.value !== "balanced";
    restart.parentElement.hidden = seed.parentElement.hidden = family.value !== "local";
    continueButton.hidden = !current || current.family !== "balanced" || current.converged;
    if (changed && current) status.textContent = "Settings changed \xB7 previous completed map shown. Run trial to apply.";
    shell.refresh();
  }
  function busy(value) {
    for (const control of [family, ...fields.querySelectorAll("input,select"), runButton, continueButton]) control.disabled = value;
    cancelButton.hidden = !value;
    continueButton.hidden = !current || current.family !== "balanced" || current.converged;
  }
  function stop() {
    ticket++;
    worker?.terminate();
    worker = null;
    busy(false);
    status.textContent = "Stopped \xB7 previous completed map retained.";
  }
  function install(result, source, remember = true, edges = result.canvasEdges) {
    const next = trialCanvasGraph(source.graph, result, edges);
    if (!current) representation.value = "envelopes";
    next.bundles = source.bundles;
    byId("clusteringMethod").value = "trial";
    byId("networkModel").value = "hypergraph";
    byId("orderMode").value = source.order === "all" ? "combined" : "single";
    byId("orderSlider").value = source.order === "all" ? 2 : source.order;
    byId("coCitationOrder").value = source.order;
    byId("threshold").value = "cocitation_s" + source.scope + "_" + (source.order === "all" ? "all" : "n" + source.order) + "_cpm0_02";
    current = result;
    pinned = source;
    document.body.classList.add("trial-ready");
    canvas.applySettings(next);
    canvas.reloadThemes();
    byId("methodTitle").textContent = result.definition.name;
    byId("analysisNote").textContent = result.definition.score + " \xB7 " + result.definition.search;
    const { memberships, canvasEdges, ...metadata } = result;
    audit.textContent = JSON.stringify(metadata, null, 2);
    status.textContent = "Completed \xB7 " + result.clusters + " groups \xB7 " + (result.localOnly ? "outside-neighborhood articles remain unassigned \xB7 " : "") + (result.converged ? "solver finished" : "provisional; inspect diagnostics") + " \xB7 session only";
    if (remember) {
      history.push({ result, source });
      renderHistory();
    }
    explain(false);
    shell.refresh();
  }
  function renderHistory() {
    historyPanel.querySelectorAll("button,p").forEach((node) => node.remove());
    historyPanel.append(element("p", "Session only. Export data to retain evidence and trial settings."));
    for (const entry of history) {
      const node = element("button", entry.result.definition.name + " \xB7 " + entry.result.clusters + " groups");
      node.type = "button";
      node.onclick = () => {
        stop();
        family.value = entry.result.family;
        scope.value = entry.source.scope;
        orders.value = entry.source.order;
        groups.value = entry.result.settings.k;
        imbalance.value = entry.result.settings.imbalance;
        restart.value = entry.result.settings.restart;
        seedOptions();
        seed.value = entry.result.settings.seedId;
        install(entry.result, entry.source, false);
      };
      historyPanel.append(node);
    }
  }
  function run(continuing = false) {
    if (window.BIBLIOMAP_MULTIUSER) {
      status.textContent = "These public-snapshot trials are not connected to institutional projects.";
      return;
    }
    let options, source;
    try {
      options = continuing ? { ...current.settings, starts: 1, balancedMaxPasses: Math.min(512, current.settings.balancedMaxPasses * 2), resumeMemberships: current.memberships } : settings();
      source = continuing ? pinned : { graph: graphForForm(), bundles: data.bundlesByScope[scope.value], scope: scope.value, order: orders.value };
    } catch (error) {
      status.textContent = analysisErrorMessage(error);
      return;
    }
    worker?.terminate();
    window.ATLAS_EVIDENCE.cancelCanvasReliability();
    const request = ++ticket;
    worker = new Worker("hypergraph-trials-worker.js?v=coupling-errors-2");
    busy(true);
    status.textContent = "Running trial \xB7 previous completed map retained";
    worker.onerror = (event) => {
      if (ticket !== request) return;
      worker.terminate();
      worker = null;
      busy(false);
      status.textContent = "Trial failed: " + analysisErrorMessage(event);
    };
    worker.onmessage = (event) => {
      if (ticket !== request) return;
      const message = event.data;
      if (message.progress) {
        status.textContent = message.progress + " \xB7 previous completed map retained";
        return;
      }
      worker.terminate();
      worker = null;
      busy(false);
      if (Object.hasOwn(message, "error")) {
        status.textContent = "Trial failed: " + analysisErrorMessage(message.error);
        return;
      }
      const result = { ...message.result, coverage: message.coverage, canvasEdges: message.edges, createdAt: (/* @__PURE__ */ new Date()).toISOString() };
      try {
        install(result, source);
        shell.show(null);
      } catch (error) {
        status.textContent = "Trial could not be displayed: " + analysisErrorMessage(error);
      }
    };
    worker.postMessage({ action: "fit", graph: source.graph, bundles: source.bundles, articles: data.articles, options });
  }
  family.onchange = () => {
    explain();
    shell.show("analysis");
  };
  for (const field of [groups, imbalance, restart, seed]) field.addEventListener("change", () => explain());
  for (const field of [scope, orders]) field.addEventListener("change", () => {
    seedOptions();
    explain();
  });
  seedOptions();
  explain(false);
  busy(false);
  run();
  window.addEventListener("atlas-reliability-change", (event) => {
    if (current && event.detail === canvas.graph() && event.detail.trial) current.audit = event.detail.reliability;
  });
})();

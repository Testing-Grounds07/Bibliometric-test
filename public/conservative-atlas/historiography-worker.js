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

  // scripts/historiography.mjs
  var HISTORIOGRAPHY_VERSION = 1;
  var HISTORY_DEFAULTS = { core: 0, limit: 100, from: null, through: null, includeUndated: true };
  var HISTORY_METHOD = "Direct citations between source articles in the selected corpus. A k-core recursively retains articles with at least k distinct other core neighbors, counting incoming and outgoing relations without direction for eligibility. Articles are ranked by incoming citations from that core before the display cap. Colors are weak citation components, not Leiden themes. Years determine vertical positions; citation arrows point from citing to cited articles. Binary citation edges are not association-strength or cosine similarities. Transitive reduction is display-only on the induced, capped network and preserves reachability among those displayed articles, not paths through omitted corpus articles. For directed cycles, reduction operates on the acyclic condensation graph while preserving every citation within each strongly connected group; this is not a unique edge-minimal reduction of the cyclic graph. Missing references can remove observed paths; a citation does not establish agreement, quality, or causal knowledge transfer.";
  var citationKey = (edge) => JSON.stringify([edge.source, edge.target]);
  function citationCore(nodes, links, minimum) {
    const neighbors = new Map(nodes.map((node) => [node.id, /* @__PURE__ */ new Set()]));
    for (const edge of links) {
      neighbors.get(edge.source).add(edge.target);
      neighbors.get(edge.target).add(edge.source);
    }
    const degrees = new Map([...neighbors].map(([id, adjacent]) => [id, adjacent.size])), retained = new Set(neighbors.keys());
    const queue = [...degrees].filter(([, degree]) => degree < minimum).map(([id]) => id);
    for (let position = 0; position < queue.length; position++) {
      const id = queue[position];
      if (!retained.delete(id)) continue;
      for (const other of neighbors.get(id)) if (retained.has(other)) {
        const degree = degrees.get(other) - 1;
        degrees.set(other, degree);
        if (degree < minimum) queue.push(other);
      }
    }
    return retained;
  }
  function citationComponents(nodes, links) {
    const neighbors = new Map(nodes.map((node) => [node.id, []]));
    for (const edge of links) {
      neighbors.get(edge.source).push(edge.target);
      neighbors.get(edge.target).push(edge.source);
    }
    const seen = /* @__PURE__ */ new Set(), groups = [];
    for (const id of neighbors.keys()) if (!seen.has(id) && neighbors.get(id).length) {
      const members = [id];
      seen.add(id);
      for (let position = 0; position < members.length; position++) for (const other of neighbors.get(members[position])) if (!seen.has(other)) {
        seen.add(other);
        members.push(other);
      }
      groups.push(members.sort());
    }
    groups.sort((left, right) => right.length - left.length || left[0].localeCompare(right[0]));
    return Object.fromEntries(groups.flatMap((members, position) => members.map((id) => [id, position + 1])));
  }
  function reduceCitations(nodes, links) {
    const positions = new Map(nodes.map((node, position) => [node.id, position])), outgoing = nodes.map(() => []), incoming = nodes.map(() => 0);
    for (const edge of links) {
      outgoing[positions.get(edge.source)].push(positions.get(edge.target));
      incoming[positions.get(edge.target)]++;
    }
    const order = incoming.map((degree, position) => degree ? -1 : position).filter((position) => position >= 0);
    for (let position = 0; position < order.length; position++) for (const target of outgoing[order[position]]) if (--incoming[target] === 0) order.push(target);
    if (order.length !== nodes.length) return reduceCyclicCitations(nodes, links, outgoing, positions);
    const words = Math.ceil(nodes.length / 32), reachable = nodes.map(() => new Uint32Array(words)), rank = new Map(order.map((node, position) => [node, position])), kept = [];
    for (const source of order.slice().reverse()) {
      const covered = reachable[source];
      for (const target of outgoing[source].sort((left, right) => rank.get(left) - rank.get(right))) {
        if (covered[target >>> 5] & 1 << (target & 31)) continue;
        kept.push(citationKey({ source: nodes[source].id, target: nodes[target].id }));
        covered[target >>> 5] |= 1 << (target & 31);
        for (let word = 0; word < words; word++) covered[word] |= reachable[target][word];
      }
    }
    return { hasCycle: false, mode: "dag", kept, removed: links.length - kept.length, scope: "Reachability preserved within the displayed induced network only" };
  }
  function reduceCyclicCitations(nodes, links, outgoing, positions) {
    const visited = /* @__PURE__ */ new Set(), finished = [], incoming = nodes.map(() => []);
    for (const [source, targets] of outgoing.entries()) for (const target of targets) incoming[target].push(source);
    for (let start = 0; start < nodes.length; start++) if (!visited.has(start)) {
      const stack = [{ node: start, next: 0 }];
      visited.add(start);
      while (stack.length) {
        const current = stack.at(-1);
        if (current.next === outgoing[current.node].length) {
          finished.push(current.node);
          stack.pop();
        } else {
          const target = outgoing[current.node][current.next++];
          if (!visited.has(target)) {
            visited.add(target);
            stack.push({ node: target, next: 0 });
          }
        }
      }
    }
    const membership = /* @__PURE__ */ new Map(), groups = [];
    for (const start of finished.reverse()) if (!membership.has(start)) {
      const members = [start], component = groups.length;
      membership.set(start, component);
      for (let position = 0; position < members.length; position++) for (const other of incoming[members[position]]) if (!membership.has(other)) {
        membership.set(other, component);
        members.push(other);
      }
      groups.push(members);
    }
    const pairs = /* @__PURE__ */ new Map();
    for (const edge of links) {
      const source = String(membership.get(positions.get(edge.source))), target = String(membership.get(positions.get(edge.target)));
      if (source !== target) pairs.set(citationKey({ source, target }), { source, target });
    }
    const reduced = reduceCitations(groups.map((_, position) => ({ id: String(position) })), [...pairs.values()]), keepPairs = new Set(reduced.kept);
    const kept = links.filter((edge) => {
      const source = String(membership.get(positions.get(edge.source))), target = String(membership.get(positions.get(edge.target)));
      return source === target || keepPairs.has(citationKey({ source, target }));
    }).map(citationKey);
    return { hasCycle: true, mode: "scc-condensation", cycleArticles: groups.filter((members) => members.length > 1).reduce((sum, members) => sum + members.length, 0), cycleComponents: groups.filter((members) => members.length > 1).length, kept, removed: links.length - kept.length, scope: "Reachability preserved within the displayed induced network; all internal cyclic-group links and parallel links on retained component relations remain intact" };
  }
  function chronologyLayout(nodes, links) {
    const years = nodes.map((node) => node.year).filter(Number.isInteger), minimum = Math.min(...years), maximum = Math.max(...years);
    const yearScale = Math.min(30, 560 / Math.max(1, maximum - minimum));
    const rows = /* @__PURE__ */ new Map(), byId = new Map(nodes.map((node) => [node.id, node])), neighbors = new Map(nodes.map((node) => [node.id, []]));
    for (const edge of links) {
      neighbors.get(edge.source).push(edge.target);
      neighbors.get(edge.target).push(edge.source);
    }
    for (const node of nodes) {
      const row = Number.isInteger(node.year) ? node.year : "unknown";
      if (!rows.has(row)) rows.set(row, []);
      rows.get(row).push(node);
    }
    for (const members of rows.values()) members.sort((left, right) => left.cluster - right.cluster || right.citations - left.citations || left.id.localeCompare(right.id));
    const positionRows = () => {
      for (const [year, members] of rows) members.forEach((node, position) => {
        node.x = 120 + (position + 0.5) / members.length * 740;
        node.y = year === "unknown" ? Number.isFinite(maximum) ? (maximum - minimum) * yearScale + 200 : 200 : 90 + (year - minimum) * yearScale;
      });
    };
    positionRows();
    for (let pass = 0; pass < 6; pass++) {
      const average = (node) => {
        const adjacent = neighbors.get(node.id);
        return adjacent.length ? adjacent.reduce((sum, id) => sum + byId.get(id).x, 0) / adjacent.length : node.x;
      };
      for (const members of rows.values()) members.sort((left, right) => average(left) - average(right) || left.id.localeCompare(right.id));
      positionRows();
    }
    return { minimum: Number.isFinite(minimum) ? minimum : null, maximum: Number.isFinite(maximum) ? maximum : null, yearScale: Number.isFinite(yearScale) ? yearScale : null, unknownYear: rows.has("unknown") ? rows.get("unknown")[0].y : null };
  }
  function buildHistoriography(articles, options = {}, progress = () => {
  }) {
    const settings = { ...HISTORY_DEFAULTS, ...options };
    if (!Number.isInteger(settings.core) || settings.core < 0 || settings.core > 1e3 || !Number.isInteger(settings.limit) || settings.limit < 1 || settings.limit > 1e3) throw new Error("Choose a core from 0\u20131,000 and a display cap from 1\u20131,000.");
    if ([settings.from, settings.through].some((year) => year != null && (!Number.isInteger(year) || year < 1500 || year > 2100)) || settings.from != null && settings.through != null && settings.from > settings.through) throw new Error("Check the publication-year range.");
    if (articles.length > 2e4) throw new Error("Historiography supports up to 20,000 source articles. Narrow the corpus; no partial network was used.");
    const identifiers = /* @__PURE__ */ new Set();
    for (const article of articles) {
      if (!article.id || identifiers.has(article.id)) throw new Error("Duplicate or missing source IDs; clean the corpus before historiography.");
      identifiers.add(article.id);
    }
    const scoped = articles.filter((article) => Number.isInteger(article.year) ? (settings.from == null || article.year >= settings.from) && (settings.through == null || article.year <= settings.through) : settings.includeUndated);
    const byId = new Map(scoped.map((article) => [article.id, article])), links = [], audit = { sourceArticles: articles.length, scopedArticles: scoped.length, undatedArticles: articles.filter((article) => !Number.isInteger(article.year)).length, withReferences: scoped.filter((article) => article.references?.length).length, externalReferences: 0, selfCitations: 0, duplicateReferences: 0, futureDatedLinks: 0 };
    progress("Matching citations within the source corpus\u2026");
    for (const article of scoped) {
      const references = article.references || [];
      audit.duplicateReferences += references.length - new Set(references).size;
      for (const reference of new Set(references)) {
        if (article.id === reference) {
          audit.selfCitations++;
          continue;
        }
        if (!byId.has(reference)) {
          audit.externalReferences++;
          continue;
        }
        const target = byId.get(reference), future = Number.isInteger(article.year) && Number.isInteger(target.year) && article.year < target.year;
        if (future) audit.futureDatedLinks++;
        links.push({ source: article.id, target: reference, count: 1, strength: 1, articles: [article.id], futureDated: future });
        if (links.length > 2e5) throw new Error("More than 200,000 within-corpus citations. Narrow the year range; no partial network was used.");
      }
    }
    progress("Finding the recursive citation core\u2026");
    const core = citationCore(scoped, links, settings.core), coreLinks = links.filter((edge) => core.has(edge.source) && core.has(edge.target));
    const received = new Map(scoped.map((article) => [article.id, 0])), coreReceived = new Map([...core].map((id) => [id, 0]));
    for (const edge of links) received.set(edge.target, received.get(edge.target) + 1);
    for (const edge of coreLinks) coreReceived.set(edge.target, coreReceived.get(edge.target) + 1);
    const members = citationComponents(scoped.filter((article) => core.has(article.id)), coreLinks);
    const nodes = scoped.filter((article) => core.has(article.id)).sort((left, right) => coreReceived.get(right.id) - coreReceived.get(left.id) || (left.year ?? Infinity) - (right.year ?? Infinity) || left.id.localeCompare(right.id)).slice(0, settings.limit).map((article, position) => ({ ...article, label: [article.authors?.split(";")[0], article.title].filter(Boolean).join(", ") || article.id, key: article.id, citations: coreReceived.get(article.id), corpusCitations: received.get(article.id), cluster: members[article.id] || 0, rank: position + 1 }));
    const shown = new Set(nodes.map((node) => node.id)), selectedLinks = coreLinks.filter((edge) => shown.has(edge.source) && shown.has(edge.target));
    const degrees = new Map(nodes.map((node) => [node.id, 0]));
    for (const edge of selectedLinks) {
      degrees.set(edge.source, degrees.get(edge.source) + 1);
      degrees.set(edge.target, degrees.get(edge.target) + 1);
    }
    for (const node of nodes) node.degree = degrees.get(node.id);
    progress("Reducing redundant displayed citation links\u2026");
    const reduction = reduceCitations(nodes, selectedLinks), layout = chronologyLayout(nodes, selectedLinks);
    return { method: "direct_citation", canvasKind: "historiography", networkModel: "direct-citation", directed: true, nodes, links: selectedLinks, normalization: "raw binary citations", counting: "One citation per distinct citing\u2013cited article pair", resolution: null, order: 2, minimumSupport: 1, clustering: { algorithm: "citation-components", label: "Weak citation components (not thematic clusters)", objective: "Undirected reachability components of the full eligible core" }, historiography: { version: HISTORIOGRAPHY_VERSION, settings, ...audit, corpusLinks: links.length, coreArticles: core.size, coreLinks: coreLinks.length, displayedArticles: nodes.length, cappedArticles: Math.max(0, core.size - nodes.length), reduction, layout, method: HISTORY_METHOD, ranking: "Incoming citations from the full eligible core, before the display cap; ties by year then ID" }, stats: { nodes: nodes.length, edges: selectedLinks.length, clusters: new Set(nodes.map((node) => node.cluster).filter(Boolean)).size, isolated_nodes: nodes.filter((node) => !node.degree).length } };
  }

  // scripts/historiography-worker.mjs
  self.onmessage = (event) => {
    try {
      self.postMessage({ result: buildHistoriography(event.data.articles, event.data.options, (progress) => self.postMessage({ progress })) });
    } catch (error) {
      self.postMessage({ error: analysisErrorMessage(error) });
    }
  };
})();

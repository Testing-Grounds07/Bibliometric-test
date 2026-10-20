(() => {
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

  // scripts/community-methods.mjs
  function buildHyperedges(graph, bundles, limit = 2e4) {
    const nodes = new Map(graph.nodes.map((node) => [node.id, node])), combinations = /* @__PURE__ */ new Map();
    const add = (members) => {
      const key = JSON.stringify(members);
      if (combinations.has(key)) return;
      if (combinations.size >= limit) throw new Error(`More than ${limit.toLocaleString()} exact combinations. Choose a smaller reference scope or a single lower order; no truncated hypergraph was clustered.`);
      combinations.set(key, members);
    };
    if (graph.order === 2 || graph.order === "all") for (const edge of graph.links) add([edge.source, edge.target].sort());
    if (graph.order !== 2) for (const bundle of bundles) {
      const members = [...new Set(bundle.members.filter((id) => nodes.has(id)))].sort(), minimum = graph.order === "all" ? 3 : graph.order, maximum = graph.order === "all" ? Math.min(graph.maximumOrder, members.length) : graph.order;
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
    const postings = new Map(graph.nodes.map((node) => [node.id, new Set(node.articles || [])])), hyperedges = [];
    for (const [key, members] of combinations) {
      const first = [...members].sort((left, right) => postings.get(left).size - postings.get(right).size)[0];
      const articles = [...postings.get(first)].filter((article) => members.every((id) => postings.get(id).has(article))).sort();
      if (articles.length >= (graph.minimumSupport || 5)) hyperedges.push({ id: key, members, articles });
    }
    const occurrences = /* @__PURE__ */ new Map();
    for (const edge of hyperedges) for (const article of edge.articles) occurrences.set(article, (occurrences.get(article) || 0) + 1);
    for (const edge of hyperedges) edge.weight = edge.articles.reduce((sum, article) => sum + 1 / occurrences.get(article), 0);
    return hyperedges;
  }

  // scripts/coupling-hypergraph.mjs
  function couplingHyperedges(graph, limit = 3e6) {
    const eligible = new Set(graph.links.flatMap((edge) => [edge.source, edge.target]));
    const references = /* @__PURE__ */ new Map();
    for (const node of graph.nodes) if (eligible.has(node.id)) {
      for (const reference of new Set(node.references || [])) {
        if (!references.has(reference)) references.set(reference, /* @__PURE__ */ new Set());
        references.get(reference).add(node.id);
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
  function visibleHyperedges(edges, nodes, focus = {}, limit = 60) {
    const visible = new Set(nodes.map((node) => node.id));
    const cluster = new Set(nodes.filter((node) => String(node.cluster) === String(focus.cluster)).map((node) => node.id));
    const pair = focus.edge ? focus.edge.split("|") : [];
    const eligible = edges.filter((edge) => edge.members.length >= 3 && edge.members.every((id) => visible.has(id)) && (!focus.node || edge.members.includes(focus.node)) && (!pair.length || pair.every((id) => edge.members.includes(id))) && (!cluster.size || edge.members.some((id) => cluster.has(id))));
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
    const members = new Set(nodes.filter((node) => String(node.cluster) === String(cluster)).map((node) => node.id));
    const all = edges.filter((edge) => edge.members.length >= 3 && edge.members.every((id) => members.has(id))).map((edge) => ({ ...edge, id: edge.id || edge.reference }));
    all.sort((left, right) => (right.articles?.length || 0) - (left.articles?.length || 0) || left.members.length - right.members.length || String(left.id).localeCompare(String(right.id)));
    return { groups: all.slice(0, limit), total: all.length };
  }
  if (typeof window !== "undefined") {
    const create = (tag, attributes, parent) => {
      const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
      for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
      parent?.append(node);
      return node;
    };
    let cachedGraph, cachedEdges, cachedError;
    window.ATLAS_HYPERGRAPH_VIEW = {
      hullPath,
      forCluster(graph, bundles, cluster, nodes) {
        const edges = graph.hyperedges || (graph.canvasKind === "coupling" ? couplingHyperedges(graph) : buildHyperedges(graph, bundles || [], 2e4));
        return clusterCombinations(edges, nodes, cluster);
      },
      draw({ graph, nodes, viewport, screen, radius, color, mode, focus, status, inspect, bundles }) {
        viewport.closest("svg").dataset.representation = mode;
        viewport.querySelector("#hyperedgeOverlay")?.remove();
        if (mode === "network") {
          status.hidden = true;
          return;
        }
        status.hidden = false;
        const coupling = graph.canvasKind === "coupling";
        if (cachedGraph !== graph) {
          cachedGraph = graph;
          cachedError = null;
          try {
            cachedEdges = (graph.hyperedges || (coupling ? couplingHyperedges(graph) : buildHyperedges(graph, bundles || graph.bundles || [], 2e4))).map((edge) => ({ ...edge, id: edge.id || edge.reference }));
          } catch (error) {
            cachedEdges = [];
            cachedError = error.message;
          }
        }
        if (cachedError) {
          status.textContent = cachedError;
          return;
        }
        const selected = visibleHyperedges(cachedEdges, nodes, focus), byId = new Map(nodes.map((node) => [node.id, node]));
        status.textContent = selected.total ? `${selected.edges.length} of ${selected.total} eligible ${coupling ? "shared-reference groups" : "combinations"} shown \xB7 ${coupling ? "deterministic reference order" : "strongest support first"}. ${mode === "layered" ? "Layers separate group sizes, not importance. " : ""}Outlines are evidence groups, not cluster boundaries; enclosed non-members do not count.` : coupling ? "No complete shared-reference groups with 3+ members in this selection." : "No complete 3+ member combinations in this selection. Choose a higher/combined order, another focus, or generate higher orders.";
        const layer = create("g", { id: "hyperedgeOverlay", "aria-label": "Exact higher-order combinations" }, null);
        viewport.insertBefore(layer, viewport.firstChild);
        const maximum = Math.max(1, ...selected.edges.map((edge) => edge.articles?.length || 0));
        const highlight = (edge) => {
          const members = new Set(edge?.members || []);
          for (const node of viewport.querySelectorAll("[data-node]")) node.style.opacity = edge ? members.has(node.dataset.node) ? "1" : ".12" : "";
          for (const shape of layer.querySelectorAll("[data-combination]")) shape.style.opacity = edge ? shape.dataset.combination === edge.id ? "1" : ".08" : "";
        };
        for (const edge of selected.edges) {
          const members = edge.members.map((id) => byId.get(id));
          const points = members.map(screen), clusters = new Set(members.map((node) => node.cluster));
          const stroke = clusters.size === 1 ? color(members[0]) : "#888888";
          const intensity = coupling ? 0.6 : 0.2 + 0.65 * Math.log1p(edge.articles?.length || 0) / Math.log1p(maximum);
          const description = coupling ? `${edge.members.length} source articles citing one shared reference` : `${edge.members.length} exact members; ${edge.articles?.length || 0} supporting sources`;
          const group = create("g", { "data-combination": edge.id, class: "hyperedge-combination", tabindex: 0, role: "button", "aria-label": description + ". Activate for exact members." }, layer);
          create("path", { d: hullPath(points, Math.max(12, ...members.map(radius)) + 5), fill: stroke, "fill-opacity": 0.025 + intensity * 0.055, stroke, "stroke-opacity": intensity, "stroke-width": 1.4, "stroke-linejoin": "round", "pointer-events": "stroke" }, group);
          create("title", {}, group).textContent = description;
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

  // scripts/exploded-view.mjs
  function combinationsForEdge(edge, bundles, order, minimumSupport = 5) {
    const combinations = /* @__PURE__ */ new Map();
    let truncated = false;
    for (const bundle of bundles) {
      let choose = function(start, chosen) {
        if (truncated) return;
        if (chosen.length === order - 2) {
          const members = [edge.source, edge.target, ...chosen], key = [...members].sort().join("|");
          if (!combinations.has(key)) {
            if (combinations.size >= 2e3) {
              truncated = true;
              return;
            }
            combinations.set(key, { key, members, articles: /* @__PURE__ */ new Set() });
          }
          for (const article of bundle.articles) combinations.get(key).articles.add(article);
          return;
        }
        for (let position = start; position <= others.length - (order - 2 - chosen.length); position++) choose(position + 1, [...chosen, others[position]]);
      };
      if (bundle.members.length < order || !bundle.members.includes(edge.source) || !bundle.members.includes(edge.target)) continue;
      const others = bundle.members.filter((id) => id !== edge.source && id !== edge.target).sort();
      choose(0, []);
    }
    if (truncated) {
      for (const group of combinations.values()) for (const bundle of bundles) if (group.members.every((id) => bundle.members.includes(id))) for (const article of bundle.articles) group.articles.add(article);
    }
    const result = [...combinations.values()].map((group) => ({ ...group, articles: [...group.articles].sort() })).filter((group) => group.articles.length >= minimumSupport).sort((left, right) => right.articles.length - left.articles.length || left.key.localeCompare(right.key));
    result.truncated = truncated;
    return result;
  }
  function alignedLayerPoints(nodes, ids, edge) {
    const index = new Map(nodes.map((node) => [node.id, node])), members = ids.map((id) => index.get(id));
    const xs = members.map((node) => Number.isFinite(node?.x) ? node.x : 0), ys = members.map((node) => Number.isFinite(node?.y) ? node.y : 0);
    const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
    const points = new Map(ids.map((id, position) => [id, { x: 35 + (right > left ? (xs[position] - left) / (right - left) : position / Math.max(1, ids.length - 1)) * 370, y: 35 + (bottom > top ? (ys[position] - top) / (bottom - top) : 0.5) * 105 }]));
    if (edge) {
      points.set(edge.source, { x: 75, y: 35 });
      points.set(edge.target, { x: 365, y: 35 });
      for (const id of ids) if (id !== edge.source && id !== edge.target) points.get(id).y = 85 + (points.get(id).y - 35) * 0.55;
    }
    return points;
  }
  function centeredLayer(candidates, top, bottom, current, hysteresis = 12) {
    if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom <= top) return null;
    const center = (top + bottom) / 2;
    const visible = candidates.filter((layer) => Number.isFinite(layer.top) && Number.isFinite(layer.bottom) && layer.bottom > layer.top && layer.bottom > top && layer.top < bottom).map((layer) => ({ ...layer, distance: Math.abs((layer.top + layer.bottom) / 2 - center) }));
    visible.sort((left, right) => left.distance - right.distance || left.position - right.position);
    const best = visible[0], previous = visible.find((layer) => layer.position === current);
    if (!best) return null;
    return previous && previous.distance <= best.distance + hysteresis ? current : best.position;
  }
  function selectedArticlePlacement(group, id) {
    return !id ? "none" : group.members.includes(id) ? "member" : "context";
  }
  function filterLayerGroups(groups, id, enabled) {
    return enabled && id ? groups.filter((group) => group.members.includes(id)) : groups;
  }
  function articleConnectorStyle(highlighted, id) {
    return highlighted === id ? { width: 1.4, opacity: 0.62, markerOpacity: 0.85 } : { width: 1, opacity: 0.34, markerOpacity: 0.5 };
  }
  if (typeof window !== "undefined") {
    window.coCitationCombinations = combinationsForEdge;
    window.openClusterCombinationLayers = (options) => window.openCoCitationLayers({ ...options, bundles: [], order: "all", providedGroups: options.groups });
    window.openCoCitationLayers = ({ edge, bundles = [], nodes, order, maximumOrder, minimumSupport = 5, nodeColor, sourceArticles, providedGroups, total, clusterLabel, clusterId, coupling = false, initialSize, initialCombination }) => {
      const previousFocus = document.activeElement, index = new Map(nodes.map((node) => [node.id, node]));
      const make = (tag, content = "", className = "") => {
        const element = document.createElement(tag);
        element.textContent = content;
        element.className = className;
        return element;
      };
      const svgElement = (tag, attributes, parent) => {
        const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
        for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
        parent.append(element);
        return element;
      };
      const dialog = make("dialog", "", "exploded-dialog exploded-continuous");
      dialog.setAttribute("aria-label", "Exploded co-citation combinations");
      const header = make("header"), heading = make("div");
      heading.append(make("h2", providedGroups ? "Inside " + clusterLabel : "Inside this connection"), make("p", "Scroll to focus a layer and update its articles. Each layer is one exact " + (coupling ? "shared-reference group" : "combination") + "; dotted guides show article identity, not citation relationships."));
      const close = make("button", "Return to network", "exploded-return");
      close.type = "button";
      header.append(heading, close);
      dialog.append(header);
      const controls = make("div", "", "exploded-controls"), orderLabel = make("label", "Combination size "), orderSelect = make("select"), counter = make("span", "", "exploded-counter");
      counter.setAttribute("role", "status");
      const maximum = Math.min(maximumOrder || Infinity, Math.max(2, ...bundles.map((bundle) => bundle.members.length)));
      if (providedGroups) {
        orderSelect.append(new Option("All sizes", "all"));
        for (const size of [...new Set(providedGroups.map((group) => group.members.length))].sort((left, right) => left - right)) orderSelect.append(new Option(size + (coupling ? " source articles" : " references"), String(size)));
      } else if (order === "all" || order === 2) {
        for (let value = 3; value <= maximum; value++) orderSelect.append(new Option(value + " references", String(value)));
      } else orderSelect.append(new Option(order + " references", String(order)));
      if (initialSize && [...orderSelect.options].some((option) => option.value === String(initialSize))) orderSelect.value = String(initialSize);
      const articleLabel = make("label", "Track article "), articleSelect = make("select");
      articleSelect.className = "exploded-article-select";
      articleSelect.setAttribute("aria-label", "Track article through layers");
      articleLabel.append(articleSelect);
      const matchingLabel = make("label", "", "exploded-matching-layers"), matchingOnly = make("input");
      matchingOnly.type = "checkbox";
      matchingOnly.disabled = true;
      matchingOnly.setAttribute("aria-label", "Only layers containing the tracked article");
      matchingLabel.append(matchingOnly, document.createTextNode("Only matching layers"));
      matchingLabel.title = "Choose an article first. Keeps only combinations where it is an actual member, not a hollow context node.";
      const focusStatus = make("span", "", "exploded-focus-status");
      focusStatus.setAttribute("role", "status");
      focusStatus.setAttribute("aria-live", "polite");
      focusStatus.setAttribute("aria-atomic", "true");
      orderLabel.append(orderSelect);
      controls.append(orderLabel, articleLabel, matchingLabel, counter, focusStatus);
      dialog.append(controls);
      const body = make("div", "", "exploded-body"), stage = make("div", "", "exploded-stage"), details = make("aside", "", "exploded-details");
      stage.tabIndex = 0;
      stage.setAttribute("aria-label", "Scrollable combination layers");
      body.append(stage, details);
      dialog.append(body);
      const leaders = svgElement("svg", { class: "exploded-leaders", "aria-hidden": "true" }, body), footer = make("p", "", "exploded-footer");
      dialog.append(footer);
      let groups = [], scopeGroups = [], animateLayers = true, loaded = 0, selected = 0, closing = false, ids = [], points, canvas, guides, layerRoot, loadButton, topSpacer, bottomSpacer, observer, resizeObserver, connectorFrame = 0, fillFrame = 0, scrollFocusFrame = 0, scrollFocusEnabled = false, motionUntil = 0, focusedArticle = null, trackedArticle = null, announced = false;
      const combinationKey = (group) => group && (group.key || group.id || JSON.stringify([...group.members].sort()));
      const combinationNumber = (position) => scopeGroups.indexOf(groups[position]) + 1;
      function descriptor() {
        const inferred = providedGroups?.length === 1 ? [...new Set(providedGroups[0].members.map((id) => index.get(id)?.cluster))] : [];
        return { cluster: clusterId || (inferred.length === 1 && inferred[0] > 0 ? String(inferred[0]) : null), source: edge?.source, target: edge?.target, size: orderSelect.value, combination: combinationKey(groups[selected]) };
      }
      const guideRanges = /* @__PURE__ */ new Map(), layerSpacing = 130, batchSize = 4;
      function updateScrollPadding() {
        if (!canvas || !groups.length) return;
        const scale = canvas.getBoundingClientRect().width / 720;
        topSpacer.style.height = Math.max(0, stage.clientHeight / 2 - 86.875 * scale) + "px";
        bottomSpacer.style.height = Math.max(0, stage.clientHeight / 2 - 143.125 * scale - (loadButton.hidden ? 0 : loadButton.offsetHeight + 32)) + "px";
      }
      function layerBounds(position) {
        const bounds = canvas.getBoundingClientRect(), scale = bounds.width / 720, top = bounds.top + (30 + position * layerSpacing) * scale;
        return { position, top, bottom: top + 175 * 0.65 * scale };
      }
      function centerLayer(position) {
        if (position >= loaded) return;
        const bounds = layerBounds(position), viewport = stage.getBoundingClientRect();
        stage.scrollTop += (bounds.top + bounds.bottom - viewport.top - viewport.bottom) / 2;
      }
      function scheduleScrollFocus() {
        if (!scrollFocusEnabled || scrollFocusFrame || closing) return;
        scrollFocusFrame = requestAnimationFrame(() => {
          scrollFocusFrame = 0;
          if (!dialog.open || closing) return;
          const bounds = stage.getBoundingClientRect(), content = canvas.getBoundingClientRect(), scale = content.width / 720, candidates = Array.from({ length: loaded }, (value, position2) => {
            const top = content.top + (30 + position2 * layerSpacing) * scale;
            return { position: position2, top, bottom: top + 175 * 0.65 * scale };
          }), position = centeredLayer(candidates, bounds.top, bounds.bottom, selected);
          if (position !== null && position !== selected) inspect(position);
        });
      }
      function followScroll() {
        scrollFocusEnabled = true;
        scheduleScrollFocus();
        scheduleConnectors();
      }
      function followResize() {
        updateScrollPadding();
        scheduleScrollFocus();
        scheduleConnectors();
      }
      function scheduleConnectors() {
        if (!connectorFrame) connectorFrame = requestAnimationFrame(drawConnectors);
      }
      function drawConnectors() {
        connectorFrame = 0;
        leaders.replaceChildren();
        if (!dialog.open || closing) return;
        const bodyBox = body.getBoundingClientRect(), stageBox = stage.getBoundingClientRect(), detailsBox = details.getBoundingClientRect();
        leaders.setAttribute("viewBox", `0 0 ${bodyBox.width} ${bodyBox.height}`);
        const activeLayer = stage.querySelector(`[data-layer="${selected}"]`);
        for (const row of details.querySelectorAll("[data-article-row]")) {
          const marker = [...activeLayer?.querySelectorAll("[data-layer-member]") || []].find((element) => element.dataset.layerMember === row.dataset.articleRow), circle = marker?.querySelector("circle");
          if (!circle) continue;
          const nodeBox = circle.getBoundingClientRect(), rowBox = row.getBoundingClientRect(), nodeX = nodeBox.x + nodeBox.width / 2, nodeY = nodeBox.y + nodeBox.height / 2;
          if (nodeY < stageBox.top || nodeY > stageBox.bottom || nodeX < stageBox.left || nodeX > stageBox.right || rowBox.top >= detailsBox.bottom || rowBox.bottom <= detailsBox.top) continue;
          const startX = nodeX - bodyBox.x, startY = nodeY - bodyBox.y, endX = rowBox.left - bodyBox.x - 5, endY = Math.max(detailsBox.top, Math.min(detailsBox.bottom, rowBox.top + 14)) - bodyBox.y;
          const style = articleConnectorStyle(focusedArticle || trackedArticle, row.dataset.articleRow);
          svgElement("path", { d: `M${startX},${startY}C${startX + 45},${startY} ${endX - 45},${endY} ${endX},${endY}`, fill: "none", stroke: "var(--ink)", "stroke-width": style.width, "stroke-dasharray": "2 5", opacity: style.opacity, "data-article-connector": row.dataset.articleRow }, leaders);
          svgElement("circle", { cx: startX, cy: startY, r: 3, fill: "var(--surface)", stroke: "var(--ink)", "stroke-width": 1, opacity: style.markerOpacity }, leaders);
        }
        if (performance.now() < motionUntil) scheduleConnectors();
      }
      function spotlight(position) {
        for (const layer of stage.querySelectorAll("[data-layer]")) layer.classList.toggle("is-active", +layer.dataset.layer === position);
      }
      function focusArticle(id) {
        focusedArticle = id;
        const highlighted = id || trackedArticle;
        for (const marker of stage.querySelectorAll(highlighted ? "[data-layer-member]" : ".is-article-linked")) marker.classList.toggle("is-article-linked", marker.dataset.layerMember === highlighted);
        scheduleConnectors();
      }
      function memberLabel(id) {
        const position = ids.indexOf(id);
        return providedGroups ? String(position + 1) : position < 26 ? String.fromCharCode(65 + position) : String(position + 1);
      }
      function updateGuide(id, position) {
        const point = points.get(id);
        let guide = guideRanges.get(id);
        if (!guide) {
          const line = svgElement("line", { x1: 100 + point.x + point.y * 0.45, x2: 100 + point.x + point.y * 0.45, stroke: "var(--muted)", "stroke-dasharray": "3 5", opacity: ".22", "pointer-events": "none", "data-identity-guide": id }, guides);
          guide = { line, first: position, last: position };
          guideRanges.set(id, guide);
        }
        guide.first = Math.min(guide.first, position);
        guide.last = Math.max(guide.last, position);
        guide.line.setAttribute("y1", 30 + guide.first * layerSpacing + point.y * 0.65);
        guide.line.setAttribute("y2", 30 + guide.last * layerSpacing + point.y * 0.65);
      }
      function drawMember(plane, id, included, position, extra = false) {
        const point = points.get(id), node = index.get(id), marker = svgElement("g", { "data-layer-member": id, "data-included": String(included), "data-tracked-context": String(extra) }, plane);
        svgElement("circle", { cx: point.x, cy: point.y, r: included ? 7 : 4, fill: included && nodeColor ? nodeColor(node) : "var(--surface)", stroke: included ? "var(--ink)" : "var(--muted)", "stroke-width": 1.2, opacity: included ? 1 : 0.25 }, marker);
        svgElement("title", {}, marker).textContent = (included ? "Member: " : "Context only: ") + (node?.label || id);
        if (included) svgElement("text", { x: point.x + 9, y: point.y + 3, fill: "var(--ink)", "font-size": 9 }, marker).textContent = memberLabel(id);
        updateGuide(id, position);
        return marker;
      }
      function syncTrackedArticle(previousId) {
        dialog.classList.toggle("has-tracked-article", !!trackedArticle);
        articleSelect.title = trackedArticle ? index.get(trackedArticle)?.label || trackedArticle : "Choose an article to highlight it across all layers.";
        for (const marker of stage.querySelectorAll('[data-tracked-context="true"]')) if (marker.dataset.layerMember !== trackedArticle) marker.remove();
        if (trackedArticle) for (const layer of stage.querySelectorAll("[data-layer]")) {
          const markers = [...layer.querySelectorAll("[data-layer-member]")];
          if (!markers.some((marker) => marker.dataset.layerMember === trackedArticle)) drawMember(layer.querySelector(".exploded-plane"), trackedArticle, false, Number(layer.dataset.layer), true);
        }
        if (previousId && previousId !== trackedArticle) {
          const occurrences = [...stage.querySelectorAll("[data-layer-member]")].filter((marker) => marker.dataset.layerMember === previousId).map((marker) => Number(marker.closest("[data-layer]").dataset.layer)), guide = guideRanges.get(previousId);
          if (guide) {
            if (!occurrences.length) {
              guide.line.remove();
              guideRanges.delete(previousId);
            } else {
              guide.first = Infinity;
              guide.last = -Infinity;
              for (const position of occurrences) updateGuide(previousId, position);
            }
          }
        }
        for (const marker of stage.querySelectorAll("[data-layer-member]")) {
          const tracked = marker.dataset.layerMember === trackedArticle, included = marker.dataset.included === "true", circle = marker.querySelector("circle");
          marker.classList.toggle("is-tracked-article", tracked);
          circle.setAttribute("r", tracked ? included ? 9 : 6 : included ? 7 : 4);
          let label = marker.querySelector("text");
          if (tracked && !label) {
            const point = points.get(trackedArticle);
            label = svgElement("text", { x: point.x + 9, y: point.y + 3, fill: "var(--ink)", "font-size": 9 }, marker);
            label.textContent = memberLabel(trackedArticle);
          } else if (!tracked && !included) label?.remove();
        }
        for (const [id, guide] of guideRanges) guide.line.classList.toggle("is-tracked-guide", id === trackedArticle);
        focusArticle(null);
      }
      function articleRow(id) {
        const item = make("li");
        item.dataset.articleRow = id;
        item.tabIndex = 0;
        item.setAttribute("role", "button");
        item.setAttribute("aria-label", "Locate " + (index.get(id)?.label || id) + " on the layer");
        item.append(make("strong", memberLabel(id) + (!providedGroups && [edge.source, edge.target].includes(id) ? " \xB7 anchor" : "") + " \u2014 "), document.createTextNode(index.get(id)?.label || id));
        if (id === trackedArticle) item.append(make("span", "Tracked", "tracked-article-badge"));
        const node = index.get(id);
        if (node?.deduplicationNote) {
          const note = make("small", "Combined records \xB7 " + node.yearLabel, "deduplication-note");
          note.title = node.deduplicationNote;
          item.append(note);
        }
        item.onpointerenter = () => focusArticle(id);
        item.onpointerleave = () => focusArticle(null);
        item.onfocus = () => focusArticle(id);
        item.onblur = () => focusArticle(null);
        const locate = () => {
          centerLayer(selected);
          focusArticle(id);
        };
        item.onclick = locate;
        item.onkeydown = (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            locate();
          }
        };
        return item;
      }
      function inspect(position) {
        selected = position;
        focusArticle(null);
        spotlight(position);
        details.replaceChildren();
        details.scrollTop = 0;
        focusStatus.textContent = (coupling ? "Reference group " : "Combination ") + combinationNumber(position) + " in focus";
        const group = groups[position];
        if (announced) window.dispatchEvent(new CustomEvent("atlas:exploded-change", { detail: descriptor() }));
        details.append(make("h3", (coupling ? "Reference group " : "Combination ") + combinationNumber(position)), make("p", coupling ? group.members.length + " source articles citing one shared reference" : group.members.length + " exact references \xB7 " + group.articles.length + " jointly citing source articles", "exploded-support"));
        const list = make("ol", "", "exploded-member-list");
        group.members.forEach((id) => list.append(articleRow(id)));
        details.append(list);
        if (selectedArticlePlacement(group, trackedArticle) === "context") {
          const context = make("section", "", "tracked-article-card");
          context.setAttribute("aria-label", "Tracked article outside the combination");
          context.append(make("h4", "Tracked article"), make("p", "Not part of this combination. Shown as a hollow node on this layer."));
          const contextList = make("ol", "", "exploded-member-list");
          contextList.append(articleRow(trackedArticle));
          context.append(contextList);
          details.append(context);
        }
        const evidence = make("details"), summary = make("summary", coupling ? "View shared reference" : "View " + group.articles.length + " supporting articles");
        evidence.append(summary);
        evidence.addEventListener("toggle", () => {
          if (evidence.open && !evidence.dataset.loaded) {
            evidence.dataset.loaded = "true";
            if (coupling) {
              const link = make("a", group.reference);
              link.href = group.reference;
              link.target = "_blank";
              link.rel = "noopener";
              evidence.append(link);
            } else sourceArticles(evidence, group.articles);
          }
          scheduleConnectors();
        });
        details.append(evidence);
        scheduleConnectors();
      }
      function appendLayers() {
        if (closing || loaded >= groups.length) return;
        const start = loaded, end = Math.min(groups.length, loaded + batchSize), contextIds = ids.slice(0, 24);
        for (let position = start; position < end; position++) {
          const group = groups[position], active = new Set(group.members), shownIds = [.../* @__PURE__ */ new Set([...contextIds, ...group.members, ...trackedArticle ? [trackedArticle] : []])], offset = position * layerSpacing;
          const wrapper = svgElement("g", { transform: `translate(0 ${offset})` }, layerRoot), layer = svgElement("g", { "data-layer": position, class: "exploded-layer" + (start || !animateLayers ? " is-streamed" : ""), tabindex: 0, role: "button", "aria-label": "Inspect " + (coupling ? "reference group " : "combination ") + combinationNumber(position) + ", " + group.members.length + " members", style: "--rise:-375px;--delay:" + (position < 4 ? position * 90 : 0) + "ms" }, wrapper);
          const plane = svgElement("g", { class: "exploded-plane" }, layer);
          svgElement("rect", { x: 0, y: 0, width: 440, height: 175, rx: 14, fill: "var(--surface)", "fill-opacity": ".96", stroke: "var(--line)", "stroke-width": 1.2, class: "exploded-sheet" }, plane);
          const memberNodes = group.members.map((id) => index.get(id)), sameCluster = new Set(memberNodes.map((node) => node?.cluster)).size === 1, stroke = sameCluster && nodeColor ? nodeColor(memberNodes[0]) : "var(--muted)";
          svgElement("path", { d: hullPath(group.members.map((id) => points.get(id)), 5), fill: stroke, "fill-opacity": ".12", stroke, "stroke-opacity": ".7", "stroke-width": 1.3 }, plane);
          if (edge) {
            const first = points.get(edge.source), second = points.get(edge.target);
            svgElement("path", { d: `M${first.x},${first.y}L${second.x},${second.y}`, fill: "none", stroke: "var(--ink)", "stroke-width": 1.5, "stroke-dasharray": "5 3" }, plane);
          }
          for (const id of shownIds) drawMember(plane, id, active.has(id), position, id === trackedArticle && !active.has(id) && !contextIds.includes(id));
          svgElement("text", { x: 105, y: 391, fill: "var(--ink)", "font-size": 12, "font-weight": 600 }, layer).textContent = (coupling ? "Reference group " : "Combination ") + combinationNumber(position) + " \xB7 " + group.members.length + " members" + (coupling ? "" : " \xB7 " + group.articles.length + " sources");
          const activate = () => {
            if (position !== selected) inspect(position);
            centerLayer(position);
          };
          layer.onfocus = activate;
          layer.onclick = activate;
          layer.onkeydown = (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              activate();
            }
          };
        }
        loaded = end;
        const height = Math.max(260, loaded * layerSpacing + 100);
        canvas.setAttribute("viewBox", `0 0 720 ${height}`);
        canvas.setAttribute("height", height);
        counter.textContent = `${loaded} of ${groups.length}${matchingOnly.checked ? " matching" : ""} combinations loaded` + (matchingOnly.checked ? ` \xB7 ${scopeGroups.length} total` : "") + " \xB7 scroll to explore";
        loadButton.hidden = loaded >= groups.length;
        updateScrollPadding();
        spotlight(selected);
        if (trackedArticle) syncTrackedArticle();
        scheduleConnectors();
        scheduleScrollFocus();
        if (stage.scrollHeight <= stage.clientHeight + 160 && loaded < groups.length) fillFrame = requestAnimationFrame(appendLayers);
      }
      function reset({ preserve = false, animate = true } = {}) {
        const requestedKey = preserve ? combinationKey(groups[selected]) : initialCombination;
        animateLayers = animate;
        observer?.disconnect();
        cancelAnimationFrame(fillFrame);
        cancelAnimationFrame(scrollFocusFrame);
        scrollFocusFrame = 0;
        scrollFocusEnabled = false;
        stage.replaceChildren();
        leaders.replaceChildren();
        guideRanges.clear();
        loaded = selected = 0;
        focusedArticle = null;
        focusStatus.textContent = "";
        scopeGroups = providedGroups ? providedGroups.filter((group) => orderSelect.value === "all" || group.members.length === +orderSelect.value) : combinationsForEdge(edge, bundles, +orderSelect.value, minimumSupport);
        ids = [...new Set(scopeGroups.flatMap((group) => group.members))].sort();
        if (edge) ids = [edge.source, edge.target, ...ids.filter((id) => id !== edge.source && id !== edge.target)];
        points = alignedLayerPoints(nodes, ids, edge);
        if (!ids.includes(trackedArticle)) trackedArticle = null;
        if (!trackedArticle) matchingOnly.checked = false;
        matchingOnly.disabled = !trackedArticle;
        groups = filterLayerGroups(scopeGroups, trackedArticle, matchingOnly.checked);
        dialog.classList.toggle("has-tracked-article", !!trackedArticle);
        articleSelect.replaceChildren(new Option("None \u2014 choose an article", ""), ...ids.slice().sort((left, right) => (index.get(left)?.label || left).localeCompare(index.get(right)?.label || right)).map((id) => {
          const node = index.get(id);
          return new Option((node?.label || id) + (node?.deduplicationNote ? " (" + node.yearLabel + "; combined)" : ""), id);
        }));
        articleSelect.value = trackedArticle || "";
        articleSelect.disabled = !scopeGroups.length;
        topSpacer = make("div");
        topSpacer.setAttribute("aria-hidden", "true");
        stage.append(topSpacer);
        canvas = svgElement("svg", { viewBox: "0 0 720 570", width: 720, height: 570, class: "continuous-layer-canvas", role: "group", "aria-label": "Continuously scrolling exact combination layers" }, stage);
        guides = svgElement("g", { "aria-hidden": "true" }, canvas);
        layerRoot = svgElement("g", {}, canvas);
        bottomSpacer = make("div");
        bottomSpacer.setAttribute("aria-hidden", "true");
        stage.append(bottomSpacer);
        loadButton = make("button", "Load more combinations", "exploded-load-more");
        loadButton.type = "button";
        loadButton.onclick = appendLayers;
        stage.append(loadButton);
        footer.textContent = "Scrolling focuses the centered layer and updates its article list and dotted leaders. Filled nodes are members; hollow nodes are context (up to 24). Vertical dotted guides repeat identity. More layers load without replaying existing ones. Depth is not importance; source counts overlap and must not be added." + (total > providedGroups?.length ? " Preview limited to " + providedGroups.length + " of " + total + " eligible groups." : "") + (scopeGroups.truncated ? " Preview limited to the first 2,000 discovered combinations." : "");
        stage.scrollTop = 0;
        motionUntil = performance.now() + (animate ? 1400 : 0);
        initialCombination = null;
        if (groups.length) {
          appendLayers();
          const requested = requestedKey ? groups.findIndex((group) => combinationKey(group) === requestedKey) : 0;
          const position = Math.max(0, requested);
          while (loaded <= position) appendLayers();
          inspect(position);
          if (position > 0) requestAnimationFrame(() => centerLayer(position));
          observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) appendLayers();
          }, { root: stage, rootMargin: "180px" });
          observer.observe(loadButton);
        } else {
          loadButton.hidden = true;
          counter.textContent = matchingOnly.checked ? "No matching combinations" : "No qualifying combinations";
          details.replaceChildren(make("p", matchingOnly.checked ? "No combinations of this size contain the tracked article. Turn off Only matching layers or choose another size." : "No complete combinations qualify here. Choose higher/combined orders, another cluster, or generate higher-order evidence."));
        }
      }
      function finish() {
        observer?.disconnect();
        resizeObserver?.disconnect();
        cancelAnimationFrame(connectorFrame);
        cancelAnimationFrame(fillFrame);
        cancelAnimationFrame(scrollFocusFrame);
        window.removeEventListener("resize", followResize);
        document.body.classList.remove("exploded-open");
        dialog.remove();
        window.ATLAS_EXPLODED = null;
        window.dispatchEvent(new CustomEvent("atlas:exploded-close"));
        previousFocus?.focus({ preventScroll: true });
      }
      function dismiss() {
        if (closing) return;
        closing = true;
        if (matchMedia("(prefers-reduced-motion: reduce)").matches || document.body.classList.contains("motion-paused")) {
          dialog.close();
          return;
        }
        dialog.classList.add("is-closing");
        setTimeout(() => dialog.close(), 360);
      }
      close.onclick = dismiss;
      orderSelect.onchange = () => reset();
      matchingOnly.onchange = () => reset({ preserve: true, animate: false });
      articleSelect.onchange = () => {
        const previousId = trackedArticle;
        trackedArticle = articleSelect.value || null;
        if (matchingOnly.checked) {
          reset({ preserve: true, animate: false });
          return;
        }
        matchingOnly.disabled = !trackedArticle;
        syncTrackedArticle(previousId);
        if (groups.length) inspect(selected);
      };
      dialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        dismiss();
      });
      dialog.addEventListener("close", finish, { once: true });
      stage.addEventListener("scroll", followScroll, { passive: true });
      details.addEventListener("scroll", scheduleConnectors, { passive: true });
      dialog.addEventListener("scroll", scheduleConnectors, { passive: true });
      stage.addEventListener("animationend", followResize);
      window.addEventListener("resize", followResize);
      document.body.append(dialog);
      document.body.classList.add("exploded-open");
      dialog.showModal();
      window.ATLAS_EXPLODED = { descriptor, dialog, close: () => new Promise((resolve) => {
        if (!dialog.open) {
          resolve();
          return;
        }
        dialog.addEventListener("close", resolve, { once: true });
        dismiss();
      }) };
      reset();
      resizeObserver = new ResizeObserver(followResize);
      resizeObserver.observe(body);
      resizeObserver.observe(stage);
      resizeObserver.observe(details);
      announced = true;
      window.dispatchEvent(new CustomEvent("atlas:exploded-open", { detail: descriptor() }));
    };
  }
})();

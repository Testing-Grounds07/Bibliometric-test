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
  var AUTO_CPM_VERSION = 3;
  var AUTO_CPM_METHOD = "Overview-oriented Auto CPM. Selection uses the fixed density-adaptive logarithmic grid plus legacy settings, not locally refined points. Fifty conditional source bootstraps, two Leiden starts per bootstrap, ten full-data starts. Score = nonnegative mean bootstrap ARI \xD7 retained-node coverage \u2212 0.20 \xD7 introduced tiny-reference fraction \u2212 0.10 \xD7 introduced tiny-cluster fraction. Tiny means 1\u20133 references; intact disconnected components are exempt. Admissible settings require mean ARI \u22650.70, coverage \u22650.80, introduced tiny-reference fraction \u22640.20 and introduced tiny-cluster fraction \u22640.50. Choose the fewest clusters within 0.05 of the best admissible score, breaking ties by lower CPM. A recommended range must contain that choice, span at least a factor of two, include \u22653 consecutive eligible tested points and have every-pair partition ARI \u22650.90. Otherwise show an exploratory overview with no clear recommendation. These thresholds express an overview preference, not a validated optimum.";
  var AUTO_CPM_LIMITATIONS = "Exploratory heuristics, not CHAMP, significance tests, confidence intervals or thematic validation. Bootstrap 10th\u201390th percentiles describe observed resampling spread. References, discovered bundles and expanded-neighborhood membership remain fixed; no re-mining or neighbor re-selection. Sampled stable ranges do not establish stability between every tested point. Single-cluster stability does not demonstrate a meaningful subdivision.";
  function densityGrid(graph) {
    if (isIncidenceModel(graph)) {
      const network = incidenceNetwork(graph);
      return { density: network.density, linkedNodes: network.articleIds.length, meanEdgeWeight: network.scale, resolutions: Array.from({ length: 17 }, (_, position) => (network.density || 0.02) * 2 ** (-5 + position / 2)) };
    }
    graph = analysisNetwork(graph);
    const linked = new Set(graph.links.flatMap((edge) => [edge.source, edge.target])), possible = linked.size * (linked.size - 1) / 2;
    const meanEdgeWeight = graph.links.reduce((sum, edge) => sum + edge.strength, 0) / Math.max(1, graph.links.length);
    const density = possible && meanEdgeWeight ? graph.links.reduce((sum, edge) => sum + edge.strength / meanEdgeWeight, 0) / possible : 0;
    const center = density || 0.02;
    const resolutions = [.../* @__PURE__ */ new Set([5e-3, 0.01, 0.02, 0.04, 0.07, 0.1, 0.16, ...Array.from({ length: 17 }, (_, position) => Number((center * 2 ** (-5 + position / 2)).toPrecision(8)))])].sort((left, right) => left - right);
    return { density, linkedNodes: linked.size, meanEdgeWeight, resolutions };
  }
  function fragmentation(graph, memberships) {
    if (isIncidenceModel(graph)) graph = { ...graph, networkModel: "connectivity-only", links: incidenceNetwork(graph).groups.flatMap((edge) => edge.members.slice(1).map((target) => ({ source: edge.members[0], target, strength: 1 }))) };
    graph = analysisNetwork(graph);
    const adjacency = /* @__PURE__ */ new Map();
    for (const edge of graph.links) {
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
  function scoreCandidates(candidates) {
    candidates.sort((left, right) => left.resolution - right.resolution);
    for (const [position, candidate] of candidates.entries()) {
      const neighbors = [candidates[position - 1], candidates[position + 1]].filter(Boolean);
      candidate.neighborARI = neighbors.reduce((sum, other) => sum + agreement(candidate.memberships, other.memberships), 0) / Math.max(1, neighbors.length);
      candidate.score = Math.max(0, candidate.bootstrapARI) * candidate.bootstrapCoverage - 0.2 * candidate.fragmentation.introducedTinyNodeFraction - 0.1 * candidate.fragmentation.introducedTinyClusterFraction;
    }
  }
  function recommendRange(candidates) {
    const grid = candidates.filter((candidate) => candidate.selectionEligible !== false).sort((left, right) => left.resolution - right.resolution), coarsest = (left, right) => left.clusters - right.clusters || left.resolution - right.resolution;
    const admissible = grid.filter((candidate) => candidate.bootstrapARI >= 0.7 && candidate.bootstrapCoverage >= 0.8 && candidate.fragmentation.introducedTinyNodeFraction <= 0.2 && candidate.fragmentation.introducedTinyClusterFraction <= 0.5), bestScore = Math.max(...admissible.map((candidate) => candidate.score));
    const eligible = (candidate) => admissible.includes(candidate) && candidate.score >= bestScore - 0.05;
    const preferred = [...grid.filter(eligible)].sort(coarsest), fallbackBest = Math.max(...grid.map((candidate) => candidate.score)), fallback = grid.filter((candidate) => candidate.score >= fallbackBest - 0.05).sort(coarsest), choice = preferred[0] || fallback[0];
    const base = { range: null, representative: choice.resolution, admissibleSettings: admissible.length, nearBestSettings: preferred.length };
    if (!choice.clusters) return { ...base, status: "no_edges", reason: "No eligible connections; no CPM recommendation." };
    if (!preferred.length) return { ...base, status: "no_clear_recommendation", reason: "No clear CPM recommendation: stability, coverage and fragmentation safeguards conflict. Showing a broader near-best score trade-off, with safeguards unmet\u2014not a validated recommendation." };
    if (choice.clusters <= choice.fragmentation.components) return { ...base, status: "no_subdivision", reason: "No supported internal subdivision at the overview choice; groups reflect disconnected components. This is not evidence of validated themes." };
    const bands = [];
    for (let start = 0; start < grid.length; start++) {
      const band2 = [];
      for (const candidate of grid.slice(start)) {
        if (!eligible(candidate) || band2.some((other) => agreement(other.memberships, candidate.memberships) < 0.9)) break;
        band2.push(candidate);
        if (band2.includes(choice) && band2.length >= 3 && candidate.resolution / band2[0].resolution >= 2 - 1e-6) bands.push([...band2]);
      }
    }
    bands.sort((left, right) => Math.log(right.at(-1).resolution / right[0].resolution) - Math.log(left.at(-1).resolution / left[0].resolution) || left[0].resolution - right[0].resolution);
    if (!bands.length) return { ...base, status: "no_clear_recommendation", reason: "No clear recommended CPM range: the broader near-best choice lacks a stable twofold interval. Showing an exploratory overview, not an optimum." };
    const band = bands[0];
    return { ...base, status: "supported_range", range: [band[0].resolution, band.at(-1).resolution], testedPoints: band.length, clusterRange: [Math.min(...band.map((item) => item.clusters)), Math.max(...band.map((item) => item.clusters))], reason: "Broader near-best overview within a sampled twofold stability range; not a validated optimum." };
  }
  function reselectCPM(graph, config) {
    const resolutions = new Set(densityGrid(graph).resolutions);
    if ([...resolutions].some((resolution) => !config.candidates.some((candidate) => candidate.resolution === resolution))) throw new Error("Cached audit lacks fixed-grid candidates");
    const candidates = config.candidates.map((candidate) => ({ ...candidate, selectionEligible: resolutions.has(candidate.resolution), fragmentation: fragmentation(graph, candidate.memberships) }));
    scoreCandidates(candidates);
    const recommendation = recommendRange(candidates), grid = candidates.filter((candidate) => candidate.selectionEligible);
    return { ...config, version: AUTO_CPM_VERSION, candidates, recommendation, autoResolution: recommendation.representative, boundarySelected: recommendation.representative === grid[0].resolution || recommendation.representative === grid.at(-1).resolution, method: AUTO_CPM_METHOD, limitations: AUTO_CPM_LIMITATIONS };
  }
  function analyzeCPM(graph, articleIds, progress = () => {
  }) {
    const grid = densityGrid(graph), bootstrapCount = 50, bootstrapRestarts = 2;
    const samples = Array.from({ length: bootstrapCount }, (_, sample) => {
      let seed = 20261016 + sample;
      const weights = {};
      for (let draw = 0; draw < articleIds.length; draw++) {
        seed = Math.imul(seed, 1664525) + 1013904223 >>> 0;
        const id = articleIds[Math.floor(seed / 4294967296 * articleIds.length)];
        weights[id] = (weights[id] || 0) + 1;
      }
      return resample(graph, weights, graph.bundles || []);
    });
    const quantile = (values, fraction) => {
      const ordered = values.slice().sort((left, right) => left - right), offset = (ordered.length - 1) * fraction, index = Math.floor(offset);
      return ordered[index] + (ordered[Math.min(index + 1, ordered.length - 1)] - ordered[index]) * (offset - index);
    };
    const candidates = [];
    function evaluate(resolution, phase) {
      const result = partition(graph, resolution), metrics = samples.map((sample) => {
        const sampled = partition(sample, resolution, bootstrapRestarts), shared = Object.keys(result.memberships).filter((id) => sampled.memberships[id]).length;
        return { ari: agreement(result.memberships, sampled.memberships), coverage: shared / Math.max(1, Object.keys(result.memberships).length) };
      });
      candidates.push({ resolution, ...result, bootstrapARI: metrics.reduce((sum, item) => sum + item.ari, 0) / bootstrapCount, bootstrapCoverage: metrics.reduce((sum, item) => sum + item.coverage, 0) / bootstrapCount, bootstrapARIInterval: [quantile(metrics.map((item) => item.ari), 0.1), quantile(metrics.map((item) => item.ari), 0.9)], bootstrapCoverageInterval: [quantile(metrics.map((item) => item.coverage), 0.1), quantile(metrics.map((item) => item.coverage), 0.9)] });
      progress({ phase, tested: candidates.length, resolution, bootstrapCount });
    }
    for (const resolution of grid.resolutions) evaluate(resolution, "coarse");
    return reselectCPM(graph, { candidates, density: grid.density, linkedNodes: grid.linkedNodes, meanEdgeWeight: grid.meanEdgeWeight, bootstrapCount, bootstrapRestarts, fullRestarts: 10, searchRange: [candidates[0].resolution, candidates.at(-1).resolution] });
  }
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
  function resample(graph, weights, bundles) {
    const minimumSupport = graph.minimumSupport || 5;
    const count = (articles) => articles.reduce((sum, id) => sum + (weights[id] || 0), 0), frequency = new Map(graph.nodes.map((node) => [node.id, count(node.articles)]));
    const eligible = new Map(bundles.filter((bundle) => count(bundle.articles) >= minimumSupport).map((bundle) => [bundle.id, bundle]));
    const links = [];
    for (const edge of graph.links) {
      const sourceFrequency = frequency.get(edge.source), targetFrequency = frequency.get(edge.target);
      if (!sourceFrequency || !targetFrequency) continue;
      let score = 0, support = 0;
      if (graph.order === 2) {
        support = count(edge.articles);
        score = support;
      } else if (graph.order === "all") {
        support = count(edge.articles);
        const orders = new Map(edge.articles.map((id) => [id, 2]));
        for (const id of edge.bundleIds || []) {
          const bundle = eligible.get(id);
          if (bundle) {
            for (const article of bundle.articles) if (orders.has(article)) orders.set(article, Math.max(orders.get(article), Math.min(bundle.members.length, graph.maximumOrder)));
          }
        }
        score = [...orders].reduce((sum, [id, order]) => sum + (weights[id] || 0) * (1 + Math.log2(order - 1)), 0);
      } else {
        const articles = /* @__PURE__ */ new Set();
        for (const id of edge.bundleIds || []) {
          const bundle = eligible.get(id);
          if (bundle && bundle.members.length >= graph.order) for (const article of bundle.articles) articles.add(article);
        }
        support = count([...articles]);
        score = support;
      }
      if (support >= minimumSupport) links.push({ ...edge, strength: score / (sourceFrequency * targetFrequency) });
    }
    return { nodes: graph.nodes, links };
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

  // scripts/drill-analysis.mjs
  function expandedMembers(base, anchors, referenceMinimum = 5, minimumSupport = 5, parentThreshold = 10) {
    const original = new Set(anchors), selected = new Set(anchors), eligible = new Set(base.nodes.filter((node) => node.citations >= referenceMinimum && node.citations < parentThreshold).map((node) => node.id));
    for (const edge of base.links) {
      if (edge.count < minimumSupport) continue;
      if (original.has(edge.source) && eligible.has(edge.target)) selected.add(edge.target);
      if (original.has(edge.target) && eligible.has(edge.source)) selected.add(edge.source);
    }
    return [...selected];
  }
  function drillGraph(base, members, bundles, order, cap, minimumSupport = 5) {
    const selected = new Set(members), graph = structuredClone(base);
    graph.nodes = graph.nodes.filter((node) => selected.has(node.id));
    graph.order = order;
    graph.maximumOrder = cap;
    graph.minimumSupport = minimumSupport;
    graph.analysisId = null;
    const projected = /* @__PURE__ */ new Map();
    for (const bundle of bundles) {
      const members2 = bundle.members.filter((id) => selected.has(id)).sort();
      if (members2.length < 3) continue;
      const key = members2.join("|");
      if (!projected.has(key)) projected.set(key, { id: "drill:" + key, members: members2, articles: /* @__PURE__ */ new Set() });
      for (const article of bundle.articles) projected.get(key).articles.add(article);
    }
    const postings = new Map(graph.nodes.map((node) => [node.id, new Set(node.articles)]));
    graph.bundles = [...projected.values()].map((bundle) => ({ ...bundle, articles: [...postings.get(bundle.members[0])].filter((article) => bundle.members.every((id) => postings.get(id).has(article))) })).filter((bundle) => bundle.articles.length >= minimumSupport);
    const pairBundles = /* @__PURE__ */ new Map();
    for (const bundle of graph.bundles) for (let left = 0; left < bundle.members.length; left++) for (let right = left + 1; right < bundle.members.length; right++) {
      const key = [bundle.members[left], bundle.members[right]].sort().join("|");
      if (!pairBundles.has(key)) pairBundles.set(key, []);
      pairBundles.get(key).push(bundle);
    }
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
    graph.links = graph.links.filter((edge) => selected.has(edge.source) && selected.has(edge.target)).flatMap((edge) => {
      const eligible = (pairBundles.get([edge.source, edge.target].sort().join("|")) || []).filter((bundle) => order === "all" || bundle.members.length >= order);
      const articles = order === "all" || order === 2 ? edge.articles : [...new Set(eligible.flatMap((bundle) => bundle.articles))];
      if (articles.length < minimumSupport) return [];
      const orders = Object.fromEntries(articles.map((id) => [id, 2]));
      for (const bundle of eligible) for (const id of bundle.articles) if (id in orders) orders[id] = Math.max(orders[id], Math.min(cap, bundle.members.length));
      const score = order === "all" ? Object.values(orders).reduce((sum, size) => sum + 1 + Math.log2(size - 1), 0) : articles.length;
      return [{ ...edge, articles, count: articles.length, strength: score / (nodes.get(edge.source).citations * nodes.get(edge.target).citations), bundleIds: order === 2 ? [] : eligible.map((bundle) => bundle.id), combinedScore: score, higherOrderBonus: score - articles.length, maximumOrderByArticle: orders, maximumSupportedOrder: Math.max(...Object.values(orders)), orderProfile: Array.from({ length: Math.max(0, cap - 1) }, (_, position) => ({ order: position + 2, support: Object.values(orders).filter((size) => size >= position + 2).length })) }];
    });
    const degree = new Map(graph.nodes.map((node) => [node.id, 0]));
    for (const edge of graph.links) {
      degree.set(edge.source, degree.get(edge.source) + 1);
      degree.set(edge.target, degree.get(edge.target) + 1);
    }
    for (const node of graph.nodes) {
      node.cluster = 0;
      node.degree = degree.get(node.id);
    }
    graph.excludedByOrder = graph.nodes.filter((node) => !node.degree).length;
    return invalidateScientificOutputs(graph);
  }
  var analyzeDrill = analyzeCPM;

  // scripts/drill-worker.mjs
  self.onmessage = (event) => {
    try {
      const { base, members, bundles, order, cap, articleIds, minimumSupport = 5, expanded = false, referenceMinimum = 5, parentThreshold = 10 } = event.data;
      const selected = expanded ? expandedMembers(base, members, referenceMinimum, minimumSupport, parentThreshold) : members;
      const graph = drillGraph(base, selected, bundles, order, cap, minimumSupport), anchors = new Set(members);
      for (const node of graph.nodes) node.addedReference = !anchors.has(node.id);
      graph.expansion = { enabled: expanded, referenceMinimum, minimumSupport, parentThreshold, anchorCount: members.length, addedCount: selected.length - members.length, rule: "One-hop pairwise co-citation to an original anchor; additions must be below the parent reference-frequency threshold. No recursive neighbor expansion." };
      self.postMessage({ graph, config: analyzeDrill(graph, articleIds, (progress) => self.postMessage({ progress })) });
    } catch (error) {
      self.postMessage({ error: analysisErrorMessage(error) });
    }
  };
})();

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
  var HYPERGRAPH_PROJECTION = "Size-normalized hypergraph projection: each supported group contributes weight / (group size \u2212 1) to every member pair. This models choosing an incident group by weight, then a different member uniformly. Leiden optimizes CPM on this projection; Infomap optimizes its two-level map equation on the same walk. This is not direct hypergraph modularity or memory-network inference. Original pair lines retain their evidence counts; envelopes show whole groups.";
  var HYPERGRAPH_MODEL_VERSION = "incidence-v1";
  var HYPERGRAPH_INCIDENCE = "Whole groups are retained as article\u2013group incidence nodes, without clique projection. Each membership has its group weight; Leiden normalizes membership weights to mean one and optimizes bipartite CPM with cross-class gamma and zero within-class penalties. Infomap encodes visits to both article and group nodes in a weighted undirected incidence walk (including return to the same article). This is a memoryless incidence model, not a multilayer memory model or direct hypergraph modularity. Helper groups never become article tiles. Original pair lines and bridge roles retain their original evidence; envelopes show complete groups. Stability is not thematic validation.";
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

  // scripts/community-methods.mjs
  var HYPERGRAPH_OBJECTIVES = ["majority", "linear", "quadratic", "strict"];
  var HYPERGRAPH_SEARCHES = ["mixed", "leiden-seeded", "group-moves", "annealing"];
  function contribution(count, size, objective = "linear") {
    if (!HYPERGRAPH_OBJECTIVES.includes(objective)) throw new Error("Unknown hypergraph objective");
    if (count <= size / 2) return 0;
    return objective === "strict" ? Number(count === size) : (count / size) ** { majority: 0, linear: 1, quadratic: 2 }[objective];
  }
  var HYPERGRAPH_METHOD = "Direct weighted linear-majority hypergraph modularity. Exact supported combinations at the selected order, or orders 2 through the combined cap, are reconstructed from closed bundles and reference incidence. Each source contributes one unit divided equally across its included combinations. Ten deterministic initializations; direct vertex moves maximize hypergraph modularity, not a pair-projection objective. Initialization uses three Leiden two-section partitions, components, singletons, and seeded bundle assignments. A bounded local search is not a global optimum.";
  function canonicalMemberships(memberships) {
    const groups = /* @__PURE__ */ new Map();
    for (const [id, group] of Object.entries(memberships)) {
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(id);
    }
    return Object.fromEntries([...groups.values()].map((members) => members.sort()).sort((left, right) => right.length - left.length || left[0].localeCompare(right[0])).flatMap((members, position) => members.map((id) => [id, position + 1])));
  }
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
  var reward = (counts, size, objective = "linear") => {
    const maximum = Math.max(0, ...counts.values());
    return contribution(maximum, size, objective);
  };
  function expectedReward(size, fraction, objective) {
    if (fraction <= 0) return 0;
    if (fraction >= 1) return 1;
    let coefficient = 1, total = 0;
    for (let count = 0; count <= size; count++) {
      if (count > size / 2) total += contribution(count, size, objective) * coefficient * fraction ** count * (1 - fraction) ** (size - count);
      coefficient *= (size - count) / (count + 1);
    }
    return total;
  }
  function hypergraphModel(hyperedges, objective = "linear", resolution = 1) {
    if (!Number.isFinite(resolution) || resolution <= 0) throw new Error("Invalid hypergraph resolution");
    const degrees = /* @__PURE__ */ new Map(), sizes = /* @__PURE__ */ new Map(), incidence = /* @__PURE__ */ new Map();
    let weight = 0, volume = 0;
    for (const [position, edge] of hyperedges.entries()) {
      weight += edge.weight;
      volume += edge.members.length * edge.weight;
      sizes.set(edge.members.length, (sizes.get(edge.members.length) || 0) + edge.weight);
      for (const id of edge.members) {
        degrees.set(id, (degrees.get(id) || 0) + edge.weight);
        if (!incidence.has(id)) incidence.set(id, []);
        incidence.get(id).push(position);
      }
    }
    const taxCache = /* @__PURE__ */ new Map();
    const tax = (groupVolume) => {
      if (taxCache.has(groupVolume)) return taxCache.get(groupVolume);
      const value = resolution * [...sizes].reduce((sum, [size, edgeWeight]) => sum + edgeWeight * expectedReward(size, groupVolume / volume, objective), 0);
      if (taxCache.size < 5e4) taxCache.set(groupVolume, value);
      return value;
    };
    return { degrees, sizes, incidence, weight, volume, tax };
  }
  function hypergraphModularity(hyperedges, memberships, objective = "linear", resolution = 1) {
    if (!hyperedges.length) return 0;
    const model = hypergraphModel(hyperedges, objective, resolution), volumes = /* @__PURE__ */ new Map();
    for (const [id, degree] of model.degrees) {
      if (memberships[id] == null) throw new Error("Hypergraph partition is missing a member");
      volumes.set(memberships[id], (volumes.get(memberships[id]) || 0) + degree);
    }
    const observed = hyperedges.reduce((sum, edge) => {
      const counts = /* @__PURE__ */ new Map();
      for (const id of edge.members) counts.set(memberships[id], (counts.get(memberships[id]) || 0) + 1);
      return sum + edge.weight * reward(counts, edge.members.length, objective);
    }, 0);
    return (observed - [...volumes.values()].reduce((sum, value) => sum + model.tax(value), 0)) / model.weight;
  }
  function refineHypergraph(hyperedges, initial, seed = 42, maxPasses = 20, objective = "linear", resolution = 1) {
    if (!hyperedges.length) return { memberships: {}, quality: 0, passes: 0, converged: true };
    const model = hypergraphModel(hyperedges, objective, resolution), memberships = { ...initial }, ids = [...model.degrees.keys()].sort(), volumes = /* @__PURE__ */ new Map();
    for (const id of ids) volumes.set(memberships[id], (volumes.get(memberships[id]) || 0) + model.degrees.get(id));
    const counts = hyperedges.map((edge) => {
      const groups = /* @__PURE__ */ new Map();
      for (const id of edge.members) groups.set(memberships[id], (groups.get(memberships[id]) || 0) + 1);
      return groups;
    });
    let nextGroup = Math.max(...Object.values(memberships)) + 1, passes = 0, changed = true, random = seed;
    while (changed && passes < maxPasses) {
      changed = false;
      passes++;
      const order = [...ids];
      for (let position = order.length - 1; position > 0; position--) {
        random = Math.imul(random, 1664525) + 1013904223 >>> 0;
        const other = random % (position + 1);
        [order[position], order[other]] = [order[other], order[position]];
      }
      for (const id of order) {
        const original = memberships[id], degree = model.degrees.get(id), adjacent = model.incidence.get(id), candidates = /* @__PURE__ */ new Set([nextGroup]);
        for (const position of adjacent) for (const group of counts[position].keys()) candidates.add(group);
        let selected = original, bestGain = 1e-10 * model.weight;
        const removalTax = model.tax(volumes.get(original)) - model.tax(Math.max(0, volumes.get(original) - degree));
        for (const candidate of candidates) {
          if (candidate === original) continue;
          let gain = removalTax + model.tax(volumes.get(candidate) || 0) - model.tax((volumes.get(candidate) || 0) + degree);
          for (const position of adjacent) {
            const edge = hyperedges[position], groups = counts[position], before = reward(groups, edge.members.length, objective), oldCount = groups.get(original), newCount = groups.get(candidate) || 0;
            groups.set(original, oldCount - 1);
            groups.set(candidate, newCount + 1);
            gain += edge.weight * (reward(groups, edge.members.length, objective) - before);
            groups.set(original, oldCount);
            if (newCount) groups.set(candidate, newCount);
            else groups.delete(candidate);
          }
          if (gain > bestGain) {
            bestGain = gain;
            selected = candidate;
          }
        }
        if (selected === original) continue;
        changed = true;
        if (selected === nextGroup) nextGroup++;
        memberships[id] = selected;
        volumes.set(original, Math.max(0, volumes.get(original) - degree));
        volumes.set(selected, (volumes.get(selected) || 0) + degree);
        for (const position of adjacent) {
          const groups = counts[position], count = groups.get(original);
          if (count === 1) groups.delete(original);
          else groups.set(original, count - 1);
          groups.set(selected, (groups.get(selected) || 0) + 1);
        }
      }
    }
    return { memberships: canonicalMemberships(memberships), quality: hypergraphModularity(hyperedges, memberships, objective, resolution), passes, converged: !changed };
  }
  function moveState(hyperedges, initial, objective, resolution) {
    const model = hypergraphModel(hyperedges, objective, resolution), memberships = { ...initial }, volumes = /* @__PURE__ */ new Map();
    for (const [id, degree] of model.degrees) {
      if (memberships[id] == null) throw new Error("Hypergraph partition is missing a member");
      volumes.set(memberships[id], (volumes.get(memberships[id]) || 0) + degree);
    }
    const counts = hyperedges.map((edge) => {
      const groups = /* @__PURE__ */ new Map();
      for (const id of edge.members) groups.set(memberships[id], (groups.get(memberships[id]) || 0) + 1);
      return groups;
    });
    const proposal = (members) => {
      const original = memberships[members[0]], affected = /* @__PURE__ */ new Map();
      let degree = 0;
      for (const id of members) {
        if (memberships[id] !== original) throw new Error("A group move must have one origin");
        degree += model.degrees.get(id);
        for (const position of model.incidence.get(id)) affected.set(position, (affected.get(position) || 0) + 1);
      }
      const candidates = /* @__PURE__ */ new Set();
      for (const position of affected.keys()) for (const group of counts[position].keys()) if (group !== original) candidates.add(group);
      const gain = (candidate) => {
        if (candidate === original) return 0;
        let value = model.tax(volumes.get(original)) - model.tax(Math.max(0, volumes.get(original) - degree)) + model.tax(volumes.get(candidate) || 0) - model.tax((volumes.get(candidate) || 0) + degree);
        for (const [position, moved] of affected) {
          const groups = counts[position], edge = hyperedges[position], before = reward(groups, edge.members.length, objective), oldCount = groups.get(original), newCount = groups.get(candidate) || 0;
          groups.set(original, oldCount - moved);
          groups.set(candidate, newCount + moved);
          value += edge.weight * (reward(groups, edge.members.length, objective) - before);
          groups.set(original, oldCount);
          if (newCount) groups.set(candidate, newCount);
          else groups.delete(candidate);
        }
        return value;
      };
      const accept = (candidate) => {
        for (const id of members) memberships[id] = candidate;
        volumes.set(original, Math.max(0, volumes.get(original) - degree));
        volumes.set(candidate, (volumes.get(candidate) || 0) + degree);
        for (const [position, moved] of affected) {
          const groups = counts[position], remaining = groups.get(original) - moved;
          if (remaining) groups.set(original, remaining);
          else groups.delete(original);
          groups.set(candidate, (groups.get(candidate) || 0) + moved);
        }
      };
      return { original, degree, candidates, gain, accept };
    };
    return { model, memberships, proposal };
  }
  function seededOrder(values, random) {
    const order = [...values];
    for (let position = order.length - 1; position > 0; position--) {
      const other = Math.floor(random() * (position + 1));
      [order[position], order[other]] = [order[other], order[position]];
    }
    return order;
  }
  function searchHypergraph(hyperedges, initial, seed = 42, objective = "linear", resolution = 1, strategy = "group-moves") {
    if (!["group-moves", "annealing"].includes(strategy)) throw new Error("Unsupported extended hypergraph search");
    if (!hyperedges.length) return { memberships: {}, quality: 0, passes: 0, converged: true };
    let randomState = seed >>> 0;
    const random = () => {
      randomState = Math.imul(randomState, 1664525) + 1013904223 >>> 0;
      return randomState / 4294967296;
    };
    let best = refineHypergraph(hyperedges, initial, seed, 20, objective, resolution), totalPasses = best.passes;
    if (strategy === "group-moves") {
      let groupMerges = 0;
      for (let round = 0; round < 4; round++) {
        const state2 = moveState(hyperedges, best.memberships, objective, resolution), groups = /* @__PURE__ */ new Map();
        for (const [id, group] of Object.entries(state2.memberships)) {
          if (!groups.has(group)) groups.set(group, []);
          groups.get(group).push(id);
        }
        let merged = false;
        for (const group of seededOrder(groups.keys(), random)) {
          const members = groups.get(group);
          if (!members.length) continue;
          const move = state2.proposal(members);
          let target = group, bestGain = 1e-10 * state2.model.weight;
          for (const candidate of move.candidates) {
            const gain = move.gain(candidate);
            if (gain > bestGain) {
              target = candidate;
              bestGain = gain;
            }
          }
          if (target === group) continue;
          move.accept(target);
          groups.get(target).push(...members);
          groups.set(group, []);
          groupMerges++;
          merged = true;
        }
        const refined2 = refineHypergraph(hyperedges, state2.memberships, seed + round + 1, 20, objective, resolution);
        totalPasses += refined2.passes;
        if (refined2.quality > best.quality + 1e-12) best = refined2;
        else return { ...best, passes: totalPasses, groupRounds: round + 1, groupMerges, converged: !merged && refined2.converged };
      }
      return { ...best, passes: totalPasses, groupRounds: 4, groupMerges, converged: false };
    }
    const state = moveState(hyperedges, best.memberships, objective, resolution), ids = [...state.model.degrees.keys()].sort();
    let currentQuality = best.quality, nextGroup = Math.max(...Object.values(state.memberships)) + 1, acceptedDownhill = 0, bestMemberships = { ...state.memberships };
    for (let sweep = 0; sweep < 12; sweep++) {
      const temperature = 0.2 * (2e-3 / 0.2) ** (sweep / 11);
      for (const id of seededOrder(ids, random)) {
        const move = state.proposal([id]), candidates = [...move.candidates, nextGroup], target = candidates[Math.floor(random() * candidates.length)], gain = move.gain(target);
        if (gain <= 0 && random() >= Math.exp(gain / (temperature * move.degree))) continue;
        move.accept(target);
        if (target === nextGroup) nextGroup++;
        if (gain < 0) acceptedDownhill++;
        currentQuality += gain / state.model.weight;
        if (currentQuality > best.quality + 1e-12) {
          bestMemberships = { ...state.memberships };
          best = { ...best, quality: currentQuality };
        }
      }
    }
    const refined = refineHypergraph(hyperedges, bestMemberships, seed + 13, 20, objective, resolution);
    return { ...refined, passes: totalPasses + refined.passes, annealingSweeps: 12, acceptedDownhill, annealingSchedule: { initial: 0.2, final: 2e-3, scale: "moved vertex degree" }, budgetLimited: true };
  }
  function hypergraphPartition(graph, hyperedges, progress = () => {
  }, options = {}) {
    const objective = options.hypergraphObjective || "linear", initialSeed = options.seed || 42, hypergraphResolution = options.hypergraphResolution ?? 1, hypergraphSearch = options.hypergraphSearch || "mixed";
    if (!HYPERGRAPH_SEARCHES.includes(hypergraphSearch)) throw new Error("Unsupported direct hypergraph search");
    if (!Number.isFinite(hypergraphResolution) || hypergraphResolution <= 0) throw new Error("Invalid hypergraph resolution");
    if (!HYPERGRAPH_OBJECTIVES.includes(objective)) throw new Error("Unknown hypergraph objective");
    const pairs = /* @__PURE__ */ new Map(), ids = [...new Set(hyperedges.flatMap((edge) => edge.members))].sort();
    if (!ids.length) return { memberships: {}, algorithm: "hypergraph", label: "Hypergraph modularity", hypergraphObjective: objective, hypergraphResolution, hypergraphSearch, objective: objective + " hypergraph modularity", quality: 0, trials: 0, converged: true, limitations: "No supported combinations at this order." };
    for (const edge of hyperedges) for (let left = 0; left < edge.members.length; left++) for (let right = left + 1; right < edge.members.length; right++) {
      const members = [edge.members[left], edge.members[right]].sort(), key = JSON.stringify(members);
      if (!pairs.has(key)) pairs.set(key, { source: members[0], target: members[1], strength: 0 });
      pairs.get(key).strength += edge.weight / (edge.members.length - 1);
    }
    const projection = { nodes: ids.map((id) => ({ id })), links: [...pairs.values()] }, density = densityGrid(projection).density;
    const starts = [0.125, 0.5, 2].map((factor) => partition(projection, Math.max(1e-6, density * factor), 2).memberships);
    const component = {}, adjacency = new Map(ids.map((id) => [id, []]));
    for (const edge of projection.links) {
      adjacency.get(edge.source).push(edge.target);
      adjacency.get(edge.target).push(edge.source);
    }
    let group = 0;
    for (const id of ids) if (!component[id]) {
      component[id] = ++group;
      const stack = [id];
      while (stack.length) for (const other of adjacency.get(stack.pop())) if (!component[other]) {
        component[other] = group;
        stack.push(other);
      }
    }
    if (hypergraphSearch !== "leiden-seeded") starts.push(component, Object.fromEntries(ids.map((id, position) => [id, position + 1])));
    if (hypergraphSearch === "leiden-seeded") for (let trial = 3; trial < 10; trial++) starts.push(partition(projection, Math.max(1e-6, density * [0.125, 0.5, 2][trial % 3]), 2, initialSeed + trial * 10).memberships);
    for (let trial = 5; hypergraphSearch !== "leiden-seeded" && trial < 10; trial++) {
      const memberships = Object.fromEntries(ids.map((id, position) => [id, position + 1]));
      let random = 42 + trial;
      for (let position = 0; position < hyperedges.length; position++) {
        random = Math.imul(random, 1664525) + 1013904223 >>> 0;
        const edge = hyperedges[random % hyperedges.length];
        for (const id of edge.members) memberships[id] = ids.length + position + 1;
      }
      starts.push(memberships);
    }
    let best;
    const trials = [];
    for (const [position, initial] of starts.slice(0, options.trials || 10).entries()) {
      progress(`Hypergraph modularity: initialization ${position + 1}/${options.trials || 10}\u2026`);
      const result = ["group-moves", "annealing"].includes(hypergraphSearch) ? searchHypergraph(hyperedges, initial, initialSeed + position, objective, hypergraphResolution, hypergraphSearch) : refineHypergraph(hyperedges, initial, initialSeed + position, 20, objective, hypergraphResolution);
      trials.push({ seed: initialSeed + position, quality: result.quality, passes: result.passes, converged: result.converged, ...["group-moves", "annealing"].includes(hypergraphSearch) ? { groupRounds: result.groupRounds, groupMerges: result.groupMerges, annealingSweeps: result.annealingSweeps, acceptedDownhill: result.acceptedDownhill, budgetLimited: result.budgetLimited } : {} });
      if (!best || result.quality > best.quality) best = { ...result, seed: initialSeed + position };
    }
    const methodDescription = HYPERGRAPH_METHOD.replace("linear-majority", objective).replace("Initialization uses three Leiden two-section partitions, components, singletons, and seeded bundle assignments.", hypergraphSearch === "leiden-seeded" ? "Initialization uses ten Leiden-generated guesses on a temporary projection." : "Initialization uses three Leiden two-section partitions, components, singletons, and seeded bundle assignments.");
    const searchLabel = { mixed: "Direct local moves \xB7 mixed starts", "leiden-seeded": "Direct local moves \xB7 Leiden-generated starts", "group-moves": "Group moves \xB7 experimental", annealing: "Annealing \xB7 experimental" }[hypergraphSearch];
    const extra = hypergraphSearch === "group-moves" ? " After vertex refinement, greedily merge neighboring whole communities and refine vertices again, for at most four rounds. This is a custom direct-score group-move heuristic, not the published h-Louvain algorithm." : hypergraphSearch === "annealing" ? " After vertex refinement, run twelve cooling sweeps with degree-scaled temperatures 0.2 to 0.002, allowing downhill moves. Retain the best encountered partition and finish with greedy vertex refinement. Cooling is a fixed exploration budget, not a convergence guarantee." : "";
    return { ...best, algorithm: "hypergraph", label: "Hypergraph modularity", hypergraphObjective: objective, hypergraphResolution, hypergraphSearch, searchVersion: ["group-moves", "annealing"].includes(hypergraphSearch) ? "direct-search-v1" : void 0, searchLabel, objective: objective + " hypergraph modularity", qualityLabel: "Hypergraph modularity (same objective and resolution only)", trials: trials.length, trialResults: trials, method: methodDescription + extra + " Score = observed reward \u2212 resolution \xD7 expected reward; resolution 1 retains the original objective.", limitations: "Experimental resolution extension and bounded search, not a significance test, global optimum or validated theme. For annealing, converged refers only to the final greedy refinement, not global convergence. Nested combinations are dependent; source-normalized weights prevent counting each as independent evidence. Pairwise lines remain a visualization, not the optimization objective." };
  }

  // scripts/coupling-hypergraph.mjs
  var COUPLING_HYPERGRAPH_METHOD = "Each distinct shared reference is one hyperedge containing the eligible source articles citing it, with unit weight per reference. Duplicate references within a source count once. The source universe is restricted to articles with at least one threshold-eligible coupling edge. Pair thresholds select this universe; they do not prune whole reference groups. Lines retain thresholded shared-reference counts, not hyperedge weights. This differs from co-citation combinations and from cosine-weighted pair clustering.";
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

  // scripts/evidence-metrics.mjs
  function couplingPairs(articles, maximumPairs = Infinity) {
    const postings = /* @__PURE__ */ new Map(), counts = /* @__PURE__ */ new Map();
    for (const article of articles) {
      for (const reference of new Set(article.references || [])) {
        if (!postings.has(reference)) postings.set(reference, []);
        postings.get(reference).push(article.id);
      }
    }
    for (const [reference, sources] of postings) {
      for (let left = 0; left < sources.length; left++) for (let right = left + 1; right < sources.length; right++) {
        const pair = [sources[left], sources[right]].sort(), key = pair.join("|");
        if (!counts.has(key)) {
          if (counts.size >= maximumPairs) throw new Error("Coupling candidate universe exceeds its pair limit. Narrow the source scope; no partial network was used.");
          counts.set(key, { source: pair[0], target: pair[1], references: [] });
        }
        counts.get(key).references.push(reference);
      }
    }
    return [...counts.values()];
  }
  function couplingGraph(articles, pairs, minimumShared = 3, minimumCosine = 0.05, weights = null) {
    const count = (references) => references.reduce((sum, id) => sum + (weights ? weights[id] || 0 : 1), 0);
    const nodes = articles.map((article) => ({ ...article, referenceCount: new Set(article.references || []).size, cluster: 0 }));
    const lengths = new Map(nodes.map((node) => [node.id, count([...new Set(node.references || [])])])), links = [];
    for (const pair of pairs) {
      const shared = count(pair.references), denominator = Math.sqrt(lengths.get(pair.source) * lengths.get(pair.target));
      if (!denominator || shared < minimumShared) continue;
      const strength = shared / denominator;
      if (strength >= minimumCosine) links.push({ ...pair, count: shared, strength });
    }
    return { nodes, links, method: "coupling", minimumShared, minimumCosine, counting: "full", construction: { counting: "full", normalization: "cosine" }, normalization: "Shared distinct OpenAlex references / sqrt(available reference counts). All available references used; no citation-frequency cutoff." };
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
  function summarizeRecovery(samples) {
    const output = {}, quantile = (values, fraction) => {
      const sorted = [...values].sort((left, right) => left - right), offset = (sorted.length - 1) * fraction, index = Math.floor(offset);
      return sorted[index] + (sorted[Math.min(index + 1, sorted.length - 1)] - sorted[index]) * (offset - index);
    };
    for (const cluster of Object.keys(samples[0] || {})) {
      const records = samples.map((sample) => sample[cluster]), values = records.map((record) => record.jaccard);
      output[cluster] = { size: records[0].size, meanJaccard: values.reduce((sum, value) => sum + value, 0) / values.length, interval: [quantile(values, 0.1), quantile(values, 0.9)], meanRetention: records.reduce((sum, record) => sum + record.retention, 0) / records.length };
    }
    return output;
  }

  // scripts/network-reliability.mjs
  function resampleHyperedges(edges, weights, minimumSupport) {
    const retained = edges.filter((edge) => edge.articles.reduce((sum, id) => sum + (weights[id] || 0), 0) >= minimumSupport);
    const occurrences = /* @__PURE__ */ new Map();
    for (const edge of retained) for (const id of edge.articles) occurrences.set(id, (occurrences.get(id) || 0) + 1);
    return retained.map((edge) => ({ ...edge, weight: edge.articles.reduce((sum, id) => sum + (weights[id] || 0) / occurrences.get(id), 0) }));
  }
  function sourceSubset(nodes, sample) {
    let seed = 20261016 + sample;
    const shuffled = [...nodes].sort((left, right) => left.id.localeCompare(right.id));
    for (let position = shuffled.length - 1; position > 0; position--) {
      seed = Math.imul(seed, 1664525) + 1013904223 >>> 0;
      const other = seed % (position + 1);
      [shuffled[position], shuffled[other]] = [shuffled[other], shuffled[position]];
    }
    return shuffled.slice(0, Math.max(1, Math.floor(nodes.length * 0.9)));
  }
  function prepareReliability(graph, articleIds, sampleCount = 10, options = {}) {
    if (graph.collaboration) throw new Error("Citation bootstrap is not defined for collaboration actors. Use declared collaboration construction sensitivity.");
    if (graph.semantic) throw new Error("Citation bootstrap is not defined for semantic networks. Use text and threshold sensitivity.");
    if (![10, 50].includes(sampleCount)) throw new Error("Choose 10 or 50 resamples.");
    if (graph.clustering?.algorithm && !["leiden", "Leiden CPM", "infomap", "hypergraph", "sbm"].includes(graph.clustering.algorithm)) throw new Error("Reliability does not support this clustering algorithm.");
    const coupling = graph.method === "coupling" || graph.canvasKind === "coupling";
    if (options.mode && !["evidence", "sources"].includes(options.mode)) throw new Error("Unknown reliability mode");
    if (options.mode === "sources" && !coupling) throw new Error("Source subsampling is only available for coupling.");
    const algorithm = ["infomap", "hypergraph", "sbm"].includes(graph.clustering?.algorithm) ? graph.clustering.algorithm : "leiden";
    const ids = [...new Set(coupling ? graph.nodes.flatMap((node) => node.references || []) : articleIds)].sort();
    if (!ids.length) throw new Error("No resampling evidence is available.");
    if (!graph.nodes.some((node) => node.cluster > 0)) throw new Error("No linked clusters to assess.");
    const pairs = coupling ? couplingPairs(graph.nodes) : null;
    const wholeGroups = algorithm === "hypergraph" || graph.networkModel === "hypergraph";
    const hyperedges = wholeGroups && !coupling ? graph.hyperedges || buildHyperedges(graph, graph.bundles || []) : null;
    const original = Object.fromEntries(graph.nodes.map((node) => [node.id, node.cluster]));
    const results = [];
    let nonconverged = 0;
    return {
      algorithm,
      sampleCount,
      sample(index) {
        const weights = bootstrapWeights(ids, index + (options.seedOffset || 0));
        const selected = options.mode === "sources" ? sourceSubset(graph.nodes, index + (options.seedOffset || 0)) : graph.nodes;
        const selectedIds = new Set(selected.map((node) => node.id));
        const sampled = coupling ? couplingGraph(selected, options.mode === "sources" ? pairs.filter((edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target)) : pairs, graph.minimumShared, graph.minimumCosine, options.mode === "sources" ? null : weights) : resample(graph, weights, graph.bundles || []);
        sampled.clustering = graph.clustering;
        sampled.networkModel = graph.networkModel;
        if (!wholeGroups) return { graph: sampled };
        const edges = coupling ? couplingHyperedges(sampled).filter((edge) => options.mode === "sources" || weights[edge.reference] > 0).map((edge) => ({ ...edge, weight: options.mode === "sources" ? 1 : weights[edge.reference] })) : resampleHyperedges(hyperedges, weights, graph.minimumSupport || 5);
        sampled.hyperedges = edges;
        return { graph: sampled, hyperedges: edges };
      },
      partition(sample, progress) {
        if (algorithm === "infomap" || algorithm === "sbm") throw new Error("This method must use its own engine.");
        return algorithm === "hypergraph" ? hypergraphPartition(sample.graph, sample.hyperedges, progress, { ...graph.clustering, trials: 2 }) : partition(sample.graph, graph.resolution, 2);
      },
      record(result) {
        if (result.converged === false) nonconverged++;
        results.push(clusterRecovery(original, result.memberships));
      },
      finish() {
        if (results.length !== sampleCount) throw new Error("Incomplete resampling results cannot be reported as a completed check.");
        return {
          algorithm,
          method: algorithm === "leiden" ? "Leiden CPM" : algorithm === "infomap" ? "Infomap" : algorithm === "sbm" ? "Nested block model" : "Hypergraph modularity",
          samples: results.length,
          preliminary: results.length < 50,
          restarts: 2,
          seed: 20261016,
          nonconverged,
          settings: graph.clustering,
          networkModel: graph.networkModel,
          seedOffset: options.seedOffset || 0,
          mode: options.mode || "evidence",
          resamplingUnit: options.mode === "sources" ? "90% of source articles, without replacement; deliberately omitted members count as losses" : coupling ? "Distinct available reference IDs, with replacement (feature sensitivity, not source-sample stability)" : "Source articles, with replacement",
          clusters: summarizeRecovery(results),
          limitations: (options.mode === "sources" ? "Complementary source-sample sensitivity. Reference lists and thresholds remain fixed; 10% of sources are deliberately removed without replacement. Removed sources count as losses in recovery and retention, so these scores are not directly comparable to feature-bootstrap recovery." : coupling ? "Source selection is fixed. Reference bootstrap rebuilds shared-reference thresholds, cosine weights and eligible source membership. Hypergraph reference weights equal bootstrap multiplicities." : "Conditional on the selected reference universe and discovered evidence. Original pair candidates and exact hyperedges are fixed; support and source-normalized hyperedge weights are recomputed. No new combinations or neighbors are mined.") + " Two optimization starts per resample; optimization variability is included. This is a sensitivity diagnostic, not a confidence interval, significance test or thematic validation."
        };
      }
    };
  }

  // scripts/method-settings.mjs
  var SETTINGS_VERSION = 3;
  var SETTINGS_RULES = { recovery: 0.7, retention: 0.8, coverage: 0.5, starts: 0.8, plateau: 0.9, tiny: 0.2, largest: 0.65 };
  function settingsAlgorithm(graph) {
    const declared = graph?.clustering?.algorithm, algorithm = declared === "Leiden CPM" ? "leiden" : declared;
    return ["leiden", "infomap", "hypergraph"].includes(algorithm) ? algorithm : null;
  }
  function assertSettingsContext(graph) {
    if (!graph || typeof graph !== "object") throw Error("Open a completed supported citation analysis before searching settings.");
    if (graph.collaboration) throw Error("Citation settings search is not defined for collaboration actors.");
    if (graph.semantic || graph.canvasKind === "semantic") throw Error("Citation settings search is not defined for semantic maps. Use their text and construction controls.");
    if (graph.directed || graph.historiography || graph.method === "direct_citation" || graph.canvasKind === "historiography" || graph.networkModel === "direct-citation") throw Error("Citation history has no Leiden/Infomap/hypergraph settings search.");
    if (graph.trial || graph.clustering?.algorithm === "trial") throw Error("Experimental trial methods use their own settings; citation settings search is unavailable.");
    if (graph.temporalSelection) throw Error("Return to the full pinned map before searching analytical settings.");
    if (graph.networkModel && !["pairwise", "higher-order", "hypergraph"].includes(graph.networkModel)) throw Error("Settings search does not support this network representation.");
    const declared = graph.clustering?.algorithm, algorithm = settingsAlgorithm(graph);
    if (!["leiden", "infomap", "hypergraph"].includes(algorithm)) throw Error("Settings search is unavailable for " + (typeof declared === "string" ? declared : "an unspecified algorithm") + ". No Leiden fallback is applied.");
    if (algorithm === "hypergraph" && (!HYPERGRAPH_OBJECTIVES.includes(graph.clustering.hypergraphObjective || "linear") || !HYPERGRAPH_SEARCHES.includes(graph.clustering.hypergraphSearch || "mixed"))) throw Error("Settings search does not support this direct hypergraph objective/search.");
    return algorithm;
  }
  var isCouplingGraph = (graph) => graph.method === "coupling" || graph.canvasKind === "coupling";
  var membershipMap = (graph) => Object.fromEntries(graph.nodes.filter((node) => node.cluster > 0).map((node) => [node.id, node.cluster]));
  var mean = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  function settingsGrid(graph, options = {}) {
    if (graph.collaboration) throw Error("Citation settings search is not defined for collaboration actors.");
    const algorithm = assertSettingsContext(graph);
    if (algorithm === "hypergraph") {
      const hypergraphSearch = graph.clustering?.hypergraphSearch || "mixed";
      if (options.compareObjectives) return HYPERGRAPH_OBJECTIVES.map((hypergraphObjective2) => ({ hypergraphObjective: hypergraphObjective2, hypergraphSearch, hypergraphResolution: graph.clustering?.hypergraphResolution ?? 1, label: hypergraphObjective2 }));
      const hypergraphObjective = graph.clustering?.hypergraphObjective || "linear";
      return Array.from({ length: 9 }, (_, position) => 2 ** (-2 + position / 2)).map((hypergraphResolution) => ({ hypergraphObjective, hypergraphSearch, hypergraphResolution, label: hypergraphObjective + " \xB7 resolution " + Number(hypergraphResolution.toPrecision(5)) }));
    }
    if (algorithm === "infomap") return Array.from({ length: 13 }, (_, position) => 2 ** (-2 + position / 2)).map((markovTime) => ({ markovTime, label: "Markov time " + Number(markovTime.toPrecision(5)) }));
    const center = densityGrid(graph).density || 0.02;
    return [...new Set([graph.resolution || center / 4, ...Array.from({ length: 17 }, (_, position) => center * 2 ** (-5 + position / 2))].map((value) => Number(value.toPrecision(7))))].sort((left, right) => left - right).map((resolution) => ({ resolution, label: "CPM " + resolution.toPrecision(7) }));
  }
  function recoveryMetrics(report) {
    const clusters = Object.values(report.clusters), total = clusters.reduce((sum, cluster) => sum + cluster.size, 0);
    return { recovery: clusters.reduce((sum, cluster) => sum + cluster.size * cluster.meanJaccard, 0) / Math.max(1, total), retention: clusters.reduce((sum, cluster) => sum + cluster.size * cluster.meanRetention, 0) / Math.max(1, total) };
  }
  function materializeSetting(graph, candidate) {
    if (graph.collaboration) throw Error("Collaboration settings must rebuild their declared work\u2013actor projection.");
    const { memberships, ...metadata } = candidate.partition;
    const nodes = graph.nodes.map((node) => ({ ...node, cluster: memberships[node.id] || 0 }));
    const clusters = new Set(Object.values(memberships)).size;
    return invalidateScientificOutputs({
      ...graph,
      nodes,
      analysisId: null,
      derivedFromAnalysisId: graph.analysisId || graph.derivedFromAnalysisId,
      resolution: candidate.settings.resolution ?? null,
      autoCPM: null,
      comparison: null,
      themeDescriptions: null,
      clustering: { ...metadata, ...candidate.settings, networkModel: graph.networkModel, algorithm: candidate.algorithm, label: (candidate.algorithm === "leiden" ? "Leiden CPM" : candidate.algorithm === "infomap" ? "Infomap" : "Hypergraph modularity") + (graph.networkModel === "hypergraph" && candidate.algorithm !== "hypergraph" ? isIncidenceModel(graph) ? " \xB7 hypergraph incidence" : " \xB7 hypergraph legacy projection" : ""), limitations: graph.networkModel === "hypergraph" && candidate.algorithm !== "hypergraph" ? isIncidenceModel(graph) ? HYPERGRAPH_INCIDENCE : HYPERGRAPH_PROJECTION : metadata.limitations, clusters, communities: clusters },
      reliability: candidate.validation || candidate.screening || null,
      sourceReliability: candidate.sourceValidation || null,
      stats: { ...graph.stats, clusters, isolated_nodes: nodes.filter((node) => !node.cluster).length }
    });
  }
  function recommendation(candidates, algorithm, options = {}) {
    for (const candidate of candidates) {
      const measured = recoveryMetrics(candidate.validation || candidate.screening);
      candidate.metrics = { ...candidate.metrics, ...measured };
      candidate.reasons = [];
      const fail = (condition, reason) => {
        if (condition) candidate.reasons.push(reason);
      };
      fail(candidate.metrics.clusters < 2, "No subdivision");
      fail(candidate.metrics.clusters <= candidate.metrics.components, "Only disconnected components");
      fail(candidate.metrics.largest > SETTINGS_RULES.largest, "One group dominates");
      fail(candidate.metrics.coverage < SETTINGS_RULES.coverage, "Low source/reference coverage");
      fail(measured.recovery < SETTINGS_RULES.recovery, "Sensitive memberships");
      fail(measured.retention < SETTINGS_RULES.retention, "Low retained membership");
      fail(candidate.metrics.startAgreement < SETTINGS_RULES.starts, "Initialization-sensitive");
      fail(candidate.metrics.tiny > SETTINGS_RULES.tiny, "Excess tiny fragments");
      fail(candidate.partition.converged === false || (candidate.validation || candidate.screening).nonconverged > 0, "Optimization pass limit reached");
      if (candidate.sourceValidation) {
        const source = recoveryMetrics(candidate.sourceValidation);
        fail(source.recovery < 0.6 || source.retention < 0.7, "Sensitive to source selection");
      }
    }
    if (options.compareObjectives || algorithm === "hypergraph" && new Set(candidates.map((candidate) => candidate.settings.hypergraphObjective)).size > 1) return { status: "experimental_comparison", heading: "Experimental model comparison", ranges: [], chosen: null, explanation: "Objectives express different definitions of a community. Review results and explicitly apply a model; no automatic winner or cross-objective quality ranking." };
    const ranges = [];
    for (let start = 0; start < candidates.length; start++) {
      const band = [];
      for (const candidate of candidates.slice(start)) {
        if (candidate.reasons.length || band.some((other) => agreement(other.partition.memberships, candidate.partition.memberships) < SETTINGS_RULES.plateau)) break;
        band.push(candidate);
      }
      const value = (candidate) => candidate.settings.resolution || candidate.settings.markovTime || candidate.settings.hypergraphResolution;
      if (band.length >= 3 && value(band.at(-1)) / value(band[0]) >= 2 - 1e-5 && !ranges.some((range) => range.ids.includes(band[0].id))) ranges.push({ ids: band.map((candidate) => candidate.id), from: value(band[0]), to: value(band.at(-1)) });
    }
    const eligible = candidates.filter((candidate) => ranges.some((range) => range.ids.includes(candidate.id)) && !candidate.reasons.length);
    eligible.sort((left, right) => left.metrics.clusters - right.metrics.clusters || right.metrics.recovery - left.metrics.recovery);
    const validated = eligible.filter((candidate) => candidate.validation && candidate.validation.samples === 50);
    return {
      status: ranges.length ? validated.length ? ranges.length > 1 ? "several_scales" : "recommended_range" : "screening_range" : "no_clear_recommendation",
      heading: ranges.length ? validated.length ? ranges.length > 1 ? "Several useful scales" : "Recommended tested range" : "Promising range; validation pending" : "No clear recommendation",
      chosen: validated[0]?.id || null,
      shortlist: eligible.length ? [.../* @__PURE__ */ new Set([eligible[0].id, eligible.at(-1).id])] : [],
      ranges,
      explanation: "Overview-oriented heuristics: recovery \u226570%, retention \u226580%, coverage \u226550%, start agreement \u22650.80, introduced tiny-node share \u226420%, largest group \u226465%; ranges need three tested points spanning twofold with every-pair ARI \u22650.90. Coupling finalists also need source-subsample recovery \u226560% and retention \u226570%. Direct hypergraph tunes an experimental null-penalty multiplier within a fixed objective. Not CHAMP, proof of an optimum, or thematic validation. Stability between tested points is unknown."
    };
  }
  async function runSettingsSearch(graph, articleIds, infomap2, progress = () => {
  }, options = {}) {
    if (graph.collaboration) throw Error("Citation settings search is not defined for collaboration actors.");
    const algorithm = assertSettingsContext(graph), coupling = isCouplingGraph(graph);
    if (!graph.links.length) throw new Error("No eligible connections to tune.");
    const hyperedges = algorithm === "hypergraph" || graph.networkModel === "hypergraph" ? graph.hyperedges || (coupling ? couplingHyperedges(graph) : buildHyperedges(graph, graph.bundles || [])) : null;
    graph = { ...graph, hyperedges };
    async function solve(network, settings, trials = 2, seed = 42, edges = hyperedges) {
      if (algorithm === "leiden" && isIncidenceModel(network)) return infomap2(network, { ...settings, algorithm: "leiden", trials, seed });
      if (algorithm === "infomap") return infomap2(network, { ...settings, networkModel: graph.networkModel, trials, seed });
      if (algorithm === "hypergraph") {
        const result = hypergraphPartition(network, edges, () => {
        }, { ...settings, trials, seed });
        if (coupling) result.method = COUPLING_HYPERGRAPH_METHOD + " " + result.method;
        return result;
      }
      return partition(network, settings.resolution, trials, seed);
    }
    async function audit(candidate, count, seedOffset, mode = "evidence") {
      const configured = materializeSetting({ ...graph, hyperedges }, candidate);
      const session = prepareReliability(configured, articleIds, count, { seedOffset, mode });
      for (let position = 0; position < count; position++) {
        progress(candidate.settings.label + " \xB7 " + mode + " resample " + (position + 1) + "/" + count);
        const sample = session.sample(position);
        session.record(await solve(sample.graph, candidate.settings, 2, 42, sample.hyperedges));
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      return session.finish();
    }
    const candidates = [];
    for (const [position, settings] of (options.settings || settingsGrid(graph, options)).entries()) {
      progress("Testing " + settings.label + " \xB7 " + (position + 1));
      const result = await solve(graph, settings, 10);
      const starts = [];
      for (const seed of [101, 307, 701]) starts.push(await solve(graph, settings, 1, seed));
      const groups = /* @__PURE__ */ new Map();
      for (const cluster of Object.values(result.memberships)) groups.set(cluster, (groups.get(cluster) || 0) + 1);
      const fragments = fragmentation(graph, result.memberships), linked = Object.keys(result.memberships).length;
      const candidate = { id: position + 1, algorithm, settings, partition: result, metrics: { clusters: groups.size, coverage: linked / Math.max(1, graph.nodes.length), largest: Math.max(0, ...groups.values()) / Math.max(1, linked), tiny: fragments.introducedTinyNodeFraction, components: fragments.components, startAgreement: mean(starts.map((start) => agreement(result.memberships, start.memberships))) } };
      candidate.screening = await audit(candidate, 10, 0);
      candidates.push(candidate);
    }
    const screened = recommendation(candidates, algorithm, options);
    const selected = options.screenOnly ? [] : options.compareObjectives ? candidates.map((candidate) => candidate.id) : screened.shortlist || [];
    for (const candidate of candidates.filter((candidate2) => selected.includes(candidate2.id))) {
      candidate.validation = await audit(candidate, 50, 1e3);
      if (coupling) candidate.sourceValidation = await audit(candidate, 10, 2e3, "sources");
    }
    const finalRecommendation = recommendation(candidates, algorithm, options);
    if (finalRecommendation.status === "screening_range") {
      finalRecommendation.status = "no_clear_recommendation";
      finalRecommendation.heading = "No clear recommendation";
      finalRecommendation.explanation = "Fresh validation did not confirm a shortlisted representative. Remaining screening ranges are preliminary. " + finalRecommendation.explanation;
    }
    return {
      version: SETTINGS_VERSION,
      algorithm,
      networkModel: graph.networkModel,
      compareObjectives: !!options.compareObjectives,
      evidenceFixed: true,
      candidates,
      recommendation: finalRecommendation,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      screeningSamples: 10,
      validationSamples: 50,
      validationSeedOffset: 1e3,
      limitations: "Fresh resamples reduce reuse of screening draws but are not independent external validation. Coverage includes unlinked nodes. Source subsampling omits 10% intentionally and counts those losses, so do not compare its recovery directly with reference bootstrap. No null-model significance test. Hypergraph objectives are experimental; scores across objectives or methods are not comparable."
    };
  }
  async function evidenceSensitivity(graph, articleIds, infomap2, progress) {
    if (graph.collaboration) throw Error("Citation evidence resampling is not defined for collaboration actors.");
    const coupling = isCouplingGraph(graph), algorithm = assertSettingsContext(graph), current = graph.clustering || {};
    const settings = { resolution: graph.resolution, markovTime: current.markovTime || 1, hypergraphObjective: current.hypergraphObjective || "linear", hypergraphSearch: current.hypergraphSearch || "mixed", hypergraphResolution: current.hypergraphResolution ?? 1, label: "Fixed clustering settings" };
    let variants;
    if (coupling) {
      const pairs = couplingPairs(graph.nodes);
      variants = [{ shared: graph.minimumShared, cosine: graph.minimumCosine }, { shared: graph.minimumShared + 1, cosine: graph.minimumCosine }, { shared: graph.minimumShared, cosine: Math.min(1, graph.minimumCosine + 0.05) }].map((value) => ({ label: "Shared \u2265" + value.shared + ", cosine \u2265" + value.cosine, graph: { ...graph, ...couplingGraph(graph.nodes, pairs, value.shared, value.cosine), hyperedges: null } }));
    } else {
      const weights = Object.fromEntries(articleIds.map((id) => [id, 1]));
      variants = [graph.minimumSupport || 5, (graph.minimumSupport || 5) + 2].map((minimumSupport) => {
        const configured = { ...graph, minimumSupport };
        return { label: "Support \u2265" + minimumSupport, graph: { ...configured, ...resample(configured, weights, graph.bundles || []), hyperedges: null } };
      });
      if (graph.order === "all" && graph.maximumOrder > 2) {
        const configured = { ...graph, maximumOrder: 2 };
        variants.push({ label: "Combined cap 2", graph: { ...configured, ...resample(configured, weights, graph.bundles || []), hyperedges: null } });
      }
    }
    const results = [];
    for (const variant of variants) {
      if (!variant.graph.links.length) {
        results.push({ label: variant.label, edges: 0, clusters: 0, coverage: 0, agreement: null });
        continue;
      }
      const audit = await runSettingsSearch(variant.graph, articleIds, infomap2, progress, { settings: [settings], screenOnly: true });
      const candidate = audit.candidates[0];
      results.push({ label: variant.label, edges: variant.graph.links.length, clusters: candidate.metrics.clusters, coverage: candidate.metrics.coverage, recovery: candidate.metrics.recovery, agreement: agreement(membershipMap(graph), candidate.partition.memberships) });
    }
    return { algorithm, results, limitations: "Evidence sensitivity only; does not apply or recommend new thresholds. Stricter evidence uses the existing candidate universe, never mines new combinations. ARI compares shared linked nodes; inspect coverage alongside it. Order-cap comparison is available for combined views. Single-order changes must be selected explicitly on the canvas." };
  }

  // scripts/method-settings-worker.mjs
  var pending;
  var infomap = (graph, settings) => new Promise((resolve, reject) => {
    pending = { resolve, reject };
    self.postMessage({ [settings.algorithm === "leiden" ? "leiden" : "infomap"]: graph, settings });
  });
  self.onmessage = async (event) => {
    if (event.data.partition) {
      pending?.resolve(event.data.partition);
      pending = null;
      return;
    }
    if (event.data.failure) {
      pending?.reject(new Error(event.data.failure));
      pending = null;
      return;
    }
    try {
      const { graph, articleIds, action } = event.data;
      const execute = action === "sensitivity" ? evidenceSensitivity : runSettingsSearch;
      const result = await execute(graph, articleIds, infomap, (progress) => self.postMessage({ progress }), { compareObjectives: action === "objectives" });
      self.postMessage({ result });
    } catch (error) {
      self.postMessage({ error: analysisErrorMessage(error) });
    }
  };
})();

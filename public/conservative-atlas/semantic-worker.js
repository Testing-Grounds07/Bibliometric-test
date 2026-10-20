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

  // scripts/scientific-manifest.mjs
  var METHOD_REGISTRY = Object.freeze({
    leiden: { representations: ["pairwise", "higher-order", "hypergraph"], score: "CPM", parameters: ["resolution"], evidenceResampling: true },
    infomap: { representations: ["pairwise", "higher-order", "hypergraph"], score: "Map equation", parameters: ["markovTime"], evidenceResampling: true },
    hypergraph: { representations: ["hypergraph"], score: "Direct hypergraph modularity", parameters: ["hypergraphObjective", "hypergraphResolution", "hypergraphSearch"], evidenceResampling: true },
    sbm: { representations: ["pairwise", "higher-order"], score: "Nested model description length", parameters: ["selectedLevel"], evidenceResampling: true },
    trial: { representations: ["hypergraph"], score: "Family-specific experimental objective", parameters: ["family", "k", "seed", "starts"], evidenceResampling: true },
    direct_citation: { representations: ["directed"], score: null, parameters: ["core", "from", "through", "includeUndated", "limit"], evidenceResampling: false }
  });
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

  // scripts/semantic-network.mjs
  var SEMANTIC_VERSION = "semantic-networks-v1";
  var stopWords = new Set("a an and are as at be been being by can did do does for from had has have how if in into is it its may more most not of on or our than that the their them there these they this those through to under using was we were what when where which who will with within without would".split(" "));
  var cleanText = (value) => String(value || "").normalize("NFKC").replace(/\s+/g, " ").trim();
  var textIdentity = (works, kind) => scienceDigest(works.map((work) => ({ id: work.id, ...semanticText(work), topics: kind === "topics" ? work.topics || [] : void 0 })).sort((left, right) => left.id.localeCompare(right.id)));
  var vectorIdentity = (works, cache) => scienceDigest({ model: cache.model, revision: cache.revision, dimensions: cache.dimensions, encoding: cache.encoding, textScope: cache.textScope, documents: works.map((work) => ({ id: work.id, title: cleanText(cache.documents[work.id].title), abstract: cleanText(cache.documents[work.id].abstract), embedding: cache.documents[work.id].embedding })).sort((left, right) => left.id.localeCompare(right.id)) });
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
  function literalFeatures(text, field) {
    const tokens = [...text.matchAll(/[\p{L}\p{N}]+(?:[-’'][\p{L}\p{N}]+)*/gu)], features = /* @__PURE__ */ new Map();
    for (let offset = 0; offset < tokens.length; offset++) for (let size = 1; size <= 3 && offset + size <= tokens.length; size++) {
      const group = tokens.slice(offset, offset + size), words = group.map((token) => token[0].toLocaleLowerCase("en"));
      if (words.some((word) => stopWords.has(word) || word.length < 3 || /^\d+$/.test(word))) continue;
      const start = group[0].index, end = group.at(-1).index + group.at(-1)[0].length;
      if (size > 1 && /[^\p{L}\p{N}\s’'\-]/u.test(text.slice(start, end))) continue;
      const key = words.join(" ");
      if (!features.has(key)) features.set(key, { label: key, field, start, end, excerpt: text.slice(start, end) });
    }
    return features;
  }
  function featureIncidence(works, options = {}) {
    validateWorks(works);
    const settings = semanticSettings(options), features = /* @__PURE__ */ new Map();
    if (settings.kind === "embeddings") throw new Error("Embedding similarity is not a co-occurrence graph.");
    let withText = 0, withAbstract = 0, withTopics = 0, assignments = 0;
    for (const work of works) {
      const text = semanticText(work);
      if (text.title || text.abstract) withText++;
      if (text.abstract) withAbstract++;
      if (work.topics?.length) withTopics++;
      const items = /* @__PURE__ */ new Map();
      if (settings.kind === "terms") for (const [field, value] of Object.entries(text)) {
        if (field === "abstract" && settings.textScope === "titles") continue;
        for (const [key, evidence] of literalFeatures(value, field)) if (!items.has(key)) items.set(key, { label: evidence.label, score: 1, evidence });
      }
      else {
        for (const topic of work.topics || []) {
          if (typeof topic.id !== "string" || !topic.id || typeof topic.display_name !== "string" || !Number.isFinite(topic.score) || topic.score < settings.minimumScore || topic.score > 1) continue;
          items.set(topic.id, { label: topic.display_name, score: topic.score, taxonomy: { subfield: topic.subfield, field: topic.field, domain: topic.domain } });
        }
      }
      for (const [key, item] of items) {
        if (++assignments > 2e6 || features.size > 3e5) throw new Error("Term/topic extraction exceeds the bounded feature budget (300,000 candidates; two million source-feature assignments). Narrow the corpus or use titles only. No evidence was sampled.");
        if (!features.has(key)) features.set(key, { id: (settings.kind === "terms" ? "term:" : "topic:") + key, key, label: item.label, support: [], scores: {}, evidence: {}, taxonomy: item.taxonomy });
        const feature = features.get(key);
        feature.support.push(work.id);
        feature.scores[work.id] = item.score;
        if (item.evidence) feature.evidence[work.id] = item.evidence;
      }
    }
    const eligible = [...features.values()].filter((feature) => feature.support.length >= settings.minimumSupport).sort((left, right) => right.support.length - left.support.length || left.id.localeCompare(right.id));
    const selected = eligible.slice(0, settings.vocabularyLimit), coverage = { records: works.length, withText, withAbstract, withTopics, candidateFeatures: features.size, eligibleFeatures: eligible.length, displayedVocabulary: selected.length, vocabularyPolicy: "Top features by distinct source support; all source records contribute. The vocabulary limit is an explicit analytical definition, not a sample of works." };
    if (!selected.length) throw new Error(settings.kind === "topics" ? "No retained OpenAlex topic assignments meet these thresholds. Topics cannot be inferred from legacy concepts or titles." : "No literal terms meet these thresholds. Lower the minimum source support.");
    return { settings, features: selected, coverage };
  }
  function featureGraph(works, options) {
    const { settings, features, coverage } = featureIncidence(works, options), inverted = /* @__PURE__ */ new Map(), links = /* @__PURE__ */ new Map();
    for (const feature of features) for (const id of feature.support) {
      if (!inverted.has(id)) inverted.set(id, []);
      inverted.get(id).push(feature);
    }
    let contributions = 0;
    for (const [id, items] of inverted) for (let left = 0; left < items.length; left++) for (let right = left + 1; right < items.length; right++) {
      if (++contributions > 1e7) throw new Error("Co-occurrence exceeds 10 million feature-pair contributions. Reduce the vocabulary or narrow the evidence; nothing has been sampled.");
      const pair = [items[left], items[right]].sort((first, second) => first.id.localeCompare(second.id)), key = pair[0].id + "\0" + pair[1].id;
      if (!links.has(key)) links.set(key, { source: pair[0].id, target: pair[1].id, count: 0, rawSupport: 0, strength: 0, articles: [] });
      const edge = links.get(key);
      edge.count++;
      edge.rawSupport++;
      edge.strength += settings.kind === "topics" ? pair[0].scores[id] * pair[1].scores[id] : 1;
      edge.articles.push(id);
    }
    return { nodes: features.map((feature) => ({ ...feature, title: feature.label, articles: feature.support, citations: feature.support.length, cluster: 0, entityKind: settings.kind === "terms" ? "term" : "topic" })), links: [...links.values()].filter((edge) => edge.rawSupport >= settings.minimumSupport), semantic: { version: SEMANTIC_VERSION, ...settings, coverage, sourceIds: works.map((work) => work.id).sort(), classifierVersion: settings.kind === "topics" ? "Not retained by OpenAlex assignments; retrieval snapshot pins the observations." : null, evidencePolicy: settings.kind === "topics" ? "Machine-assigned OpenAlex topics; not literal author keywords. Edge weight sums score products; raw support counts distinct sources." : "Verbatim normalized one-to-three-word phrases; English stop words; no stemming, synonym merging or generated concepts. Spans refer to normalized source text." } };
  }
  function decodeEmbedding(value) {
    if (typeof value !== "string" || !/^[A-Za-z0-9+/]{512}$/.test(value)) throw new Error("Invalid signed-int8 MiniLM vector.");
    const bytes = atob(value), vector = new Float32Array(384);
    let norm = 0;
    for (let position = 0; position < 384; position++) {
      const code = bytes.charCodeAt(position), weight = code > 127 ? code - 256 : code;
      vector[position] = weight;
      norm += weight * weight;
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
      const document = cache.documents?.[work.id], current = semanticText(work);
      if (!current.title && !current.abstract) throw new Error("No genuine title or abstract text is retained for " + work.id + ".");
      if (!document || cleanText(document.title) !== current.title || cleanText(document.abstract) !== current.abstract) throw new Error("Embedding text is missing or stale for " + work.id + ". Prepare matching embeddings before running this view.");
      if (current.abstract) abstracts++;
      return { work, vector: decodeEmbedding(document.embedding) };
    });
    return { records, settings, model: { id: cache.model, revision: cache.revision, dimensions: cache.dimensions, encoding: cache.encoding, textScope: cache.textScope }, coverage: { records: works.length, withText: works.length, withAbstract: abstracts, vectors: records.length, missingVectors: 0, textMatch: "All source titles and abstracts exactly match the normalized cached input." } };
  }
  function embeddingGraph(works, cache, options, corpusId, progress) {
    const { records, settings, model, coverage } = embeddingEvidence(works, cache, options, corpusId), links = [];
    for (let left = 0; left < records.length; left++) {
      if (left % 50 === 0) progress("Comparing source text " + left + "/" + records.length);
      for (let right = left + 1; right < records.length; right++) {
        let similarity = 0;
        for (let dimension = 0; dimension < 384; dimension++) similarity += records[left].vector[dimension] * records[right].vector[dimension];
        if (similarity + 1e-7 < settings.minimumSimilarity) continue;
        links.push({ source: records[left].work.id, target: records[right].work.id, strength: Math.min(1, similarity), count: 1, rawSupport: null, similarity: Math.min(1, similarity), articles: [] });
        if (links.length > 1e5) throw new Error("More than 100,000 semantic edges. Raise minimum cosine similarity; no edges are silently discarded.");
      }
    }
    return { nodes: records.map(({ work }) => ({ ...work, title: semanticText(work).title, label: semanticText(work).title, year: work.year ?? work.publication_year ?? null, authors: typeof work.authors === "string" ? work.authors : (work.authorships || []).map((item) => item.author?.display_name).filter(Boolean).join("; "), citations: 1, articles: [], cluster: 0, entityKind: "source" })), links, semantic: { version: SEMANTIC_VERSION, ...settings, model, coverage, sourceIds: works.map((work) => work.id).sort(), evidencePolicy: "Cosine of real cached MiniLM document vectors. Similarity is not shared-reference support, agreement, significance or verified topical relevance." } };
  }
  function semanticHeadings(graph) {
    const result = {};
    for (const node of graph.nodes) if (node.cluster > 0) {
      if (!result[node.cluster]) result[node.cluster] = [];
      result[node.cluster].push(node);
    }
    return Object.fromEntries(Object.entries(result).map(([cluster, members]) => [cluster, { heading: members.slice().sort((left, right) => right.citations - left.citations || left.id.localeCompare(right.id)).slice(0, 2).map((node) => node.label || node.title).join(" \xB7 "), keywords: [], representatives: [], total: members.length, withText: members.length, withAbstract: 0, evidenceMode: "Deterministic feature heading", method: "Most-supported observed features; not AI-generated or a validated theme." }]));
  }
  function semanticSourceHeadings(graph, cache) {
    const groups = /* @__PURE__ */ new Map();
    for (const node of graph.nodes) if (node.cluster > 0) {
      if (!groups.has(node.cluster)) groups.set(node.cluster, []);
      groups.get(node.cluster).push(node);
    }
    return Object.fromEntries([...groups].map(([cluster, members]) => {
      const terms = /* @__PURE__ */ new Map();
      for (const node of members) for (const phrase of cache.documents[node.id].phrases || []) {
        if (!terms.has(phrase.text)) terms.set(phrase.text, { text: phrase.text, sources: [], score: 0 });
        const term = terms.get(phrase.text);
        term.sources.push({ id: node.id, evidence: phrase.evidence || [] });
        term.score += Math.max(0, phrase.semantic || 0);
      }
      const keywords = [...terms.values()].sort((left, right) => right.sources.length - left.sources.length || right.score - left.score || left.text.localeCompare(right.text)).slice(0, 5);
      return [cluster, { heading: keywords.slice(0, 2).map((term) => term.text).join(" \xB7 ") || members[0].title, keywords, representatives: members.slice(0, 3).map((node) => ({ id: node.id })), total: members.length, withText: members.length, withAbstract: members.filter((node) => cache.documents[node.id].abstract).length, evidenceMode: members.some((node) => cache.documents[node.id].abstract) ? "Titles + available abstracts" : "Title-only", method: "Immediate deterministic heading from observed cached source phrases; not an AI-generated theme.", model: cache.model, revision: cache.revision }];
    }));
  }
  async function buildSemanticGraph(works, options = {}, cache = null, context = {}, progress = () => {
  }) {
    const settings = semanticSettings(options), graph = settings.kind === "embeddings" ? embeddingGraph(works, cache, settings, context.sourceCorpusId, progress) : featureGraph(works, settings);
    const degrees = new Map(graph.nodes.map((node) => [node.id, 0]));
    for (const edge of graph.links) for (const id of [edge.source, edge.target]) degrees.set(id, degrees.get(id) + 1);
    for (const [position, node] of graph.nodes.entries()) Object.assign(node, { key: node.id, degree: degrees.get(node.id), x: Math.cos(position * 2.399963229728653) * 40 * Math.sqrt(position + 1), y: Math.sin(position * 2.399963229728653) * 40 * Math.sqrt(position + 1) });
    const fit = partition(graph, settings.resolution, 3, settings.seed);
    for (const node of graph.nodes) node.cluster = fit.memberships[node.id] || 0;
    Object.assign(graph, { canvasKind: "semantic", externalCorpus: context.externalCorpus === true, method: "semantic", entityKind: settings.kind === "embeddings" ? "source" : settings.kind === "terms" ? "term" : "topic", networkModel: "pairwise", order: 2, maximumOrder: 2, minimumSupport: settings.kind === "embeddings" ? 1 : settings.minimumSupport, normalization: settings.kind === "embeddings" ? "MiniLM cosine" : settings.kind === "topics" ? "classifier-score-products" : "raw co-occurrence", counting: "distinct-source-full", sourceCorpusId: context.sourceCorpusId, evidenceProvenance: context.evidenceProvenance, resolution: settings.resolution, clustering: { algorithm: "leiden", label: "Leiden CPM", resolution: settings.resolution, seed: settings.seed, restarts: 3, objective: "CPM" }, appliedSettings: { settings: { label: "Semantic network" } }, stats: { nodes: graph.nodes.length, edges: graph.links.length, clusters: fit.clusters, isolated_nodes: graph.nodes.filter((node) => !node.degree).length } });
    graph.semantic.textFingerprint = await textIdentity(works, settings.kind);
    if (settings.kind === "embeddings") graph.semantic.embeddingFingerprint = await vectorIdentity(works, cache);
    if (context.referenceGraph) graph.semantic.referenceScope = { nodes: context.referenceGraph.nodes.map((node) => ({ id: node.id, key: node.key || node.id, aliases: [...new Set([node.id, node.key, ...node.aliases || node.variants || []].filter((value) => typeof value === "string"))], label: node.label || node.title || node.id, cluster: node.cluster })), parentAnalysis: context.referenceGraph.scientificManifest?.fingerprints?.analysis || null };
    if (graph.entityKind !== "source") graph.themeDescriptions = semanticHeadings(graph);
    else graph.themeDescriptions = semanticSourceHeadings(graph, cache);
    return graph;
  }
  function commonSourceComparison(first, second) {
    const sourceGraph = (graph) => graph.entityKind === "source" || graph.canvasKind === "coupling";
    if (!sourceGraph(first) || !sourceGraph(second)) throw new Error("Partition comparison requires two source-article graphs; feature and cited-reference universes are not interchangeable.");
    const secondIds = new Set(second.nodes.map((node) => node.id)), common = first.nodes.filter((node) => secondIds.has(node.id)).map((node) => node.id).sort(), commonSet = new Set(common);
    const memberships = (graph) => new Map(graph.nodes.filter((node) => commonSet.has(node.id)).map((node) => [node.id, node.cluster > 0 ? String(node.cluster) : "unassigned:" + node.id]));
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
  async function semanticSensitivity(works, graph, cache, context, progress = () => {
  }) {
    if (!graph.semantic) throw new Error("A semantic parent graph is required.");
    if (await textIdentity(works, graph.semantic.kind) !== graph.semantic.textFingerprint) throw new Error("Pinned semantic source text/assignments changed. Build a new map rather than label this fixed-evidence sensitivity.");
    if (graph.semantic.supplementalText && context?.supplementalText?.checksum !== graph.semantic.supplementalText.checksum) throw new Error("Pinned supplemental prepared-text evidence changed or is unavailable.");
    if (graph.semantic.kind === "embeddings") {
      const validated = embeddingEvidence(works, cache, graph.semantic, context?.sourceCorpusId);
      if (JSON.stringify(validated.model) !== JSON.stringify(graph.semantic.model) || !graph.semantic.embeddingFingerprint || await vectorIdentity(works, cache) !== graph.semantic.embeddingFingerprint) throw new Error("Pinned embedding model revision/vector/text evidence changed. Rebuild rather than claim a fixed-model sensitivity check.");
    }
    const settings = graph.semantic, variants = settings.kind === "embeddings" ? [{ ...settings, minimumSimilarity: Math.max(0.1, settings.minimumSimilarity - 0.05) }, { ...settings, minimumSimilarity: Math.min(1, settings.minimumSimilarity + 0.05) }] : [{ ...settings, minimumSupport: Math.max(1, settings.minimumSupport - 1) }, { ...settings, minimumSupport: settings.minimumSupport + 1 }, ...settings.kind === "terms" ? [{ ...settings, textScope: settings.textScope === "titles" ? "titles-abstracts" : "titles" }] : [{ ...settings, minimumScore: Math.min(1, settings.minimumScore + 0.1) }]];
    const results = [];
    for (const options of variants) {
      progress("Checking semantic definition " + (results.length + 1) + "/" + variants.length);
      try {
        const candidate = await buildSemanticGraph(works, options, cache, context, progress), first = new Set(graph.nodes.map((node) => node.id)), shared = candidate.nodes.filter((node) => first.has(node.id)).length;
        results.push({ settings: semanticSettings(options), nodes: candidate.nodes.length, edges: candidate.links.length, sharedNodes: shared, nodeJaccard: shared / (graph.nodes.length + candidate.nodes.length - shared), comparison: graph.entityKind === "source" ? commonSourceComparison(graph, candidate) : null });
      } catch (problem) {
        results.push({ settings: semanticSettings(options), status: "unavailable", reason: problem.message });
      }
    }
    return semanticSensitivityReport(results, settings);
  }
  function semanticSensitivityReport(results, settings = {}) {
    const completed = results.filter((result) => result.status !== "unavailable").length;
    return { version: SEMANTIC_VERSION, status: completed === results.length && results.length ? "completed" : completed ? "partial" : "unavailable", attempted: results.length, completed, unavailable: results.length - completed, variants: results, fixedModel: settings.model || null, modelSensitivity: settings.kind === "embeddings" ? "Only the pinned cached model is available; no alternative model was computed or downloaded." : "No embedding model is used for literal-term or classifier-topic co-occurrence. Text/assignment observations remain pinned; no alternative classifier was computed.", limitation: "Bounded text/threshold/feature-definition sensitivity, not citation bootstrap, significance or proof of a best setting. Fixed CPM also changes effective scale when edge weights change." };
  }

  // scripts/semantic-worker.mjs
  self.onmessage = async (event) => {
    const { action, works, settings, cache, graph, context, supplementalText } = event.data;
    try {
      const progress = (message) => self.postMessage({ progress: message }), result = action === "sensitivity" ? await semanticSensitivity(works, graph, cache, { ...context, supplementalText }, progress) : await buildSemanticGraph(works, settings, cache, context, progress);
      if (action !== "sensitivity") result.semantic.supplementalText = supplementalText;
      self.postMessage({ result });
    } catch (problem) {
      self.postMessage({ error: analysisErrorMessage(problem) });
    }
  };
})();

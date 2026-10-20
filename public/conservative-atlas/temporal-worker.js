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

  // scripts/coupling-foundations.mjs
  function clusterFoundations(nodes, cluster) {
    const members = [...new Map(nodes.filter((node) => Number(node.cluster) === Number(cluster) && Number(cluster) > 0).map((node) => [node.id, node])).values()];
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
  function couplingCanvasGraph(source, scopeLabel = "All conservative source articles") {
    const graph = structuredClone(source || { nodes: [], links: [], minimumShared: 3, minimumCosine: 0.05, resolution: null });
    const degrees = new Map(graph.nodes.map((node) => [node.id, 0]));
    for (const edge of graph.links) for (const id of [edge.source, edge.target]) degrees.set(id, (degrees.get(id) || 0) + 1);
    graph.nodes = graph.nodes.map((node, position) => ({
      ...node,
      label: node.title || node.id,
      key: node.id,
      citations: new Set(node.references || []).size,
      degree: degrees.get(node.id),
      articles: [],
      variants: node.variants || [],
      rules: node.rules || [],
      x: Math.cos(position * 2.399963229728653) * 40 * Math.sqrt(position + 1),
      y: Math.sin(position * 2.399963229728653) * 40 * Math.sqrt(position + 1)
    }));
    const foundations = new Map([...new Set(graph.nodes.map((node) => node.cluster).filter((cluster) => cluster > 0))].map((cluster) => [cluster, clusterFoundations(graph.nodes, cluster)]));
    for (const node of graph.nodes) {
      const group = foundations.get(node.cluster), references = new Set(node.references || []), foundation = group?.references.find((reference) => references.has(reference.id));
      node.foundation = foundation ? { id: foundation.id, count: foundation.count, share: foundation.share, members: group.members } : null;
    }
    return {
      ...graph,
      canvasKind: "coupling",
      method: "coupling",
      scopeLabel,
      order: 2,
      minimumSupport: graph.minimumShared,
      clustering: { ...graph.clustering, label: "Coupling \xB7 " + (graph.clustering?.label || "Leiden CPM") },
      stats: { nodes: graph.nodes.length, edges: graph.links.length, clusters: new Set(graph.nodes.map((node) => node.cluster).filter((cluster) => cluster > 0)).size, isolated_nodes: graph.nodes.filter((node) => !node.degree).length }
    };
  }

  // scripts/temporal-series.mjs
  var TEMPORAL_VERSION = "publication-windows-v1";
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
  function temporalSupport(graph) {
    if (graph.temporalSelection) throw Error("Return to the full pinned map before computing another analysis. Completed windows are read-only analytical views.");
    if (graph.collaboration || graph.semantic || graph.trial || graph.directed || graph.historiography || graph.networkModel === "hypergraph" || (graph.order ?? 2) !== 2 || !["leiden", "Leiden CPM", void 0].includes(graph.clustering?.algorithm)) throw Error("Window tracking currently supports pairwise Leiden co-citation and source coupling only. Other methods, higher-order re-mining and joint temporal optimization are not implemented; no fallback is used.");
    if (graph.nodes.length > 3e3) throw Error("Window tracking supports up to 3,000 analytical nodes. Narrow the analytical scope; no nodes are sampled.");
    if (graph.links.length > 1e5 || graph.nodes.reduce((sum, node) => sum + (node.articles?.length || node.references?.length || 0), 0) > 5e5) throw Error("The parent exceeds 100,000 edges or 500,000 retained incidences. Narrow the analytical scope; no evidence is sampled.");
    if (graph.extensionFilter || graph.construction?.counting === "event-fractional" || graph.counting === "fractional" || graph.normalization && !(graph.method === "coupling" || graph.canvasKind === "coupling") && !["association_strength", "association", "Association strength"].includes(graph.normalization)) throw Error("This parent has a filtered or alternative construction. Window tracking currently preserves full-count association-strength co-citation or cosine coupling only; restore that baseline first.");
    if (graph.method !== "coupling" && graph.canvasKind !== "coupling" && graph.nodes.some((node) => !Array.isArray(node.articles))) throw Error("Pinned source-to-reference incidence is required for every parent reference.");
  }
  function windowTransitions(first, second) {
    const left = new Map(first.nodes.map((node) => [node.id, node.cluster])), right = new Map(second.nodes.map((node) => [node.id, node.cluster])), common = [...left.keys()].filter((id) => right.has(id)), leftGroups = /* @__PURE__ */ new Map(), rightGroups = /* @__PURE__ */ new Map(), pairs = /* @__PURE__ */ new Map();
    for (const [id, cluster] of left) if (cluster > 0) {
      if (!leftGroups.has(cluster)) leftGroups.set(cluster, []);
      leftGroups.get(cluster).push(id);
    }
    for (const [id, cluster] of right) if (cluster > 0) {
      if (!rightGroups.has(cluster)) rightGroups.set(cluster, []);
      rightGroups.get(cluster).push(id);
    }
    for (const id of common) if (left.get(id) > 0 && right.get(id) > 0) {
      const key = JSON.stringify([left.get(id), right.get(id)]);
      if (!pairs.has(key)) pairs.set(key, []);
      pairs.get(key).push(id);
    }
    const overlaps = [...pairs].map(([key, members]) => {
      const [from, to] = JSON.parse(key), fromSize = leftGroups.get(from).length, toSize = rightGroups.get(to).length;
      return { from, to, members: members.sort(), count: members.length, fromSize, toSize, fromShare: members.length / fromSize, toShare: members.length / toSize, jaccard: members.length / (fromSize + toSize - members.length) };
    }).sort((a, b) => b.count - a.count || a.from - b.from || a.to - b.to);
    return { commonIds: common.sort(), commonAssignedBoth: common.filter((id) => left.get(id) > 0 && right.get(id) > 0).length, firstSize: left.size, secondSize: right.size, firstOnly: [...left.keys()].filter((id) => !right.has(id)).sort(), secondOnly: [...right.keys()].filter((id) => !left.has(id)).sort(), firstUnassigned: common.filter((id) => !(left.get(id) > 0)).length, secondUnassigned: common.filter((id) => !(right.get(id) > 0)).length, overlaps, splits: [...leftGroups.keys()].filter((cluster) => overlaps.filter((edge) => edge.from === cluster).length > 1), merges: [...rightGroups.keys()].filter((cluster) => overlaps.filter((edge) => edge.to === cluster).length > 1), unmatchedEarlier: [...leftGroups].filter(([cluster]) => !overlaps.some((edge) => edge.from === cluster)).map(([cluster, members]) => ({ cluster, members })), unmatchedLater: [...rightGroups].filter(([cluster]) => !overlaps.some((edge) => edge.to === cluster)).map(([cluster, members]) => ({ cluster, members })), interpretation: "All positive overlaps are retained; split/merge candidates mean more than one nonzero overlap, not validated lineage. Group numbers/colors are local to each window. Unassigned nodes are never a community; common-node coverage accompanies comparisons." };
  }
  function periodGraph(parent, works, settings, from, to) {
    const coupling = parent.canvasKind === "coupling" || parent.method === "coupling", parentIds = new Set(parent.nodes.map((node) => node.id)), selected = works.filter((work) => {
      const year = publicationYear(work);
      return (!coupling || parentIds.has(work.id)) && year !== null && year >= from && year <= to;
    }), selectedIds = new Set(selected.map((work) => work.id));
    let next;
    if (coupling) {
      const articles = selected.map((work) => ({ ...parent.nodes.find((node) => node.id === work.id), ...work, title: work.title || work.display_name || work.id, authors: work.authors || parent.nodes.find((node) => node.id === work.id)?.authors || (work.authorships || []).map((authorship) => authorship.author?.display_name).filter(Boolean).join("; ") || "Author metadata unavailable", referenceMetadata: parent.nodes.find((node) => node.id === work.id)?.referenceMetadata || "Pinned available reference list; completeness unknown", year: publicationYear(work), references: [...new Set(work.references || work.referenced_works || [])] })), postings = /* @__PURE__ */ new Map();
      let incidences = 0;
      for (const article of articles) for (const reference of article.references) {
        if (++incidences > 5e5) throw Error("A coupling window exceeds 500,000 retained reference incidences; narrow the source scope.");
        postings.set(reference, (postings.get(reference) || 0) + 1);
      }
      if ([...postings.values()].reduce((sum, count) => sum + count * (count - 1) / 2, 0) > 3e6) throw Error("A coupling window exceeds three million shared-reference pair contributions. Narrow the source scope; no network was sampled.");
      const pairs = couplingPairs(articles, 3e6);
      next = couplingCanvasGraph({ ...structuredClone(parent), ...couplingGraph(articles, pairs, parent.minimumShared || 3, parent.minimumCosine ?? 0.1) }, "Publication window " + from + "\u2013" + to);
      if (settings.universe === "fixed") {
        const periodNodes = new Map(next.nodes.map((node) => [node.id, node]));
        next.nodes = parent.nodes.map((node) => periodNodes.get(node.id) || { ...node, cluster: 0, degree: 0, references: [], outsideWindow: true });
      }
    } else {
      const nodes = parent.nodes.map((node) => ({ ...node, articles: [...new Set(node.articles || [])].filter((id) => selectedIds.has(id)), cluster: 0 }));
      for (const node of nodes) node.citations = node.articles.length;
      const retained = settings.universe === "fixed" ? nodes : nodes.filter((node) => node.citations >= (parent.threshold || 1)), postings = /* @__PURE__ */ new Map(), pairs = /* @__PURE__ */ new Map();
      for (const node of retained) for (const id of node.articles) {
        if (!postings.has(id)) postings.set(id, []);
        postings.get(id).push(node.id);
      }
      let contributions = 0;
      for (const [id, members] of postings) for (let left = 0; left < members.length; left++) for (let right = left + 1; right < members.length; right++) {
        if (++contributions > 3e6) throw Error("A window exceeds three million source-pair contributions; narrow the analytical scope. No edges are truncated.");
        const key = JSON.stringify([members[left], members[right]]);
        if (!pairs.has(key)) pairs.set(key, { source: members[left], target: members[right], articles: [] });
        pairs.get(key).articles.push(id);
      }
      const byId = new Map(retained.map((node) => [node.id, node])), links = [...pairs.values()].filter((edge) => edge.articles.length >= (parent.minimumSupport || 5)).map((edge) => ({ ...edge, count: edge.articles.length, rawSupport: edge.articles.length, strength: edge.articles.length / (byId.get(edge.source).citations * byId.get(edge.target).citations) }));
      next = { ...structuredClone(parent), nodes: retained, links, normalization: "association_strength", counting: "distinct-source-full", construction: { counting: "full", normalization: "association_strength" } };
    }
    for (const key of ["temporalSeries", "temporalSelection", "burstReport", "reliability", "sourceReliability", "settingsSearch", "evidenceSensitivity", "autoCPM", "themeDescriptions", "generatedDescriptions", "themeError", "comparison", "extensionResults", "extensionAudit", "extensionFilter"]) delete next[key];
    invalidateScientificOutputs(next);
    next.bundles = [];
    next.hyperedges = null;
    next.order = 2;
    next.maximumOrder = 2;
    next.networkModel = "pairwise";
    next.temporal = { from, to, sourceCount: selected.length, sourceIds: [...selectedIds].sort(), universe: settings.universe, referenceUniverse: coupling ? "Source articles published within the period; references are their full retained bibliographies." : "Parent cited-reference scope; changing universe additionally reapplies parent citation cutoff within each period.", interpretation: "Source publication time, not historical database observation time. All windows use the same pinned retrieved evidence; later metadata corrections and citation matching are not reconstructed as-of each year." };
    const degrees = new Map(next.nodes.map((node) => [node.id, 0]));
    for (const edge of next.links) for (const id of [edge.source, edge.target]) degrees.set(id, degrees.get(id) + 1);
    for (const node of next.nodes) node.degree = degrees.get(node.id) || 0;
    return next;
  }
  async function buildTemporalSeries(parent, works, options = {}, progress = () => {
  }) {
    temporalSupport(parent);
    const settings = temporalSettings({ ...options, resolution: options.resolution ?? parent.resolution ?? 0.02, seed: options.seed ?? parent.clustering?.seed ?? 42 }), ids = new Set(works.map((work) => work.id));
    if (!works.length || works.length > 5e4 || ids.size !== works.length) throw Error("Supply 1\u201350,000 distinct pinned source articles; no source sampling is used.");
    const windows = [];
    let edges = 0, totalNodes = 0;
    for (let from = settings.from; from <= settings.to; from += settings.step) {
      const to = Math.min(settings.to, from + settings.width - 1);
      progress("Rebuilding publication window " + (windows.length + 1) + " \xB7 " + from + "\u2013" + to);
      const graph = periodGraph(parent, works, settings, from, to), fit = partition(graph, settings.resolution, settings.starts, settings.seed);
      for (const node of graph.nodes) node.cluster = fit.memberships[node.id] || 0;
      graph.resolution = settings.resolution;
      graph.clustering = { algorithm: "leiden", label: "Leiden CPM", resolution: settings.resolution, starts: settings.starts, seed: settings.seed, clusters: fit.clusters, objective: "CPM" };
      graph.fragmentation = fragmentation(graph, fit.memberships);
      graph.appliedSettings = { settings: { label: "Pinned temporal window" } };
      graph.scopeLabel = "Sources published " + from + "\u2013" + to;
      graph.stats = { nodes: graph.nodes.length, edges: graph.links.length, clusters: new Set(graph.nodes.filter((node) => node.cluster > 0).map((node) => node.cluster)).size, isolated_nodes: graph.nodes.filter((node) => !node.cluster).length };
      edges += graph.links.length;
      totalNodes += graph.nodes.length;
      if (edges > 3e5 || totalNodes > 3e4) throw Error("The complete series exceeds 300,000 stored edges or 30,000 node observations. Use fewer windows/narrower scope; no output was sampled.");
      windows.push({ from, to, truncatedBoundary: to - from + 1 < settings.width, sourceCount: graph.temporal.sourceCount, status: graph.temporal.sourceCount ? "completed" : "no-exposure", graph });
    }
    const known = works.filter((work) => publicationYear(work) !== null), unknown = works.filter((work) => publicationYear(work) === null), selected = known.filter((work) => publicationYear(work) >= settings.from && publicationYear(work) <= settings.to);
    const parentGraph = structuredClone(parent);
    delete parentGraph.temporalSeries;
    delete parentGraph.temporalSelection;
    delete parentGraph.burstReport;
    const evidenceDate = parent.evidenceProvenance?.retrievedAt || parent.scientificManifest?.evidence?.retrievedAt || null, observationYear = evidenceDate && Number.isFinite(Date.parse(evidenceDate)) ? new Date(evidenceDate).getUTCFullYear() : null, latestPublicationYear = known.length ? Math.max(...known.map(publicationYear)) : null, partialFrom = observationYear ?? latestPublicationYear;
    for (const window of windows) window.potentiallyPartial = partialFrom !== null && window.to >= partialFrom;
    return { version: TEMPORAL_VERSION, settings, parentGraph, evidenceDate, latestPeriod: { observationYear, latestPublicationYear, partialFrom, warning: evidenceDate ? "The retrieval year and later publication years may be partial or future-dated; temporal windows include them explicitly." : "Evidence date is unknown. The latest observed publication year may be partial; temporal windows include it explicitly." }, evidence: parent.evidenceProvenance || null, evidenceFingerprint: await scienceDigest(works.map((work) => ({ id: work.id, year: publicationYear(work), references: [...new Set(work.references || work.referenced_works || [])].sort() })).sort((a, b) => a.id.localeCompare(b.id))), coverage: { sources: works.length, knownYear: known.length, unknownYear: unknown.length, unknownYearIds: unknown.map((work) => work.id), insideBoundary: selected.length, outsideBoundary: known.length - selected.length, parentNodes: parent.nodes.length }, windows, transitions: windows.slice(1).map((window, index) => ({ fromWindow: index, toWindow: index + 1, ...windowTransitions(windows[index].graph, window.graph) })), limitation: "Independent fixed-setting Leiden fits, not joint temporal Leiden, causal evolution or a stability-selected optimum. CPM has the same numeric value and mean-edge scaling in each window; density and node universe still change. Rolling windows overlap and are not independent. Fixed co-citation scope omits references outside the parent selection; changing scope reselects only within that parent scope." };
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

  // scripts/publication-bursts.mjs
  var BURST_VERSION = "kleinberg-batched-publications-v1";
  function burstSettings(options = {}) {
    const settings = { kind: options.kind || "terms", from: Number(options.from), to: Number(options.to), width: Number(options.width ?? 1), scale: Number(options.scale ?? 2), penalty: Number(options.penalty ?? 1), states: Number(options.states ?? 3), minimumSupport: Number(options.minimumSupport ?? 3), vocabularyLimit: Number(options.vocabularyLimit ?? 100), minimumScore: Number(options.minimumScore ?? 0.3), textScope: options.textScope || "titles", excludeLatest: options.excludeLatest !== false };
    if (!["terms", "topics", "references"].includes(settings.kind) || !Number.isInteger(settings.from) || !Number.isInteger(settings.to) || settings.from < 1500 || settings.to > 2100 || settings.to < settings.from || settings.to - settings.from > 100 || !Number.isInteger(settings.width) || settings.width < 1 || settings.width > 10 || !Number.isFinite(settings.scale) || settings.scale <= 1 || settings.scale > 4 || !Number.isFinite(settings.penalty) || settings.penalty <= 0 || settings.penalty > 10 || !Number.isInteger(settings.states) || settings.states < 1 || settings.states > 5 || !Number.isInteger(settings.minimumSupport) || settings.minimumSupport < 1 || !Number.isInteger(settings.vocabularyLimit) || settings.vocabularyLimit < 2 || settings.vocabularyLimit > 200) throw Error("Choose bounded feature/year settings: up to 100 years, 1\u201310-year bins, scale >1\u20134, penalty >0\u201310, 1\u20135 elevated states and at most 200 features.");
    return settings;
  }
  function fitBurstStates(periods, options = {}) {
    if (!Number.isFinite(options.scale ?? 2) || (options.scale ?? 2) <= 1 || !Number.isFinite(options.penalty ?? 1) || (options.penalty ?? 1) <= 0 || !Number.isInteger(options.states ?? 3) || (options.states ?? 3) < 1 || (options.states ?? 3) > 5) throw Error("Use a multiplier above one, positive transition penalty and one to five elevated states.");
    const scale = options.scale ?? 2, penalty = options.penalty ?? 1, maxStates = options.states ?? 3, observed = periods.filter((period) => period.exposure > 0), exposure = observed.reduce((sum, period) => sum + period.exposure, 0), hits = observed.reduce((sum, period) => sum + period.count, 0), base = exposure ? hits / exposure : null;
    if (periods.some((period) => !Number.isInteger(period.count) || period.count < 0 || !Number.isInteger(period.exposure) || period.exposure < 0 || period.count > period.exposure)) throw Error("Burst counts must be distinct document successes within known document exposure.");
    if (observed.length < 5 || hits < 3 || !base || base >= 1) return { status: "unavailable", reason: observed.length < 5 ? "At least five exposed periods are required." : hits < 3 ? "At least three source documents containing this feature are required." : "The feature has no variation against exposure.", baseRate: base, states: periods.map(() => null), intervals: [] };
    const probabilities = [base];
    for (let state = 1; state <= maxStates; state++) {
      const probability = base * scale ** state;
      if (probability > 1) break;
      probabilities.push(probability);
    }
    if (probabilities.length < 2) return { status: "unavailable", reason: "No elevated state has probability at most one for this baseline and scale.", baseRate: base, states: periods.map(() => null), intervals: [] };
    const states = periods.map(() => null), cost = (period, probability) => probability === 1 ? period.count === period.exposure ? 0 : Infinity : -period.count * Math.log(probability) - (period.exposure - period.count) * Math.log1p(-probability), transition = penalty * Math.log(observed.length);
    for (let start = 0; start < periods.length; ) {
      if (!periods[start].exposure) {
        start++;
        continue;
      }
      let end = start;
      while (end < periods.length && periods[end].exposure) end++;
      let previous = probabilities.map((_, state2) => state2 ? Infinity : 0);
      const back = [];
      for (let offset = start; offset < end; offset++) {
        const next = [], paths = [];
        for (let state2 = 0; state2 < probabilities.length; state2++) {
          let best = Infinity, source = 0;
          for (let old = 0; old < probabilities.length; old++) {
            const candidate = previous[old] + Math.max(0, state2 - old) * transition;
            if (candidate < best) {
              best = candidate;
              source = old;
            }
          }
          next[state2] = best + cost(periods[offset], probabilities[state2]);
          paths[state2] = source;
        }
        previous = next;
        back.push(paths);
      }
      let state = previous.indexOf(Math.min(...previous));
      for (let offset = end - 1; offset >= start; offset--) {
        states[offset] = state;
        state = back[offset - start][state];
      }
      start = end;
    }
    const intervals = [];
    for (let level = 1; level < probabilities.length; level++) {
      let start = null;
      for (let offset = 0; offset <= periods.length; offset++) {
        if (offset < periods.length && states[offset] >= level && states[offset] !== null) {
          if (start === null) start = offset;
        } else if (start !== null) {
          const selected = periods.slice(start, offset), gain = selected.reduce((sum, period) => sum + cost(period, base) - cost(period, probabilities[level]), 0);
          intervals.push({ level, from: periods[start].from, to: periods[offset - 1].to, sourceCount: selected.reduce((sum, period) => sum + period.count, 0), exposure: selected.reduce((sum, period) => sum + period.exposure, 0), emissionGain: gain, probability: probabilities[level] });
          start = null;
        }
      }
    }
    return { status: "completed", baseRate: base, probabilities, states, intervals, transitionPerUpwardLevel: transition };
  }
  function referenceFeatures(graph, works, minimumSupport, limit) {
    if (graph.collaboration || graph.semantic || graph.canvasKind === "coupling" || graph.method === "coupling") throw Error("Cited-reference bursts require a parent co-citation reference scope. Return to co-citation first; source and reference nodes are not interchangeable.");
    const known = new Set(works.map((work) => work.id));
    return graph.nodes.map((node) => ({ id: node.id, label: node.label || node.title || node.id, support: [...new Set(node.articles || [])].filter((id) => known.has(id)) })).filter((feature) => feature.support.length >= minimumSupport).sort((a, b) => b.support.length - a.support.length || a.id.localeCompare(b.id)).slice(0, limit);
  }
  function burstRows(features, works, settings, evidenceDate, availableIds) {
    const observationYear = evidenceDate && Number.isFinite(Date.parse(evidenceDate)) ? new Date(evidenceDate).getUTCFullYear() : null, known = works.filter((work) => publicationYear(work) !== null), latest = known.length ? Math.max(...known.map(publicationYear)) : null, partialYear = observationYear ?? latest, excludedYear = settings.excludeLatest ? partialYear : null, dated = new Map(known.map((work) => [work.id, publicationYear(work)])), periods = [];
    for (let from = settings.from; from <= settings.to; from += settings.width) {
      const to = Math.min(settings.to, from + settings.width - 1), allIds = known.filter((work) => {
        const year = publicationYear(work);
        return year >= from && year <= to && !(excludedYear !== null && year >= excludedYear);
      }).map((work) => work.id), metadataIds = allIds.filter((id) => availableIds.has(id)), ids = metadataIds.length ? settings.denominator === "available-metadata" ? metadataIds : allIds : [], containsExcluded = excludedYear !== null && excludedYear >= from && excludedYear <= to;
      periods.push({ from, to, exposure: ids.length, allSourceExposure: allIds.length, availableMetadata: metadataIds.length, unavailableMetadata: allIds.length - metadataIds.length, sourceIds: ids, partialBoundary: to - from + 1 < settings.width, excludedLatestYear: containsExcluded ? excludedYear : null, status: ids.length ? "observed" : allIds.length ? "metadata-unavailable" : "no-exposure" });
    }
    const rows = features.map((feature) => {
      const support = new Set(feature.support), observations = periods.map((period) => ({ ...period, count: period.sourceIds.filter((id) => support.has(id)).length })), fit = fitBurstStates(observations, settings), baseRate = fit.baseRate;
      return { id: feature.id, label: feature.label, totalSources: feature.support.length, unknownYearSupport: feature.support.filter((id) => !dated.has(id)).length, sourceIds: [...feature.support].sort(), periods: observations.map((period, index) => {
        const prior = observations.slice(Math.max(0, index - 3), index), priorExposure = prior.reduce((sum, row) => sum + row.exposure, 0), priorCount = prior.reduce((sum, row) => sum + row.count, 0), rate = period.exposure ? period.count / period.exposure : null;
        return { ...period, sourceIds: period.sourceIds.filter((id) => support.has(id)), rate, corpusBaseline: baseRate, baselineRatio: rate !== null && baseRate ? rate / baseRate : null, previousThreeRate: priorExposure ? priorCount / priorExposure : null, baselineFlag: rate !== null && baseRate && rate >= 2 * baseRate && period.count >= 3 };
      }), fit };
    });
    return { rows, periods, observationYear, partialYear, excludedYear, latest, unknown: works.length - known.length };
  }
  async function publicationBursts(works, graph, options = {}, progress = () => {
  }) {
    if (graph.collaboration) throw Error("Open a work-based map before analyzing publication activity. Actor nodes are not publication features.");
    if (graph.temporalSelection) throw Error("Return to the full pinned map before computing publication activity. A selected window is a read-only analytical view.");
    const settings = burstSettings(options);
    if (!works.length || works.length > 5e4 || new Set(works.map((work) => work.id)).size !== works.length) throw Error("Burst analysis requires 1\u201350,000 distinct pinned source records; no sampling is used.");
    progress("Counting distinct sources by publication year\u2026");
    const extraction = settings.kind === "references" ? null : featureIncidence(works, { ...settings, kind: settings.kind }), features = extraction?.features || referenceFeatures(graph, works, settings.minimumSupport, settings.vocabularyLimit);
    if (!features.length) throw Error("No observed features meet the source-support cutoff.");
    const availableIds = new Set(works.filter((work) => settings.kind === "topics" ? work.topics?.length : settings.kind === "references" ? (work.references || work.referenced_works || []).length : settings.textScope === "titles" ? semanticText(work).title : semanticText(work).title || semanticText(work).abstract).map((work) => work.id)), evidenceDate = graph.evidenceProvenance?.retrievedAt || graph.scientificManifest?.evidence?.retrievedAt || null, result = burstRows(features, works, settings, evidenceDate, availableIds), exposed = result.periods.filter((period) => period.exposure > 0).length;
    const configurations = [{ ...settings, penalty: Math.max(0.05, settings.penalty / 2) }, { ...settings, penalty: Math.min(10, settings.penalty * 2) }, { ...settings, scale: settings.scale === 2 ? 1.5 : 2 }, { ...settings, width: settings.width === 1 ? 2 : 1 }, { ...settings, excludeLatest: !settings.excludeLatest }, { ...settings, denominator: "available-metadata" }], sensitivity = [];
    for (const candidate of configurations) {
      progress("Comparing burst definition " + (sensitivity.length + 1) + "/" + configurations.length);
      const check = burstRows(features, works, candidate, evidenceDate, availableIds);
      sensitivity.push({ settings: candidate, assessedFeatures: check.rows.filter((row) => row.fit.status === "completed").length, features: check.rows.map((row) => ({ id: row.id, status: row.fit.status, intervals: row.fit.intervals })), exposedPeriods: check.periods.filter((period) => period.exposure > 0).length, excludedYear: check.excludedYear });
    }
    const observedFeatures = result.rows.filter((row) => row.fit.status === "completed").length;
    return { version: BURST_VERSION, status: exposed < 5 ? "unavailable" : observedFeatures ? "completed" : "unavailable", settings, evidence: graph.evidenceProvenance || null, evidenceFingerprint: await scienceDigest(works.map((work) => ({ id: work.id, year: publicationYear(work) })).sort((a, b) => a.id.localeCompare(b.id))), textFingerprint: await scienceDigest(features.map((feature) => ({ id: feature.id, support: [...feature.support].sort() }))), coverage: { sources: works.length, knownYear: works.length - result.unknown, unknownYear: result.unknown, unknownYearIds: works.filter((work) => publicationYear(work) === null).map((work) => work.id), insideBoundary: result.periods.reduce((sum, period) => sum + period.allSourceExposure, 0), outsideOrExcluded: works.length - result.unknown - result.periods.reduce((sum, period) => sum + period.allSourceExposure, 0), usableModelExposure: result.periods.reduce((sum, period) => sum + period.exposure, 0), exposedPeriods: exposed, features: features.length, assessedFeatures: observedFeatures, featureMetadata: extraction?.coverage || { policy: "Retained parent cited-reference incidence; references outside parent selection are not assessed." } }, evidenceDate, latestPeriod: { observationYear: result.observationYear, latestPublicationYear: result.latest, excludedYear: result.excludedYear, warning: evidenceDate ? "The retrieval year and later publication years may be partial or future-dated; those records are " + (settings.excludeLatest ? "excluded" : "included explicitly") + ". Earlier years can also be incomplete." : "Evidence date is unknown; the latest observed publication year is conservatively treated as potentially partial and " + (settings.excludeLatest ? "excluded" : "included explicitly") + "." }, periods: result.periods.map(({ sourceIds, ...period }) => period), features: result.rows.sort((a, b) => b.fit.intervals.reduce((sum, row) => sum + row.emissionGain, 0) - a.fit.intervals.reduce((sum, row) => sum + row.emissionGain, 0) || a.id.localeCompare(b.id)), sensitivity, method: "Bounded Kleinberg section 4 batched-document binomial model: p0=total feature sources/total source exposure, pi=p0\xD7scale^i\u22641, upward penalty=gamma\xD7log(number of exposed periods)\xD7state increase; downward transitions cost zero. At most the configured elevated states. Binomial coefficients cancel between states. Zero-exposure and entirely unavailable-metadata gaps break chains and reset to baseline; they are not zero feature counts. Partially available periods retain the declared denominator, with coverage sensitivity.", reference: "https://www.cs.cornell.edu/info/people/kleinber/bhs.pdf", baseline: "Observed feature share per corpus publication period, whole-span share ratio (excluding no-exposure/entirely missing-metadata bins) and previous-three-period share; 2\xD7whole-span share with at least 3 source documents is an explicit descriptive baseline flag, not a significance test.", limitation: "Within this retrieved corpus and retained feature vocabulary only: publication-year concentration, not global scientific attention, historical database snapshots, breakthrough, causal influence or p-values. One source contributes at most once per feature/period. Missing text/topic/reference metadata can depress observed shares. Feature selection stays fixed for sensitivity variants; unknown-year sources are excluded with counts, not imputed. Parameter/bin/latest-period sensitivity is descriptive and does not choose an optimum." };
  }

  // scripts/temporal-worker.mjs
  self.onmessage = async (event) => {
    try {
      const { stage, graph, works, settings } = event.data, progress = (message) => self.postMessage({ progress: message }), result = stage === "temporal-series" ? await buildTemporalSeries(graph, works, settings, progress) : stage === "publication-bursts" ? await publicationBursts(works, graph, settings, progress) : null;
      if (!result) throw Error("Unknown publication-time operation.");
      self.postMessage({ result });
    } catch (problem) {
      self.postMessage({ error: analysisErrorMessage(problem) });
    }
  };
})();

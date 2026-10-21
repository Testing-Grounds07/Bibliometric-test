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
  function addNode(nodeId2, data) {
    if (nodeId2 === void 0) {
      throw new Error("Invalid node identifier");
    }
    enterModification();
    var node = getNode(nodeId2);
    if (!node) {
      node = new Node(nodeId2, data);
      recordNodeChange(node, "add");
    } else {
      node.data = data;
      recordNodeChange(node, "update");
    }
    nodes.set(nodeId2, node);
    exitModification();
    return node;
  }
  function getNode(nodeId2) {
    return nodes.get(nodeId2);
  }
  function removeNode(nodeId2) {
    var node = getNode(nodeId2);
    if (!node) {
      return false;
    }
    enterModification();
    var prevLinks = node.links;
    if (prevLinks) {
      prevLinks.forEach(removeLinkInstance);
      node.links = null;
    }
    nodes.delete(nodeId2);
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
  function getLinks(nodeId2) {
    var node = getNode(nodeId2);
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
  function forEachLinkedNode(nodeId2, callback, oriented) {
    var node = getNode(nodeId2);
    if (node && node.links && typeof callback === "function") {
      if (oriented) {
        return forEachOrientedLink(node.links, nodeId2, callback);
      } else {
        return forEachNonOrientedLink(node.links, nodeId2, callback);
      }
    }
  }
  function forEachNonOrientedLink(links2, nodeId2, callback) {
    var quitFast;
    var valuesIterator = links2.values();
    var nextValue = valuesIterator.next();
    while (!nextValue.done) {
      var link = nextValue.value;
      var linkedNodeId = link.fromId === nodeId2 ? link.toId : link.fromId;
      quitFast = callback(nodes.get(linkedNodeId), link);
      if (quitFast) {
        return true;
      }
      nextValue = valuesIterator.next();
    }
  }
  function forEachOrientedLink(links2, nodeId2, callback) {
    var quitFast;
    var valuesIterator = links2.values();
    var nextValue = valuesIterator.next();
    while (!nextValue.done) {
      var link = nextValue.value;
      if (link.fromId === nodeId2) {
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
    const document = cache.documents?.[work.id], current = semanticText(work);
    if (!current.title && !current.abstract) throw new Error("No genuine title or abstract text is retained for " + work.id + ".");
    if (!document || cleanText(document.title) !== current.title || cleanText(document.abstract) !== current.abstract) throw new Error("Embedding text is missing or stale for " + work.id + ". Prepare matching embeddings before running this view.");
    if (current.abstract) abstracts++;
    return { work, vector: decodeEmbedding(document.embedding) };
  });
  return { records, settings, model: { id: cache.model, revision: cache.revision, dimensions: cache.dimensions, encoding: cache.encoding, textScope: cache.textScope }, coverage: { records: works.length, withText: works.length, withAbstract: abstracts, vectors: records.length, missingVectors: 0, textMatch: "All source titles and abstracts exactly match the normalized cached input." } };
}

// scripts/retained-research-checks.mjs
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

// scripts/research-check-methods.mjs
var RESEARCH_CHECK_VERSION = "bibliomap-research-checks-v1";
var RESEARCH_CHECK_KINDS = Object.freeze(["seed", "threshold", "article-only", "reference-ablation", "text-neighbours", "compare", "edge-audit", "rank-cutoff"]);
var RESEARCH_CHECK_LIMITS = Object.freeze({ nodes: 2e3, pairs: 2e6, edges: 2e5, fits: 15, milliseconds: 18e4, referenceAssignments: 1e6, referencePairContributions: 1e7, maxLevels: 10, maxLocalPasses: 30 });
var RESEARCH_CHECK_SEEDS = Object.freeze([11, 23, 37, 53, 71]);
var limitation = "Experimental diagnostic on the declared retained evidence. Partition agreement is not evidence-bootstrap stability, confidence, significance, an optimum guarantee or thematic validation. Original null-model and bootstrap studies are not implied. No graph.reliability result is produced.";
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
function rankCutoffReport(graph, rank) {
  const ordered = [...rank.scores].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const connected = connectedIds(graph), positives = ordered.filter((row) => row.score > 0).length;
  const cutoffs = [10, 20].map((k) => {
    const selected = ordered.slice(0, k), boundary = selected.at(-1)?.score ?? null, boundaryTiedIds = ordered.filter((row) => row.score === boundary).map((row) => row.id), includingBoundaryTies = ordered.filter((row) => row.score >= boundary).map((row) => row.id);
    return { cutoff: k, selectedIds: selected.map((row) => row.id), selectedCount: selected.length, nodeCoverage: selected.length / ordered.length, denominator: { name: "full-retained-source-work-universe", count: ordered.length }, selectedConnected: selected.filter((row) => connected.has(row.id)).length, selectedIsolates: selected.filter((row) => !connected.has(row.id)).length, selectedPositiveScores: selected.filter((row) => row.score > 0).length, boundaryScore: boundary, boundaryTiedIds, boundaryTiesOmitted: boundaryTiedIds.filter((id) => !selected.some((row) => row.id === id)), includingBoundaryTies: { selectedIds: includingBoundaryTies, selectedCount: includingBoundaryTies.length, nodeCoverage: includingBoundaryTies.length / ordered.length } };
  });
  const first = new Set(cutoffs[0].selectedIds), second = new Set(cutoffs[1].selectedIds), sharedIds = [...first].filter((id) => second.has(id));
  return { metric: rank.metric, definition: rank.definition, actualSettings: { cutoffs: [10, 20], tiePolicy: "Descending exact observed score, then ascending exact source ID using Unicode code-unit order. Fixed-size cutoffs retain at most k sources; the full boundary-tie alternative is saved separately.", scoreTransformation: "None", selectedSourceUniverse: "All retained analytical source-work nodes, including isolates and zero-score nodes." }, diagnostics: rank.diagnostics, rankedSources: ordered.map((row, index) => ({ ...row, position: index + 1 })), coverage: { analyzedSources: ordered.length, positiveScores: positives, zeroScores: ordered.length - positives, connectedSources: connected.size, isolates: ordered.length - connected.size }, cutoffs, cutoffOverlap: { firstCutoff: 10, secondCutoff: 20, commonIds: sharedIds, commonCount: sharedIds.length, unionCount: (/* @__PURE__ */ new Set([...first, ...second])).size, jaccard: sharedIds.length / (/* @__PURE__ */ new Set([...first, ...second])).size, firstRetainedFraction: sharedIds.length / first.size, secondRetainedFraction: sharedIds.length / second.size, interpretation: "Nested cutoffs of one fixed observed ranking; overlap is a deterministic selection comparison, not stability or statistical evidence." }, limitations: ["Observed counts and graph strength do not establish seminal status, historical priority, scientific quality, thematic validity or causal importance.", "Zero-score ordering and boundary ties depend on the explicit exact-ID tie rule; inspect the saved all-boundary-ties alternative.", "Coverage is relative to this retained source-work universe; incomplete source retrieval and missing bibliographies are not repaired."] };
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
function adjustedRandIndex(first, second, ids = Object.keys(first).filter((id) => Object.hasOwn(second, id))) {
  if (ids.length < 2) return null;
  const rows = /* @__PURE__ */ new Map(), columns = /* @__PURE__ */ new Map(), cells = /* @__PURE__ */ new Map();
  for (const id of ids) {
    if (!Object.hasOwn(first, id) || !Object.hasOwn(second, id)) fail("ARI denominator contains a source without membership.");
    const row = first[id], column = second[id], key = JSON.stringify([row, column]);
    rows.set(row, (rows.get(row) || 0) + 1);
    columns.set(column, (columns.get(column) || 0) + 1);
    cells.set(key, (cells.get(key) || 0) + 1);
  }
  const sum = (map) => [...map.values()].reduce((total, count) => total + choose2(count), 0), a = sum(rows), b = sum(columns), expected = a * b / choose2(ids.length), denominator = (a + b) / 2 - expected;
  return denominator ? (sum(cells) - expected) / denominator : 1;
}
function researchCheckComparison(firstGraph, secondGraph, first = researchCheckMemberships(firstGraph), second = researchCheckMemberships(secondGraph)) {
  const left = new Set(firstGraph.nodes.map((node) => node.id)), right = new Set(secondGraph.nodes.map((node) => node.id)), common = [...left].filter((id) => right.has(id)).sort(), baseConnected = connectedIds(firstGraph), otherConnected = connectedIds(secondGraph);
  const measure = (ids) => ({ count: ids.length, ids, adjustedRandIndex: adjustedRandIndex(first, second, ids) });
  return { commonFullUniverse: measure(common), baselineConnectedCommonUniverse: measure(common.filter((id) => baseConnected.has(id))), bothConnectedCommonUniverse: measure(common.filter((id) => baseConnected.has(id) && otherConnected.has(id))), nodeCoverage: { baselineFull: left.size, comparisonFull: right.size, commonFull: common.length, baselineOnly: left.size - common.length, comparisonOnly: right.size - common.length, baselineConnected: baseConnected.size, comparisonConnected: otherConnected.size, baselineIsolates: left.size - baseConnected.size, comparisonIsolates: right.size - otherConnected.size }, isolatePolicy: "Original engineCommunity when retained; otherwise each disconnected or unassigned isolate is its own distinct singleton. Display cluster 0 never pools isolates.", limitation: "These denominators compare partitions of explicit source IDs. ARI 1 for trivial all-singleton/all-in-one partitions does not establish meaningful communities." };
}
function fitGraph(graph, settings, seed) {
  const connected = connectedIds(graph), network = ngraph_default(), scale = settings.objective === "cpm" && graph.links.length ? graph.links.reduce((sum, edge) => sum + weight(edge), 0) / graph.links.length : 1;
  for (const node of graph.nodes) if (connected.has(node.id)) network.addNode(node.id);
  for (const edge of graph.links) network.addLink(edge.source, edge.target, { weight: weight(edge) / scale });
  const actualSettings = { ...settings, seed, scale, optimizer: "ngraph.leiden 0.3.0", initialization: "singletons; one fixed-seed start", convergence: "Not certified; bounded maximum levels and local passes." }, memberships = Object.fromEntries(graph.nodes.filter((node) => !connected.has(node.id)).map((node) => [node.id, "singleton:" + node.id]));
  let quality = null, levels = 0;
  if (graph.links.length) {
    const result = bt(network, { quality: settings.objective, resolution: settings.resolution, randomSeed: seed, maxLevels: settings.maxLevels, maxLocalPasses: settings.maxLocalPasses, linkWeight: (link) => link.data.weight });
    for (const node of graph.nodes) if (connected.has(node.id)) memberships[node.id] = "fit:" + result.getClass(node.id);
    quality = result.quality();
    levels = result.toJSON().meta.levels;
    if (!Number.isFinite(quality)) fail("The declared objective returned a nonfinite score.");
  }
  return { seed, memberships, communities: new Set(Object.values(memberships)).size, connectedCommunities: new Set([...connected].map((id) => memberships[id])).size, nodes: graph.nodes.length, connectedNodes: connected.size, isolates: graph.nodes.length - connected.size, edges: graph.links.length, quality, levels, actualSettings };
}
function auditEdges(graph, rebuilt) {
  const expected = new Map(rebuilt.links.map((edge) => [pairKey(edge.source, edge.target), edge])), observed = new Map(graph.links.map((edge) => [pairKey(edge.source, edge.target), edge])), mismatches = [];
  for (const [key, edge] of expected) {
    const retained = observed.get(key);
    if (!retained) mismatches.push({ kind: "missing-retained-edge", source: edge.source, target: edge.target });
    else {
      const raw = retained.rawSupport ?? retained.count;
      if (raw !== edge.count || retained.count != null && retained.count !== edge.count || retained.rawSupport != null && retained.rawSupport !== edge.count || Math.abs(weight(retained) - edge.strength) > 1e-12) mismatches.push({ kind: "edge-evidence-mismatch", source: edge.source, target: edge.target, observedRawShared: raw ?? null, observedCount: retained.count ?? null, expectedRawShared: edge.count, observedWeight: weight(retained), expectedCosine: edge.strength });
      if (Array.isArray(retained.references) && JSON.stringify([...new Set(retained.references.map(referenceId))].sort()) !== JSON.stringify([...edge.references].sort())) mismatches.push({ kind: "shared-reference-ID-mismatch", source: edge.source, target: edge.target });
    }
  }
  for (const [key, edge] of observed) if (!expected.has(key)) mismatches.push({ kind: "unexpected-retained-edge", source: edge.source, target: edge.target });
  return { status: mismatches.length ? "mismatch" : "verified", expectedEdges: expected.size, observedEdges: observed.size, mismatchCount: mismatches.length, mismatches, toleranceAbsoluteCosine: 1e-12, candidateUniverse: "Every pair of the exact retained node universe; zero-shared-reference pairs cannot pass minimumShared >= 1." };
}
async function semanticPins(graph, works, cache) {
  const documents = works.map((work) => ({ id: work.id, title: semanticText(work).title, abstract: semanticText(work).abstract, embedding: cache.documents[work.id].embedding })).sort((left, right) => left.id.localeCompare(right.id));
  const embeddingFingerprint = await scienceDigest({ model: cache.model, revision: cache.revision, dimensions: cache.dimensions, encoding: cache.encoding, textScope: cache.textScope, documents });
  if (graph.semantic.embeddingFingerprint && embeddingFingerprint !== graph.semantic.embeddingFingerprint) fail("Pinned semantic vectors changed; this is not a fixed-model check.");
  const textFingerprint = await scienceDigest(works.map((work) => ({ id: work.id, ...semanticText(work) })).sort((left, right) => left.id.localeCompare(right.id)));
  if (graph.semantic.textFingerprint && textFingerprint !== graph.semantic.textFingerprint) fail("Pinned semantic source text changed; this is not fixed-evidence sensitivity.");
  if (!graph.semantic.embeddingFingerprint && !graph.importedStandalone) fail("The baseline semantic graph lacks a pinned vector fingerprint.");
  return { embeddingFingerprint, textFingerprint, baselineVectorBinding: graph.semantic.embeddingFingerprint ? "Exact retained native SHA-256 vector pin verified." : "Imported original lacks a native vector fingerprint: this is a new computation on the supplied exact-text/model cache, not an exact replay of its original vectors." };
}
async function runResearchCheck(input, progress = () => {
}) {
  const start = Date.now(), preflight = preflightResearchCheck(input), { kind, graph, records, cache, comparisonGraph, options = {} } = input;
  const checkTime = () => {
    if (Date.now() - start > RESEARCH_CHECK_LIMITS.milliseconds) fail("Research check exceeded its 180-second budget; discard partial output.");
  };
  const emit = (message) => {
    checkTime();
    progress({ kind, message, elapsedMilliseconds: Date.now() - start });
  };
  emit("Validated exact graph and bounded operation plan.");
  const supplied = recordsArray(records), inputs = { version: RESEARCH_CHECK_VERSION, kind, graph: { ...researchGraphIdentity(graph), minimumRetainedWeight: graph.minimumRetainedWeight }, records: supplied, options, cache: kind === "text-neighbours" ? cache : null, comparisonGraph: kind === "compare" ? researchGraphIdentity(comparisonGraph) : null };
  const fingerprint = await scienceDigest(inputs), baseMemberships = ["edge-audit", "rank-cutoff"].includes(kind) ? null : researchCheckMemberships(graph), variants = [];
  let result;
  const runVariant = (candidate, definition) => {
    if (candidate.links.length > RESEARCH_CHECK_LIMITS.edges) fail("A reconstructed variant exceeds 200,000 edges; no partial graph is retained.");
    const runs = [];
    for (const seed of RESEARCH_CHECK_SEEDS) {
      emit("Fitting " + definition.label + " \xB7 seed " + seed);
      const run = fitGraph(candidate, preflight.settings, seed);
      checkTime();
      run.comparison = researchCheckComparison(graph, candidate, baseMemberships, run.memberships);
      runs.push(run);
    }
    const pairwiseAgreement = [];
    for (let left = 0; left < runs.length; left++) for (let right = left + 1; right < runs.length; right++) pairwiseAgreement.push({ firstSeed: runs[left].seed, secondSeed: runs[right].seed, comparison: researchCheckComparison(candidate, candidate, runs[left].memberships, runs[right].memberships) });
    variants.push({ definition, nodeIds: candidate.nodes.map((node) => node.id), edges: candidate.links.length, _links: candidate.links, runs, pairwiseAgreement });
  };
  if (kind === "compare") result = { comparison: researchCheckComparison(graph, comparisonGraph) };
  if (kind === "rank-cutoff") {
    emit("Ranking exact observed " + preflight.details.rankMetric + " scores at cutoffs 10 and 20.");
    result = rankCutoffReport(graph, rankScores(graph, records, options));
  }
  if (kind === "seed") runVariant(graph, { label: "fixed evidence", evidenceFixed: true });
  if (kind === "threshold") for (const threshold of preflight.details.thresholds) runVariant({ ...graph, links: graph.links.filter((edge) => weight(edge) >= threshold) }, { label: "edge threshold " + threshold, threshold, ...preflight.details, thresholds: void 0 });
  if (kind === "article-only") {
    const retained = new Set(preflight.details.retainedArticleIds);
    runVariant({ ...graph, nodes: graph.nodes.filter((node) => retained.has(node.id)), links: graph.links.filter((edge) => retained.has(edge.source) && retained.has(edge.target)) }, { label: "exact publication type article", ...preflight.details, policy: "Induced retained graph on exact declared article source records; all matching source nodes retained including isolates." });
  }
  if (kind === "edge-audit" || kind === "reference-ablation") {
    const evidence = referencesFor(graph, records), settings = couplingSettings(graph, options), reconstruct = (works) => couplingGraph(works, couplingPairs(works, RESEARCH_CHECK_LIMITS.pairs), settings.minimumShared, settings.minimumCosine);
    emit("Reconstructing every candidate shared-reference pair.");
    const rebuilt = reconstruct(evidence.works);
    if (rebuilt.links.length > RESEARCH_CHECK_LIMITS.edges) fail("Baseline reconstruction exceeds the 200,000-edge budget; no partial audit is retained.");
    const audit = auditEdges(graph, rebuilt);
    checkTime();
    if (kind === "edge-audit") result = { ...audit, coverage: { sources: evidence.works.length, emptyReferenceLists: evidence.emptyLists, bibliographyCompleteness: "Unknown; explicit empty lists are retained as observed unavailable bibliographies." }, actualSettings: settings };
    else {
      if (audit.mismatchCount) fail("Baseline coupling edge audit failed (" + audit.mismatchCount + " mismatches); ablation cannot silently rebuild a different baseline.");
      for (const deleted of preflight.details.variants) {
        const removed = new Set(deleted), candidate = reconstruct(evidence.works.map((work) => ({ ...work, references: work.references.filter((id) => !removed.has(id)) })));
        runVariant(candidate, { label: "remove " + deleted.join(", "), deletedReferenceIds: deleted, ...settings, fixedNodeUniverse: true });
      }
      result = { baselineEdgeAudit: audit };
    }
  }
  let vectorPins = null;
  if (kind === "text-neighbours") {
    const source = semanticSourceRecords(graph, records), evidence = embeddingEvidence(source.selected, cache, { textScope: "titles-abstracts" }, graph.sourceCorpusId);
    vectorPins = await semanticPins(graph, source.selected, cache);
    const neighbors = new Map(evidence.records.map(({ work }) => [work.id, []]));
    for (let left = 0; left < evidence.records.length; left++) {
      if (left % 25 === 0) emit("Exact cached-vector cosine comparisons " + left + "/" + evidence.records.length);
      const a = evidence.records[left];
      for (let right = left + 1; right < evidence.records.length; right++) {
        const b = evidence.records[right];
        let cosine = 0;
        for (let dimension = 0; dimension < 384; dimension++) cosine += a.vector[dimension] * b.vector[dimension];
        cosine = Math.min(1, cosine);
        if (cosine > 0) {
          neighbors.get(a.work.id).push({ id: b.work.id, cosine });
          neighbors.get(b.work.id).push({ id: a.work.id, cosine });
        }
      }
    }
    for (const list of neighbors.values()) list.sort((a, b) => b.cosine - a.cosine || a.id.localeCompare(b.id));
    for (const k of [5, 10, 15]) {
      const edges = /* @__PURE__ */ new Map();
      for (const [id, list] of neighbors) for (const item of list.slice(0, k)) {
        const ends = [id, item.id].sort();
        edges.set(pairKey(...ends), { source: ends[0], target: ends[1], strength: item.cosine, similarity: item.cosine, rawSupport: null });
      }
      runVariant({ ...graph, links: [...edges.values()] }, { label: "positive union kNN " + k, k, mode: preflight.details.mode, vectorPins });
    }
  }
  for (const variant of variants) {
    variant.edgeFingerprint = await scienceDigest(variant._links);
    delete variant._links;
    variant.membershipFingerprint = await scienceDigest(variant.runs.map((run) => ({ seed: run.seed, memberships: run.memberships, actualSettings: run.actualSettings })));
  }
  checkTime();
  return { version: RESEARCH_CHECK_VERSION, kind, status: "completed", executed: true, createdAt: (/* @__PURE__ */ new Date()).toISOString(), inputFingerprint: fingerprint, vectorPins, preflight, actualSettings: preflight.settings ?? (kind === "rank-cutoff" ? { ...result.actualSettings, rankMetric: result.metric } : null), implementation: { engine: preflight.budget.fits ? "ngraph.leiden 0.3.0; ngraph.graph 20.1.2" : "No community optimizer executed.", execution: "New bounded JavaScript diagnostic computation", originalImplementation: graph.importedStandalone ? "Imported standalone Python igraph/leidenalg result; original optimizer is not replayed by these checks." : "Native retained BiblioMap graph", equivalentToOriginalImplementation: false }, universe: { sourceRecordsSupplied: supplied.length, analyzedNodeIds: graph.nodes.map((node) => node.id), analyzedNodes: graph.nodes.length, connectedNodes: connectedIds(graph).size, isolates: graph.nodes.length - connectedIds(graph).size, sourceScope: "Exact retained analytical node universe before display filters; source records outside it are not added." }, variants, results: result || null, elapsedMilliseconds: Date.now() - start, limitations: [limitation, ...kind === "rank-cutoff" ? result.limitations : [], ...kind === "threshold" ? ["Edge filtering cannot recover missing edges or support a threshold below the retained construction scope."] : [], ...kind === "text-neighbours" ? ["Uses only the exact supplied cache after model/text validation; it does not fetch text, create embeddings or establish topical validity."] : []] };
}

// scripts/research-check-worker.mjs
self.onmessage = async (event) => {
  try {
    const result = await runResearchCheck(event.data, (progress) => self.postMessage({ progress }));
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "Research check failed." });
  }
};

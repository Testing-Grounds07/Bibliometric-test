import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {clusterDecks, deckCoordinates} from './hypergraph-overview-core.mjs';
import {loadCommunities} from './community-loader.mjs';

const byId = id => document.getElementById(id), colors = ['#257b75','#c77936','#5c6eac','#a45070','#658343','#8c65a0','#3c839c','#aa654e'];
const text = (tag, content) => { const node = document.createElement(tag); node.textContent = content; return node; };
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(42, 1, .1, 30000), root = new THREE.Group(); scene.add(root);
let renderer, controls, graph, decks = [], resources = [], markers = [], planes = [], strokes = [], guides = [], pickables = [], bounds, ticket = 0, job, frame, last = 0, blend = 0, expanded = true, tracked = '', destroyed = false, down;
try { renderer = new THREE.WebGLRenderer({antialias: true}); }
catch { byId('status').textContent = 'WebGL is unavailable. Please use the 2D main map.'; }
if (renderer) {
 renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.domElement.tabIndex = 0; renderer.domElement.setAttribute('aria-label', 'Rotatable 3D canvas of every cluster in exploded layers'); byId('scene').append(renderer.domElement);
 controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.maxDistance = 16000; controls.minDistance = 50;
 scene.add(new THREE.AmbientLight(0xffffff, 2.5)); const light = new THREE.DirectionalLight(0xffffff, 2); light.position.set(100, 500, 600); scene.add(light);
 const media = matchMedia('(prefers-color-scheme: dark)'), theme = () => { scene.background = new THREE.Color(media.matches ? '#202020' : '#ffffff'); }; theme(); media.addEventListener('change', theme);
 const own = resource => { resources.push(resource); return resource; };
 const shade = cluster => colors[(cluster - 1) % colors.length];
 const vector = (point, center, height = 0) => new THREE.Vector3(center.x + point.x, height, center.z + point.y);
 function line(points, color, dashed = false) {
  const material = own(dashed ? new THREE.LineDashedMaterial({color, transparent: true, opacity: .25, dashSize: 3, gapSize: 6}) : new THREE.LineBasicMaterial({color, transparent: true, opacity: .65}));
  const object = new THREE.Line(own(new THREE.BufferGeometry().setFromPoints(points)), material); if (dashed) object.computeLineDistances(); root.add(object); return object;
 }
 function label(content, position) {
  const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 96; const context = canvas.getContext('2d'); context.fillStyle = '#777777'; context.font = '28px system-ui'; context.fillText(content, 10, 55);
  const texture = own(new THREE.CanvasTexture(canvas)), sprite = new THREE.Sprite(own(new THREE.SpriteMaterial({map: texture, transparent: true, depthTest: false}))); sprite.scale.set(280, 35, 1); sprite.position.copy(position); root.add(sprite);
 }
 function showGroup(deck, group, position) {
  byId('selectionTitle').textContent = 'Cluster ' + deck.cluster + ' · combination ' + (position + 1); const panel = byId('selection'); panel.replaceChildren(text('p', group.members.length + ' exact members · ' + (group.articles?.length || 0) + ' jointly citing sources' + (group.crossing ? ' · crosses clusters' : '')));
  const list = text('ol', ''); const index = new Map(graph.nodes.map(node => [node.id, node]));
  for (const id of group.members) { const node = index.get(id), item = text('li', node.title || node.label || id); if (tracked === id) item.append(text('strong', ' · tracked')); list.append(item); } panel.append(list);
 }
 function showArticle(id) {
  tracked = id; byId('article').value = id; const node = graph.nodes.find(node => node.id === id); byId('selectionTitle').textContent = 'Tracked article'; byId('selection').replaceChildren(text('p', node.title || node.label || id), text('p', 'Cluster ' + node.cluster + '. Dotted guides connect its repeated appearances, not citations.'));
 }
 function clearSelection() { byId('selectionTitle').textContent = 'A landscape of layers'; byId('selection').replaceChildren(text('p', 'Every linked cluster has its own exploded stack. Select a plane to inspect its complete combination.')); }
 function resize() { const box = byId('scene').getBoundingClientRect(); camera.aspect = box.width / Math.max(1, box.height); camera.updateProjectionMatrix(); renderer.setSize(box.width, box.height, false); }
 function fit(cluster = '') {
  const deck = decks.find(item => String(item.cluster) === cluster), center = deck ? new THREE.Vector3(deck.center.x, 60, deck.center.z) : bounds.getCenter(new THREE.Vector3());
  const size = deck ? 450 : bounds.getSize(new THREE.Vector3()).length(), distance = Math.max(700, size / Math.min(1, camera.aspect)); controls.target.copy(center); camera.position.copy(center).add(new THREE.Vector3(distance * .45, distance * .8, distance * .75)); controls.update();
 }
 function build() {
  const nextDecks = clusterDecks(graph, Number(byId('layers').value));
  const occurrences = nextDecks.reduce((sum, deck) => sum + deck.nodes.length + deck.groups.reduce((total, edge) => total + edge.members.length, 0), 0);
  if (occurrences > 100000) throw new Error('More than 100,000 visible article occurrences. Lower layers per cluster; no partial combinations were rendered.');
  while (root.children.length) root.remove(root.children[0]); resources.forEach(resource => resource.dispose()); resources = []; markers = []; planes = []; strokes = []; guides = []; pickables = [];
  decks = nextDecks;
  const columns = Math.ceil(Math.sqrt(decks.length)), index = new Map(graph.nodes.map(node => [node.id, node])), sphere = own(new THREE.SphereGeometry(1, 10, 8));
  bounds = new THREE.Box3(); let shown = 0, eligible = 0;
  const positionsByArticle = new Map();
  for (const [position, deck] of decks.entries()) {
   const center = {x: (position % columns - (columns - 1) / 2) * 460, z: (Math.floor(position / columns) - Math.floor((decks.length - 1) / columns) / 2) * 460}; deck.center = center;
   const points = deckCoordinates(deck); eligible += deck.eligible; shown += deck.groups.length;
   label('Cluster ' + deck.cluster + ' / ' + deck.nodes.length + ' works', new THREE.Vector3(center.x, -18, center.z + 205));
   bounds.expandByPoint(new THREE.Vector3(center.x - 220, 0, center.z - 220)); bounds.expandByPoint(new THREE.Vector3(center.x + 220, 800, center.z + 220));
   const plate = (level, group) => {
    const object = new THREE.Mesh(own(new THREE.PlaneGeometry(390, 390)), own(new THREE.MeshBasicMaterial({color: shade(deck.cluster), transparent: true, opacity: .035, side: THREE.DoubleSide, depthWrite: false}))); object.rotation.x = -Math.PI / 2; object.position.set(center.x, 0, center.z); object.userData = {deck, group, position: level - 1}; root.add(object); pickables.push(object); planes.push({object, level});
    const boundary = line([[-195,-195],[-195,195],[195,195],[195,-195],[-195,-195]].map(([horizontal,vertical]) => vector({x: horizontal,y: vertical}, center)), '#999999'); strokes.push({object: boundary, level});
   };
   const marker = (id, level) => {
    const object = new THREE.Mesh(sphere, own(new THREE.MeshStandardMaterial({color: shade(index.get(id).cluster), roughness: .45, transparent: true}))); object.scale.setScalar(level ? 4.5 : 2.5); object.position.copy(vector(points[id], center)); object.userData = {article: id}; root.add(object); markers.push({object, level, id}); pickables.push(object);
    if (!positionsByArticle.has(id)) positionsByArticle.set(id, []); positionsByArticle.get(id).push({point: object.position.clone(), level});
   };
   plate(0); deck.nodes.forEach(node => marker(node.id, 0));
   for (const [offset, group] of deck.groups.entries()) {
    const level = offset + 1; plate(level, group); group.members.forEach(id => marker(id, level));
    const ordered = group.members.slice().sort((left, right) => Math.atan2(points[left].y, points[left].x) - Math.atan2(points[right].y, points[right].x));
    const outline = line([...ordered, ordered[0]].map(id => vector(points[id], center)), group.crossing ? '#888888' : shade(deck.cluster)); strokes.push({object: outline, level});
    for (const id of group.members) { const start = vector(points[id], center), object = line([start, start.clone()], '#999999', true); guides.push({object, id, first: 0, last: level}); }
   }
  }
  for (const [id, positions] of positionsByArticle) for (let position = 1; position < positions.length; position++) if (positions[position].point.distanceTo(positions[position - 1].point) > 300) {
   const first = positions[position - 1], last = positions[position], object = line([first.point, last.point], '#777777', true); guides.push({object, id, first: first.level, last: last.level, crossDeck: true});
  }
  byId('cluster').replaceChildren(new Option('All clusters', ''), ...decks.map(deck => new Option('Cluster ' + deck.cluster + ' · ' + deck.nodes.length + ' works', String(deck.cluster))));
  const previous = tracked; byId('article').replaceChildren(new Option('None', ''), ...graph.nodes.filter(node => node.cluster > 0).sort((left, right) => (left.label || left.id).localeCompare(right.label || right.id)).map(node => new Option(node.label || node.title || node.id, node.id))); byId('article').value = previous;
  byId('status').textContent = decks.length + ' / ' + decks.length + ' linked clusters · ' + shown + ' / ' + eligible + ' complete group layers shown (groups may repeat across stacks) · ' + occurrences.toLocaleString() + ' article occurrences · ' + graph.clustering.label + ' · preview, not all evidence'; resize(); fit();
 }
 async function analyze() {
  const version = ++ticket; job?.cancel(); byId('cancel').disabled = false; byId('status').textContent = 'Reconstructing whole supported groups…';
  try {
   await loadCommunities(); if (version !== ticket) return;
   const baseline = structuredClone(window.resolveAtlasGraph('cocitation_s10_all_cpm0_02', 'auto', 10)); baseline.networkModel = 'hypergraph';
   job = window.ATLAS_COMMUNITIES.start(baseline, byId('algorithm').value, window.ATLAS_DATA.bundlesByScope[10], message => { if (version === ticket) byId('status').textContent = message; }, {networkModel: 'hypergraph'});
   const result = await job.promise; if (version !== ticket) return; graph = result; build();
  } catch (error) { if (version === ticket) byId('status').textContent = error.message + ' The previous view, if any, is unchanged.'; }
  finally { if (version === ticket) { job = null; byId('cancel').disabled = true; } }
 }
 function tick(time) {
  if (destroyed) return; frame = requestAnimationFrame(tick); if (document.hidden) return;
  const delta = Math.min(50, time - last || 16); last = time; const target = expanded ? 1 : 0; blend = matchMedia('(prefers-reduced-motion: reduce)').matches ? target : blend + (target - blend) * (1 - Math.exp(-delta / 180)); const spacing = Number(byId('spacing').value);
  for (const marker of markers) { marker.object.position.y = marker.level * spacing * blend; marker.object.material.opacity = tracked && marker.id !== tracked ? .15 : marker.level ? .95 : .5; marker.object.scale.setScalar(marker.id === tracked ? 7 : marker.level ? 4.5 : 2.5); }
  for (const item of planes) { item.object.position.y = item.level * spacing * blend; item.object.material.opacity = item.level ? .035 * blend : .02; }
  for (const item of strokes) { item.object.position.y = item.level * spacing * blend; item.object.material.opacity = (tracked ? .15 : .5) * (item.level ? blend : 1); }
  for (const guide of guides) { const attribute = guide.object.geometry.attributes.position; attribute.setY(0, guide.first * spacing * blend); attribute.setY(1, guide.last * spacing * blend); attribute.needsUpdate = true; guide.object.computeLineDistances(); guide.object.material.opacity = tracked === guide.id ? .8 : guide.crossDeck || tracked ? 0 : .12 * blend; }
  controls.update(); renderer.render(scene, camera);
 }
 byId('algorithm').onchange = analyze; byId('layers').onchange = () => { if (graph) try { build(); } catch (error) { byId('status').textContent = error.message; } };
 byId('cluster').onchange = () => fit(byId('cluster').value); byId('article').onchange = () => { tracked = byId('article').value; if (tracked) showArticle(tracked); else clearSelection(); };
 byId('explode').onclick = () => { expanded = !expanded; byId('explode').textContent = expanded ? 'Collapse all' : 'Explode all'; byId('explode').setAttribute('aria-pressed', String(expanded)); };
 byId('reset').onclick = () => { byId('cluster').value = ''; fit(); }; byId('cancel').onclick = () => { ticket++; job?.cancel(); job = null; byId('cancel').disabled = true; byId('status').textContent = 'Cancelled. No incomplete analysis was displayed.'; };
 const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(); renderer.domElement.addEventListener('pointerdown', event => { down = {x: event.clientX, y: event.clientY}; });
 renderer.domElement.addEventListener('pointerup', event => { if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) return; const box = renderer.domElement.getBoundingClientRect(); pointer.set((event.clientX - box.left) / box.width * 2 - 1, -(event.clientY - box.top) / box.height * 2 + 1); raycaster.setFromCamera(pointer, camera); const hit = raycaster.intersectObjects(pickables)[0]; if (hit?.object.userData.article) showArticle(hit.object.userData.article); else if (hit?.object.userData.group) { const data = hit.object.userData; showGroup(data.deck, data.group, data.position); } });
 renderer.domElement.addEventListener('keydown', event => { if (event.key === '0') { fit(); event.preventDefault(); } if (['ArrowLeft','ArrowRight'].includes(event.key)) { const offset = camera.position.clone().sub(controls.target).applyAxisAngle(new THREE.Vector3(0,1,0), event.key === 'ArrowLeft' ? .12 : -.12); camera.position.copy(controls.target).add(offset); controls.update(); event.preventDefault(); } });
 renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); byId('status').textContent = 'Graphics context lost. Reload this test or use the main 2D canvas.'; });
 const observer = new ResizeObserver(resize); observer.observe(byId('scene')); resize(); frame = requestAnimationFrame(tick); analyze();
 window.addEventListener('pagehide', () => { destroyed = true; ticket++; job?.cancel(); cancelAnimationFrame(frame); observer.disconnect(); media.removeEventListener('change', theme); controls.dispose(); resources.forEach(resource => resource.dispose()); renderer.dispose(); }, {once: true});
}

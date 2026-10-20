export function select3DGroups(edges, nodes, focus = {}, limit = 16) {
 const visible = new Set(nodes.map(node => node.id)), byId = new Map(nodes.map(node => [node.id,node]));
 const pair = focus.edge ? focus.edge.split('|') : [];
 const query = (focus.query || '').trim().toLowerCase();
 const eligible = edges.filter(edge => edge.members.length >= 3 && edge.members.every(id => visible.has(id)) && (!focus.node || edge.members.includes(focus.node)) && pair.every(id => edge.members.includes(id)) && (!query || edge.members.some(id => {const node=byId.get(id);return [node.label,node.title,node.authors,node.yearLabel,node.year,id].filter(Boolean).join(' ').toLowerCase().includes(query);})) && (!(Number(focus.cluster) > 0) || edge.members.some(id => String(byId.get(id).cluster) === String(focus.cluster))));
 eligible.sort((left,right) => (right.articles?.length || 0) - (left.articles?.length || 0) || String(left.id || left.reference).localeCompare(String(right.id || right.reference)));
 const renderable = eligible.filter(edge => edge.members.length <= 240), selected = [], represented = new Set();
 let occurrences = 0;
 for (const edge of renderable) {
  const clusters = [...new Set(edge.members.map(id => byId.get(id).cluster))].sort().join('|');
  if (!represented.has(clusters) && occurrences + edge.members.length <= 1600) { represented.add(clusters); selected.push(edge); occurrences += edge.members.length; }
  if (selected.length >= limit) break;
 }
 for (const edge of renderable) if (selected.length < limit && !selected.includes(edge) && occurrences + edge.members.length <= 1600) { selected.push(edge); occurrences += edge.members.length; }
 return {groups: selected, total: eligible.length, oversized: eligible.length-renderable.length};
}

export function layerCoordinates(nodes, groups) {
 const ids = [...new Set(groups.flatMap(group => group.members))].sort(), byId = new Map(nodes.map(node => [node.id,node]));
 const xs = ids.map(id => Number.isFinite(byId.get(id)?.x) ? byId.get(id).x : 0), ys = ids.map(id => Number.isFinite(byId.get(id)?.y) ? byId.get(id).y : 0);
 const centerX = (Math.min(0,...xs) + Math.max(0,...xs)) / 2, centerY = (Math.min(0,...ys) + Math.max(0,...ys)) / 2;
 const extent = Math.max(1, ...xs.map(value => Math.abs(value-centerX)), ...ys.map(value => Math.abs(value-centerY)));
 return Object.fromEntries(ids.map((id,position) => [id,{x:(xs[position]-centerX)/extent*220,y:-(ys[position]-centerY)/extent*220,z:Math.sin(position*2.399963)*24}]));
}

export function explodedDepth(position, count, spacing = 55) { return (position-(count-1)/2)*spacing; }
export function matching3DGroups(groups, article, enabled) { return enabled && article ? groups.filter(group => group.members.includes(article)) : groups; }

export function clusterStacks(edges,nodes,focus={},layoutNodes=nodes) {
 const byId=new Map(nodes.map(node=>[node.id,node])),stacks=new Map();
 for(const node of nodes)if(Number(node.cluster)>0){const key=String(node.cluster);if(!stacks.has(key))stacks.set(key,{cluster:key,nodes:[],groups:[],total:0,oversized:0});stacks.get(key).nodes.push(node);}
 const internal=new Map([...stacks.keys()].map(key=>[key,[]]));let crossing=0;
 for(const edge of edges){if(edge.members.length<3||!edge.members.every(id=>byId.has(id)))continue;const clusters=new Set(edge.members.map(id=>String(byId.get(id).cluster)));if(clusters.size!==1){crossing++;continue;}internal.get([...clusters][0])?.push(edge);}
 const layout=clusterMapLayout([...stacks.values()],layoutNodes);
 for(const stack of stacks.values()){const result=select3DGroups(internal.get(stack.cluster),stack.nodes,focus);Object.assign(stack,result,{layout:layout.get(stack.cluster)});}
 return {stacks:[...stacks.values()].sort((left,right)=>right.nodes.length-left.nodes.length||Number(left.cluster)-Number(right.cluster)),crossing};
}

export function visibleClusterStacks(stacks,article,matching,limit,cursors={}) {
 const visible=stacks.map(stack=>({...stack,groups:[],candidates:matching3DGroups(stack.groups,article,matching).slice(0,limit)}));let occurrences=0,layers=0;
 for(let position=0;position<limit;position++)for(const stack of visible){const group=stack.candidates[position];if(group&&occurrences+group.members.length<=12000&&layers<256){stack.groups.push(group);occurrences+=group.members.length;layers++;}}
 for(const stack of visible){Object.assign(stack,stack.layout||{x:0,y:0,width:80,height:80});stack.cursor=Math.max(0,Math.min(stack.groups.length-1,cursors[stack.cluster]||0));delete stack.candidates;}
 return visible;
}

export function clusterLayerCoordinates(stack) {
 const layout=stack.layout||clusterMapLayout([stack],stack.nodes).get(stack.cluster);
 return Object.fromEntries(stack.nodes.map(node=>[node.id,{x:((Number.isFinite(node.x)?node.x:0)-layout.centerX)*layout.scale,y:-((Number.isFinite(node.y)?node.y:0)-layout.centerY)*layout.scale,z:0}]));
}

export function clusterMapLayout(stacks,nodes) {
 const bounds=members=>{const xs=members.map(node=>Number.isFinite(node.x)?node.x:0),ys=members.map(node=>Number.isFinite(node.y)?node.y:0);return {left:xs.length?Math.min(...xs):0,right:xs.length?Math.max(...xs):0,top:ys.length?Math.min(...ys):0,bottom:ys.length?Math.max(...ys):0};};
 const all=bounds(nodes),centerX=(all.left+all.right)/2,centerY=(all.top+all.bottom)/2,clusters=new Map();for(const node of nodes)if(Number(node.cluster)>0){const key=String(node.cluster);if(!clusters.has(key))clusters.set(key,[]);clusters.get(key).push(node);}
 const extents=[...clusters.values()].map(members=>{const box=bounds(members);return Math.max(box.right-box.left,box.bottom-box.top);}).filter(extent=>extent>0).sort((left,right)=>left-right),scale=400/(extents[Math.floor(extents.length/2)]||100);
 return new Map(stacks.map(stack=>{const box=bounds(stack.nodes),localX=(box.left+box.right)/2,localY=(box.top+box.bottom)/2;return [stack.cluster,{x:(localX-centerX)*scale,y:-(localY-centerY)*scale,width:Math.max(80,(box.right-box.left)*scale+64),height:Math.max(80,(box.bottom-box.top)*scale+64),centerX:localX,centerY:localY,scale}];}));
}

export function stackMapCenter(stacks) {
 if(!stacks.length)return {x:0,y:0};
 return {x:(Math.min(...stacks.map(stack=>stack.x-stack.width/2))+Math.max(...stacks.map(stack=>stack.x+stack.width/2)))/2,y:(Math.min(...stacks.map(stack=>stack.y-stack.height/2))+Math.max(...stacks.map(stack=>stack.y+stack.height/2)))/2};
}

export function wheelStackStep(cursor,count,delta,mode=0,remainder=0) {
 const pixels=delta*(mode===1?16:mode===2?400:1),amount=Math.max(-240,Math.min(240,pixels))+remainder;
 if(Math.abs(amount)<60)return {cursor,remainder:amount};
 return {cursor:Math.max(0,Math.min(count-1,cursor+Math.sign(amount))),remainder:0};
}
export function threeDPreviewSummary({articles, totalArticles, combinations, totalCombinations, crossing}) {
 return '3D preview: '+articles+' / '+totalArticles+' articles in '+combinations+' / '+totalCombinations+' within-cluster combinations'+(crossing?' · '+crossing+' cross-cluster groups stay in 2D':'')+'. Analysis unchanged.';
}

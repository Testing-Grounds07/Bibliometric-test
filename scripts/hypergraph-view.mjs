import {buildHyperedges} from './community-methods.mjs';
import {couplingHyperedges} from './coupling-hypergraph.mjs';

export function visibleHyperedges(edges, nodes, focus = {}, limit = 60) {
 const visible = new Set(nodes.map(node => node.id));
 const cluster = new Set(nodes.filter(node => String(node.cluster) === String(focus.cluster)).map(node => node.id));
 const pair = focus.edge ? focus.edge.split('|') : [];
 const eligible = edges.filter(edge => edge.members.length >= 3 && edge.members.every(id => visible.has(id)) && (!focus.node || edge.members.includes(focus.node)) && (!pair.length || pair.every(id => edge.members.includes(id))) && (!cluster.size || edge.members.some(id => cluster.has(id))));
 eligible.sort((left, right) => (right.articles?.length || 0) - (left.articles?.length || 0) || left.members.length - right.members.length || String(left.id).localeCompare(String(right.id)));
 return {edges: eligible.slice(0, limit), total: eligible.length};
}

export function hullPath(points, padding = 12) {
 if (points.length < 3) return '';
 const expanded = points.flatMap(point => [[-padding,-padding],[padding,-padding],[padding,padding],[-padding,padding]].map(([offsetX,offsetY]) => ({x:point.x+offsetX,y:point.y+offsetY})));
 expanded.sort((left,right) => left.x-right.x || left.y-right.y);
 const cross = (first,second,third) => (second.x-first.x)*(third.y-first.y)-(second.y-first.y)*(third.x-first.x);
 const half = sequence => {const result=[];for(const point of sequence){while(result.length>=2&&cross(result.at(-2),result.at(-1),point)<=0)result.pop();result.push(point);}return result;};
 const lower=half(expanded),upper=half([...expanded].reverse());
 return 'M'+[...lower.slice(0,-1),...upper.slice(0,-1)].map(point => point.x+','+point.y).join('L')+'Z';
}

export function clusterCombinations(edges, nodes, cluster, limit = 2000) {
 const members=new Set(nodes.filter(node=>String(node.cluster)===String(cluster)).map(node=>node.id));
 const all=edges.filter(edge=>edge.members.length>=3&&edge.members.every(id=>members.has(id))).map(edge=>({...edge,id:edge.id||edge.reference}));
 all.sort((left,right)=>(right.articles?.length||0)-(left.articles?.length||0)||left.members.length-right.members.length||String(left.id).localeCompare(String(right.id)));
 return {groups:all.slice(0,limit),total:all.length};
}

if (typeof window !== 'undefined') {
 const create = (tag,attributes,parent) => {const node=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [name,value]of Object.entries(attributes))node.setAttribute(name,value);parent?.append(node);return node;};
 let cachedGraph,cachedEdges,cachedError;
 window.ATLAS_HYPERGRAPH_VIEW = {
  hullPath,
  forCluster(graph,bundles,cluster,nodes) {
   const edges=graph.hyperedges||(graph.canvasKind==='coupling'?couplingHyperedges(graph):buildHyperedges(graph,bundles||[],20000));
   return clusterCombinations(edges,nodes,cluster);
  },
  draw({graph,nodes,viewport,screen,radius,color,mode,focus,status,inspect,bundles}) {
   viewport.closest('svg').dataset.representation=mode;
   viewport.querySelector('#hyperedgeOverlay')?.remove();
   if(mode==='network'){status.hidden=true;return;}
   status.hidden=false;
   const coupling=graph.canvasKind==='coupling';
   if(cachedGraph!==graph){cachedGraph=graph;cachedError=null;try{cachedEdges=(graph.hyperedges||(coupling?couplingHyperedges(graph):buildHyperedges(graph,bundles||graph.bundles||[],20000))).map(edge=>({...edge,id:edge.id||edge.reference}));}catch(error){cachedEdges=[];cachedError=error.message;}}
   if(cachedError){status.textContent=cachedError;return;}
   const selected=visibleHyperedges(cachedEdges,nodes,focus),byId=new Map(nodes.map(node=>[node.id,node]));
   status.textContent=selected.total?`${selected.edges.length} of ${selected.total} eligible ${coupling?'shared-reference groups':'combinations'} shown · ${coupling?'deterministic reference order':'strongest support first'}. ${mode==='layered'?'Layers separate group sizes, not importance. ':''}Outlines are evidence groups, not cluster boundaries; enclosed non-members do not count.`:coupling?'No complete shared-reference groups with 3+ members in this selection.':'No complete 3+ member combinations in this selection. Choose a higher/combined order, another focus, or generate higher orders.';
   const layer=create('g',{id:'hyperedgeOverlay','aria-label':'Exact higher-order combinations'},null);
   viewport.insertBefore(layer,viewport.firstChild);
   const maximum=Math.max(1,...selected.edges.map(edge=>edge.articles?.length||0));
   const highlight = edge => {const members=new Set(edge?.members||[]);for(const node of viewport.querySelectorAll('[data-node]'))node.style.opacity=edge?(members.has(node.dataset.node)?'1':'.12'):'';for(const shape of layer.querySelectorAll('[data-combination]'))shape.style.opacity=edge?(shape.dataset.combination===edge.id?'1':'.08'):'';};
   for(const edge of selected.edges){
    const members=edge.members.map(id=>byId.get(id));
    const points=members.map(screen),clusters=new Set(members.map(node=>node.cluster));
    const stroke=clusters.size===1?color(members[0]):'#888888';
    const intensity=coupling?.6:.2+.65*Math.log1p(edge.articles?.length||0)/Math.log1p(maximum);
    const description=coupling?`${edge.members.length} source articles citing one shared reference`:`${edge.members.length} exact members; ${edge.articles?.length||0} supporting sources`;
    const group=create('g',{'data-combination':edge.id,class:'hyperedge-combination',tabindex:0,role:'button','aria-label':description+'. Activate for exact members.'},layer);
    create('path',{d:hullPath(points,Math.max(12,...members.map(radius))+5),fill:stroke,'fill-opacity':.025+intensity*.055,stroke,'stroke-opacity':intensity,'stroke-width':1.4,'stroke-linejoin':'round','pointer-events':'stroke'},group);
    create('title',{},group).textContent=description;
    group.onpointerenter=()=>highlight(edge);group.onpointerleave=()=>highlight(null);group.onfocus=()=>highlight(edge);group.onblur=()=>highlight(null);
    const activate=event=>{event.stopPropagation();highlight(edge);inspect(edge);};group.onclick=activate;
    group.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();activate(event);}};
   }
  }
 };
}

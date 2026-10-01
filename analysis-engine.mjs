import createGraph from 'ngraph.graph';import {detectClusters} from 'ngraph.leiden';
function pairKey(a,b){return a<b?a+'|'+b:b+'|'+a}function add(m,k,v){m.set(k,(m.get(k)||0)+v)}
function build(corpus,opt={}){const method=opt.method||'co_citation',counting=opt.counting||'full',minNode=+opt.minNode||3,minRaw=+opt.minRaw||2,norm=method==='direct_citation'?'raw':(opt.normalization||'association_strength'),aliases=opt.referenceAliases||{};let freq=new Map(),pairs=new Map(),nodesBase=[];
const canonical=id=>{let seen=new Set();while(aliases[id]&&aliases[id]!==id&&!seen.has(id)){seen.add(id);id=aliases[id]}return id};
const refsOf=w=>[...new Set((w.referenced_works||[]).map(canonical))];
if(method==='co_citation'){corpus.forEach(w=>refsOf(w).forEach(x=>freq.set(x,(freq.get(x)||0)+1)));corpus.forEach(w=>{let r=refsOf(w).filter(x=>(freq.get(x)||0)>=minNode),den=r.length>1?r.length*(r.length-1)/2:1,wt=counting==='fractional'?1/den:1;for(let i=0;i<r.length;i++)for(let j=i+1;j<r.length;j++)add(pairs,pairKey(r[i],r[j]),wt)});nodesBase=[...freq].filter(x=>x[1]>=minNode).map(([id,occurrence])=>({id,occurrence}))}
else if(method==='bibliographic_coupling'){let inv=new Map();corpus.forEach(w=>refsOf(w).forEach(r=>{if(!inv.has(r))inv.set(r,[]);inv.get(r).push(w.id)}));corpus.forEach(w=>freq.set(w.id,refsOf(w).length));inv.forEach(ws=>{let u=[...new Set(ws)],den=u.length>1?u.length*(u.length-1)/2:1,wt=counting==='fractional'?1/den:1;for(let i=0;i<u.length;i++)for(let j=i+1;j<u.length;j++)add(pairs,pairKey(u[i],u[j]),wt)});nodesBase=corpus.filter(w=>refsOf(w).length>=minNode).map(w=>({id:w.id,occurrence:refsOf(w).length}))}
else if(method==='direct_citation'){let ids=new Set(corpus.map(w=>w.id));corpus.forEach(w=>freq.set(w.id,1));corpus.forEach(w=>(w.referenced_works||[]).filter(x=>ids.has(x)).forEach(x=>add(pairs,w.id+'|'+x,1)));nodesBase=corpus.map(w=>({id:w.id,occurrence:1}))}
else throw Error('Unsupported network method');
let nodeMap=new Map(nodesBase.map(n=>[n.id,n])),edges=[];for(const[k,raw]of pairs){if(raw<minRaw)continue;let z=k.split('|'),a=z[0],b=z[1];if(!nodeMap.has(a)||!nodeMap.has(b))continue;let ci=nodeMap.get(a).occurrence,cj=nodeMap.get(b).occurrence,v=raw;if(norm==='association_strength')v=raw/(ci*cj);else if(norm==='cosine')v=raw/Math.sqrt(ci*cj);else if(norm==='jaccard')v=raw/(ci+cj-raw);edges.push({source:a,target:b,raw_weight:raw,normalized_weight:v,weight:norm==='raw'?raw:v})}
let degree=new Map(),totalLinkStrength=new Map();edges.forEach(e=>{degree.set(e.source,(degree.get(e.source)||0)+1);degree.set(e.target,(degree.get(e.target)||0)+1);totalLinkStrength.set(e.source,(totalLinkStrength.get(e.source)||0)+e.raw_weight);totalLinkStrength.set(e.target,(totalLinkStrength.get(e.target)||0)+e.raw_weight)});let nodes=nodesBase.map(n=>({...n,degree:degree.get(n.id)||0,total_link_strength:totalLinkStrength.get(n.id)||0,isolated:!degree.get(n.id)}));
cluster(nodes,edges,opt);return{method,counting,fractional_scheme:counting==='fractional'?(method==='co_citation'?'unit total pair weight per citing paper':'unit total pair weight per shared reference'):null,normalization:norm,min_node_occurrence:minNode,min_raw_edge_count:minRaw,reference_aliases:aliases,nodes,edges,stats:{nodes:nodes.length,edges:edges.length,isolated_nodes:nodes.filter(n=>n.isolated).length,connected_nodes:nodes.filter(n=>!n.isolated).length}}}
function cluster(nodes,edges,opt){let connected=nodes.filter(n=>!n.isolated);if(!connected.length)return;let g=createGraph();connected.forEach(n=>g.addNode(n.id));
// CPM compares link weights to its resolution penalty. Use the mean retained link
// weight as the unit so gamma=1 remains meaningful for every normalization.
let weightScale=edges.reduce((sum,e)=>sum+e.weight,0)/edges.length;if(!Number.isFinite(weightScale)||weightScale<=0)throw Error('Network has no positive relationship weights');edges.forEach(e=>g.addLink(e.source,e.target,{weight:e.weight/weightScale}));
let restarts=Math.max(1,+opt.restarts||10),best=null;for(let i=0;i<restarts;i++){let r=detectClusters(g,{randomSeed:(+opt.seed||42)+i,quality:'cpm',resolution:+opt.resolution||0.02,linkWeight:l=>l.data?.weight||1});let q=r.quality();if(!best||q>best.q)best={r,q,seed:(+opt.seed||42)+i}}let cs=best.r.getCommunities(),membership={};cs.forEach((ids,c)=>ids.forEach(id=>membership[id]=c));nodes.forEach(n=>{n.community=n.isolated?null:membership[n.id]});let vals=[...new Set(Object.values(membership))].sort((a,b)=>a-b),rem=new Map(vals.map((v,i)=>[v,i]));nodes.forEach(n=>{if(n.community!=null)n.community=rem.get(n.community)});opt._cluster_meta={algorithm:'leiden',objective:'cpm',resolution:+opt.resolution||0.02,weight_scale:weightScale,seed:+opt.seed||42,restarts,selected_seed:best.seed,quality:best.q,communities:vals.length}}
function groupBroader(nodes,edges){
  const sizes=new Map(),byId=new Map(),between=new Map();
  for(const node of nodes){byId.set(node.id,node);if(node.community!=null)sizes.set(node.community,(sizes.get(node.community)||0)+1)}
  for(const edge of edges){const a=byId.get(edge.source)?.community,b=byId.get(edge.target)?.community;if(a==null||b==null||a===b)continue;add(between,pairKey(a,b),edge.raw_weight||1)}
  if(!sizes.size)return {membership:{},groups:0,unlinkedGroup:null};
  const graph=createGraph();for(const c of sizes.keys())graph.addNode(c);
  for(const [key,weight] of between){const [a,b]=key.split('|').map(Number);graph.addLink(a,b,{weight})}
  const result=detectClusters(graph,{randomSeed:42,quality:'modularity',resolution:1,linkWeight:l=>l.data?.weight||1});
  const communities=[...result.getCommunities().values()].map(ids=>({ids,size:ids.reduce((sum,id)=>sum+(sizes.get(id)||0),0)}));
  // The bucket is explicitly a collection of small unlinked groups, not a community.
  const substantial=communities.filter(c=>c.size>=10).sort((a,b)=>b.size-a.size||Math.min(...a.ids)-Math.min(...b.ids));
  const small=communities.filter(c=>c.size<10);
  const membership={};substantial.forEach((c,i)=>c.ids.forEach(id=>membership[id]=i));
  const unlinkedGroup=small.length?substantial.length:null;
  for(const c of small)for(const id of c.ids)membership[id]=unlinkedGroup;
  const smallUnlinked=[...between.keys()].every(key=>{const [a,b]=key.split('|').map(Number);return membership[a]===membership[b]||membership[a]!==unlinkedGroup&&membership[b]!==unlinkedGroup});
  return {membership,groups:substantial.length+(small.length?1:0),unlinkedGroup,smallUnlinked,smallGroups:small.length,smallWorks:small.reduce((sum,c)=>sum+c.size,0),originalCommunities:sizes.size,method:'Leiden modularity on citation links between original communities'}
}
export {build,groupBroader};

import {analyzeCPM} from './auto-cpm.mjs';
import {invalidateScientificOutputs} from './scientific-invalidation.mjs';
export function expandedMembers(base, anchors, referenceMinimum=5, minimumSupport=5, parentThreshold=10){
 const original=new Set(anchors),selected=new Set(anchors),eligible=new Set(base.nodes.filter(node=>node.citations>=referenceMinimum&&node.citations<parentThreshold).map(node=>node.id));
 for(const edge of base.links){if(edge.count<minimumSupport)continue;if(original.has(edge.source)&&eligible.has(edge.target))selected.add(edge.target);if(original.has(edge.target)&&eligible.has(edge.source))selected.add(edge.source);}
 return [...selected];
}
export function drillGraph(base, members, bundles, order, cap, minimumSupport=5) {
 const selected=new Set(members),graph=structuredClone(base);
 graph.nodes=graph.nodes.filter(node=>selected.has(node.id));
 graph.order=order;graph.maximumOrder=cap;graph.minimumSupport=minimumSupport;graph.analysisId=null;
 const projected=new Map();
 for(const bundle of bundles){const members=bundle.members.filter(id=>selected.has(id)).sort();if(members.length<3)continue;const key=members.join('|');if(!projected.has(key))projected.set(key,{id:'drill:'+key,members,articles:new Set()});for(const article of bundle.articles)projected.get(key).articles.add(article);}
 const postings=new Map(graph.nodes.map(node=>[node.id,new Set(node.articles)]));
 graph.bundles=[...projected.values()].map(bundle=>({...bundle,articles:[...postings.get(bundle.members[0])].filter(article=>bundle.members.every(id=>postings.get(id).has(article)))})).filter(bundle=>bundle.articles.length>=minimumSupport);
 const pairBundles=new Map();
 for(const bundle of graph.bundles)for(let left=0;left<bundle.members.length;left++)for(let right=left+1;right<bundle.members.length;right++){const key=[bundle.members[left],bundle.members[right]].sort().join('|');if(!pairBundles.has(key))pairBundles.set(key,[]);pairBundles.get(key).push(bundle);}
 const nodes=new Map(graph.nodes.map(node=>[node.id,node]));
 graph.links=graph.links.filter(edge=>selected.has(edge.source)&&selected.has(edge.target)).flatMap(edge=>{
  const eligible=(pairBundles.get([edge.source,edge.target].sort().join('|'))||[]).filter(bundle=>order==='all'||bundle.members.length>=order);
  const articles=order==='all'||order===2?edge.articles:[...new Set(eligible.flatMap(bundle=>bundle.articles))];
  if(articles.length<minimumSupport)return [];
  const orders=Object.fromEntries(articles.map(id=>[id,2]));
  for(const bundle of eligible)for(const id of bundle.articles)if(id in orders)orders[id]=Math.max(orders[id],Math.min(cap,bundle.members.length));
  const score=order==='all'?Object.values(orders).reduce((sum,size)=>sum+1+Math.log2(size-1),0):articles.length;
  return [{...edge,articles,count:articles.length,strength:score/(nodes.get(edge.source).citations*nodes.get(edge.target).citations),bundleIds:order===2?[]:eligible.map(bundle=>bundle.id),combinedScore:score,higherOrderBonus:score-articles.length,maximumOrderByArticle:orders,maximumSupportedOrder:Math.max(...Object.values(orders)),orderProfile:Array.from({length:Math.max(0,cap-1)},(_,position)=>({order:position+2,support:Object.values(orders).filter(size=>size>=position+2).length}))}];
 });
 const degree=new Map(graph.nodes.map(node=>[node.id,0]));
 for(const edge of graph.links){degree.set(edge.source,degree.get(edge.source)+1);degree.set(edge.target,degree.get(edge.target)+1);}
 for(const node of graph.nodes){node.cluster=0;node.degree=degree.get(node.id);}
 graph.excludedByOrder=graph.nodes.filter(node=>!node.degree).length;
 return invalidateScientificOutputs(graph);
}
export const analyzeDrill=analyzeCPM;

(() => {
 'use strict';
 const vectors=new WeakMap();
 function vector(document){
  if(!vectors.has(document)){const bytes=atob(document.embedding),values=Array.from(bytes,value=>{const code=value.charCodeAt(0);return code>127?code-256:code;}),norm=Math.hypot(...values)||1;vectors.set(document,values.map(value=>value/norm));}
  return vectors.get(document);
 }
 function describe(nodes,data){
  const groups=new Map(),totals=new Map(),appearances=new Map();
  for(const node of nodes){if(!node.cluster)continue;if(!groups.has(node.cluster))groups.set(node.cluster,[]);groups.get(node.cluster).push(node);}
  const counts=new Map();
  for(const [cluster,members] of groups){
   const terms=new Map();let length=0;
   for(const node of members){const document=data.documents[node.id];if(!document)continue;for(const phrase of document.phrases){const count=Math.min(3,phrase.count);length+=count;if(!terms.has(phrase.text))terms.set(phrase.text,{text:phrase.text,count:0,relevance:0,sources:[]});const term=terms.get(phrase.text);term.count+=count;term.relevance+=Math.max(0,phrase.semantic);term.sources.push({id:node.id,evidence:phrase.evidence});}}
   counts.set(cluster,{terms,length});
   for(const term of terms.values()){totals.set(term.text,(totals.get(term.text)||0)+term.count);appearances.set(term.text,(appearances.get(term.text)||0)+1);}
  }
  const average=[...counts.values()].reduce((sum,item)=>sum+item.length,0)/Math.max(1,groups.size),result={};
  for(const [cluster,members] of groups){
   const {terms,length}=counts.get(cluster),ranked=[...terms.values()].map(term=>({...term,score:term.sources.length/Math.max(1,members.length)*Math.log1p(average/totals.get(term.text))*(.35+.65*term.relevance/term.sources.length)/Math.sqrt(appearances.get(term.text))})).sort((left,right)=>(members.length>=3?Number(right.sources.length>=2)-Number(left.sources.length>=2):0)||right.score-left.score||left.text.localeCompare(right.text));
   const keywords=[];
   for(const term of ranked){if(keywords.some(other=>(' '+other.text+' ').includes(' '+term.text+' ')||(' '+term.text+' ').includes(' '+other.text+' ')))continue;keywords.push(term);if(keywords.length===5)break;}
   const covered=members.filter(node=>data.documents[node.id]),centroid=Array(data.dimensions).fill(0);
   for(const node of covered)vector(data.documents[node.id]).forEach((value,position)=>centroid[position]+=value);
   const norm=Math.hypot(...centroid)||1;
   const seenTitles=new Set(),representatives=covered.map(node=>({id:node.id,similarity:vector(data.documents[node.id]).reduce((sum,value,position)=>sum+value*centroid[position]/norm,0),citations:node.citations})).sort((left,right)=>right.similarity-left.similarity||right.citations-left.citations||left.id.localeCompare(right.id)).filter(reference=>{const title=(data.documents[reference.id].title||reference.id).toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();if(seenTitles.has(title))return false;seenTitles.add(title);return true;}).slice(0,3);
   const withAbstract=covered.filter(node=>data.documents[node.id].abstract).length;
   result[cluster]={heading:keywords.slice(0,2).map(term=>term.text).join(' · ')||'Insufficient text',keywords,representatives,total:members.length,withText:covered.length,withAbstract,evidenceMode:withAbstract?'Titles + available abstracts':'Title-only',comparisonClusters:groups.size,method:data.method,model:data.model,revision:data.revision};
  }
  return result;
 }
 window.ATLAS_THEMES={describe};
})();

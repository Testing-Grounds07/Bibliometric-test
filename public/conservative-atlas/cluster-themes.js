(() => {
 'use strict';
 const KEYWORD_VERSION='sibling-source-contrast-1';
 const vectors=new WeakMap();
 function vector(document){
  if(!vectors.has(document)){const bytes=atob(document.embedding),values=Array.from(bytes,value=>{const code=value.charCodeAt(0);return code>127?code-256:code;}),norm=Math.hypot(...values)||1;vectors.set(document,values.map(value=>value/norm));}
  return vectors.get(document);
 }
 function describe(nodes,data){
  const groups=new Map(),totals=new Map(),appearances=new Map();
  for(const node of nodes){if(!node.cluster)continue;if(!groups.has(node.cluster))groups.set(node.cluster,[]);groups.get(node.cluster).push(node);}
  const counts=new Map();let corpusWithText=0;const corpusSupports=new Map();
  for(const [cluster,members] of groups){
   const terms=new Map();let length=0;
   for(const node of members){const document=data.documents[node.id];if(!document)continue;const seenPhrases=new Set();for(const phrase of document.phrases){if(seenPhrases.has(phrase.text))continue;seenPhrases.add(phrase.text);const count=Math.min(3,phrase.count);length+=count;if(!terms.has(phrase.text))terms.set(phrase.text,{text:phrase.text,count:0,relevance:0,sources:[]});const term=terms.get(phrase.text);term.count+=count;term.relevance+=Math.max(0,phrase.semantic);term.sources.push({id:node.id,evidence:phrase.evidence});}}
   const withText=members.filter(node=>data.documents[node.id]).length;corpusWithText+=withText;
   counts.set(cluster,{terms,length,withText});
   for(const term of terms.values()){totals.set(term.text,(totals.get(term.text)||0)+term.count);appearances.set(term.text,(appearances.get(term.text)||0)+1);corpusSupports.set(term.text,(corpusSupports.get(term.text)||0)+term.sources.length);}
  }
  const average=[...counts.values()].reduce((sum,item)=>sum+item.length,0)/Math.max(1,groups.size),result={};
  for(const [cluster,members] of groups){
   const {terms,length,withText}=counts.get(cluster),outsideWithText=corpusWithText-withText,ranked=[...terms.values()].map(term=>{
    const supportingMembers=term.sources.length,outsideSupport=(corpusSupports.get(term.text)||0)-supportingMembers,withinRate=supportingMembers/Math.max(1,withText),outsideRate=outsideSupport/Math.max(1,outsideWithText);
    const baseScore=supportingMembers/Math.max(1,members.length)*Math.log1p(average/totals.get(term.text))*(.35+.65*term.relevance/supportingMembers)/Math.sqrt(appearances.get(term.text));
    // An experimental descriptive ranking multiplier, not significance or a
    // probability: ubiquitous observed phrases get less naming priority.
    const contrast=outsideWithText ? .05+Math.max(0,withinRate-outsideRate)/Math.max(withinRate,1e-12) : 1;
    return {...term,score:baseScore*contrast,baseScore,supportingMembers,clusterWithText:withText,outsideSupport,outsideWithText,withinRate,outsideRate,corpusShared:outsideWithText>0&&outsideSupport>0&&outsideRate>=.8*withinRate};
   }).sort((left,right)=>(members.length>=3?Number(right.sources.length>=2)-Number(left.sources.length>=2):0)||right.score-left.score||left.text.localeCompare(right.text));
   const keywords=[];
   for(const term of ranked){if(keywords.some(other=>(' '+other.text+' ').includes(' '+term.text+' ')||(' '+term.text+' ').includes(' '+other.text+' ')))continue;keywords.push(term);if(keywords.length===5)break;}
   const covered=members.filter(node=>data.documents[node.id]),centroid=Array(data.dimensions).fill(0);
   for(const node of covered)vector(data.documents[node.id]).forEach((value,position)=>centroid[position]+=value);
   const norm=Math.hypot(...centroid)||1;
   const seenTitles=new Set(),representatives=covered.map(node=>({id:node.id,similarity:vector(data.documents[node.id]).reduce((sum,value,position)=>sum+value*centroid[position]/norm,0),citations:node.citations})).sort((left,right)=>right.similarity-left.similarity||right.citations-left.citations||left.id.localeCompare(right.id)).filter(reference=>{const title=(data.documents[reference.id].title||reference.id).toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();if(seenTitles.has(title))return false;seenTitles.add(title);return true;}).slice(0,3);
   const withAbstract=covered.filter(node=>data.documents[node.id].abstract).length;
   result[cluster]={heading:keywords.slice(0,2).map(term=>term.text).join(' · ')||'Insufficient text',keywords,representatives,total:members.length,withText:covered.length,withAbstract,evidenceMode:withAbstract?'Titles + available abstracts':'Title-only',comparisonClusters:groups.size,keywordVersion:KEYWORD_VERSION,sharedVocabulary:ranked.filter(term=>term.corpusShared&&term.supportingMembers>=2).sort((a,b)=>(b.supportingMembers+b.outsideSupport)-(a.supportingMembers+a.outsideSupport)||a.text.localeCompare(b.text)).slice(0,3).map(term=>({text:term.text,supportingMembers:term.supportingMembers,clusterWithText:term.clusterWithText,outsideSupport:term.outsideSupport,outsideWithText:term.outsideWithText})),supportScope:'Distinct retained source IDs whose cached verbatim candidate list contains the phrase; absence from that list is not absence from a paper. Counts are descriptive, not significance or independent-study counts.',method:data.method,model:data.model,revision:data.revision};
  }
  return result;
 }
 window.ATLAS_THEMES={describe,version:KEYWORD_VERSION};
})();

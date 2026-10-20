import {canonicalMemberships} from './community-methods.mjs';
import {Matrix, EigenvalueDecomposition} from 'ml-matrix';

export const TRIAL_VERSION = 'hypergraph-trials-v2';
export const TRIAL_METHODS = {
 spectral:{name:'Spectral · normalized cut',score:'Zhou normalized-cut relaxation',search:'Symmetric eigendecomposition + k-means',help:'Embed articles using the weighted incidence Laplacian, then group the embedding. Eigenvector accuracy is checked explicitly. This is a matrix method, not a tensor method.',reference:'https://papers.neurips.cc/paper/3128-learning-with-hypergraphs-clustering-classification-and-embedding.pdf'},
 aon:{name:'Degree-adjusted AON · approximation',score:'Assortative AON weighted profile objective',search:'Seeded vertex coordinate ascent',help:'Estimate within/outside rates for each combination size, with fixed degree-derived propensities. Fractional evidence weights make this a quasi-likelihood trial, NOT a full jointly fitted DCHSBM or an MDL-selected hierarchy.',reference:'https://arxiv.org/abs/2101.09611'},
 balanced:{name:'Balanced hyperedge cut',score:'Weighted cut-net cost with size bounds',search:'Balanced initialization + vertex/swap refinement',help:'Request k roughly balanced groups while cutting as little whole-combination weight as possible. This custom bounded heuristic is not hMETIS, KaHyPar or their multilevel algorithms. Equal-size constraints can split natural communities.',reference:'https://kahypar.org/'},
 local:{name:'Local · explore around an article',score:'Whole-hyperedge conductance',search:'Incidence PageRank + seed-containing sweep',help:'Return one neighborhood around a seed. The random walk includes self-returns; the sweep evaluates whole cut hyperedges. This is a custom diffusion/sweep trial, not the published flow solver.',reference:'https://www.cs.cornell.edu/~arb/papers/hypergraph-ratio-cut-KDD-2020.pdf'},
 categorical:{name:'Categorical · source-period demo',score:'Weight of category-consistent whole hyperedges',search:'Seeded categorical label moves',help:'Label each combination by the most common publication decade among its supporting sources, then seek agreement with those labels. These are constructed period categories, NOT semantic themes. This is a heuristic, not the paper’s approximation algorithm or a tensor decomposition.',reference:'https://www.cs.cornell.edu/~arb/papers/cat-edge-clus-WWW-2020.pdf'}
};
const sum = values => values.reduce((total,value)=>total+value,0);
const dot = (left,right) => left.reduce((total,value,index)=>total+value*right[index],0);
const rng = seed => { let state=seed>>>0; return ()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;}; };
const shuffle = (values,random) => { const copy=[...values];for(let index=copy.length-1;index>0;index--){const other=Math.floor(random()*(index+1));[copy[index],copy[other]]=[copy[other],copy[index]];}return copy; };

export function trialNetwork(edges) {
 if (!Array.isArray(edges) || edges.length>20000) throw new Error('Trial limit: 20,000 complete combinations. Narrow the scope; no truncation is used.');
 const ids=[...new Set(edges.flatMap(edge=>edge.members))].sort();
 if(ids.length>800)throw new Error('Trial limit: 800 linked articles. Narrow the scope; no truncated network is used.');
 const positions=new Map(ids.map((id,index)=>[id,index])),degree=Array(ids.length).fill(0),incidence=ids.map(()=>[]);
 let occurrences=0;
 const groups=edges.map((edge,index)=>{
  if(!Number.isFinite(edge.weight)||edge.weight<=0||edge.members.length<2||new Set(edge.members).size!==edge.members.length)throw new Error('Invalid weighted hyperedge');
  occurrences+=edge.members.length;if(occurrences>200000)throw new Error('Trial incidence limit exceeded; no truncation is used.');
  const members=edge.members.map(id=>positions.get(id));for(const member of members){degree[member]+=edge.weight;incidence[member].push(index);}
  return {...edge,members};
 });
 return {ids,groups,degree,incidence,volume:sum(degree),weight:sum(edges.map(edge=>edge.weight))};
}

export function normalizedOperator(network,vector) {
 const result=Array(network.ids.length).fill(0);
 for(const edge of network.groups){const value=sum(edge.members.map(member=>vector[member]/Math.sqrt(network.degree[member])))*edge.weight/edge.members.length;for(const member of edge.members)result[member]+=value/Math.sqrt(network.degree[member]);}
 return result;
}

export function spectralEigenspace(network,count) {
 if(!Number.isInteger(count)||count<1||count>network.ids.length)throw new Error('Invalid spectral dimension');
 const matrix=Matrix.zeros(network.ids.length,network.ids.length),inverse=network.degree.map(value=>1/Math.sqrt(value));
 for(const edge of network.groups)for(const left of edge.members)for(const right of edge.members)matrix.set(left,right,matrix.get(left,right)+edge.weight/edge.members.length*inverse[left]*inverse[right]);
 const decomposition=new EigenvalueDecomposition(matrix,{assumeSymmetric:true}),values=decomposition.realEigenvalues,vectors=decomposition.eigenvectorMatrix;
 const order=values.map((_,index)=>index).sort((left,right)=>values[right]-values[left]||left-right),basis=order.slice(0,count).map(column=>vectors.getColumn(column));
 const residuals=basis.map((vector,index)=>{const applied=normalizedOperator(network,vector),difference=applied.map((value,member)=>value-values[order[index]]*vector[member]);return Math.sqrt(dot(difference,difference));});
 let orthogonalityError=0;
 for(let left=0;left<count;left++)for(let right=0;right<=left;right++)orthogonalityError=Math.max(orthogonalityError,Math.abs(dot(basis[left],basis[right])-Number(left===right)));
 const gap=count<order.length?values[order[count-1]]-values[order[count]]:null;
 return {basis,residual:Math.max(...residuals),eigenResiduals:residuals,orthogonalityError,boundaryGap:gap,converged:residuals.every(value=>Number.isFinite(value)&&value<=1e-8)&&orthogonalityError<=1e-8,engine:'ml-matrix 6.15.0 symmetric EVD',residualTolerance:1e-8};
}

function kmeans(points,count,random,starts=3) {
 let best;
 for(let trial=0;trial<starts;trial++){
  const centers=[points[Math.floor(random()*points.length)].slice()];
  while(centers.length<count){const distances=points.map(point=>Math.min(...centers.map(center=>sum(point.map((value,index)=>(value-center[index])**2)))));let threshold=random()*sum(distances),chosen=distances.length-1;for(let index=0;index<distances.length;index++){threshold-=distances[index];if(threshold<=0){chosen=index;break;}}centers.push(points[chosen].slice());}
  let labels=points.map(()=>-1),converged=false;
  for(let pass=0;pass<60;pass++){
   const next=points.map(point=>{let selected=0,distance=Infinity;centers.forEach((center,group)=>{const candidate=sum(point.map((value,index)=>(value-center[index])**2));if(candidate<distance){distance=candidate;selected=group;}});return selected;});
   const sizes=Array(count).fill(0);for(const group of next)sizes[group]++;
   for(let group=0;group<count;group++)if(!sizes[group]){let chosen=-1,distance=-1;points.forEach((point,index)=>{const candidate=sum(point.map((value,column)=>(value-centers[next[index]][column])**2));if(sizes[next[index]]>1&&candidate>distance){chosen=index;distance=candidate;}});if(chosen<0)throw new Error('Cannot retain requested nonempty groups');sizes[next[chosen]]--;next[chosen]=group;sizes[group]++;}
   if(next.every((group,index)=>group===labels[index])){converged=true;break;}labels=next;
   for(let group=0;group<count;group++)centers[group]=points[0].map((_,column)=>sum(points.map((point,index)=>labels[index]===group?point[column]:0))/sizes[group]);
  }
  const cost=sum(points.map((point,index)=>sum(point.map((value,column)=>(value-centers[labels[index]][column])**2))));
  if(!best||cost<best.cost)best={labels,cost,converged};
 }
 return best;
}

function componentSets(network) {
 const seen=new Set(),components=[];
 for(let start=0;start<network.ids.length;start++)if(!seen.has(start)){const members=[],stack=[start];seen.add(start);while(stack.length){const member=stack.pop();members.push(member);for(const edge of network.incidence[member])for(const other of network.groups[edge].members)if(!seen.has(other)){seen.add(other);stack.push(other);}}components.push(members.sort((left,right)=>left-right));}
 return components;
}

function spectralFit(network,requested,random,progress) {
 const components=componentSets(network),allocation=components.map(()=>1),effective=Math.max(requested,components.length);
 for(let assigned=components.length;assigned<effective;assigned++){let target=-1,best=-1;components.forEach((members,index)=>{const priority=members.length/allocation[index];if(allocation[index]<members.length&&priority>best){target=index;best=priority;}});if(target<0)break;allocation[target]++;}
 const labels=Array(network.ids.length),residuals=[],spectralDiagnostics=[];let offset=0,converged=true;
 components.forEach((members,component)=>{
  const count=allocation[component];progress('Spectral component '+(component+1)+'/'+components.length);
  if(count===1){for(const member of members)labels[member]=offset;offset++;return;}
  const ids=new Set(members),sub=trialNetwork(network.groups.filter(edge=>ids.has(edge.members[0])).map(edge=>({...edge,members:edge.members.map(member=>network.ids[member])})));
  const eigenspace=spectralEigenspace(sub,count),{basis,...diagnostics}=eigenspace;
  residuals.push(eigenspace.residual);spectralDiagnostics.push({component:component+1,articles:sub.ids.length,dimensions:count,...diagnostics});if(!eigenspace.converged)converged=false;
  const points=sub.ids.map((_,index)=>{const row=basis.map(column=>column[index]),norm=Math.sqrt(dot(row,row));return row.map(value=>value/(norm||1));});
  const fitted=kmeans(points,count,random);spectralDiagnostics.at(-1).kmeansConverged=fitted.converged;if(!fitted.converged)converged=false;
  sub.ids.forEach((id,index)=>{labels[network.ids.indexOf(id)]=offset+fitted.labels[index];});offset+=count;
 });
 return {labels,converged,components:components.length,requestedGroups:requested,effectiveGroups:offset,subspaceResiduals:residuals,spectralDiagnostics,stoppingReason:converged?'numerical-checks-passed':'numerical-or-kmeans-limit'};
}

export function cutCost(network,labels) {
 return sum(network.groups.map(edge=>edge.members.every(member=>labels[member]===labels[edge.members[0]])?0:edge.weight));
}
export function normalizedCutCost(network,labels) {
 const volumes=new Map(),boundary=new Map();labels.forEach((group,index)=>volumes.set(group,(volumes.get(group)||0)+network.degree[index]));
 for(const edge of network.groups){const counts=new Map();for(const member of edge.members)counts.set(labels[member],(counts.get(labels[member])||0)+1);for(const [group,count]of counts)boundary.set(group,(boundary.get(group)||0)+edge.weight*count*(edge.members.length-count)/edge.members.length);}
 return sum([...volumes].map(([group,volume])=>(boundary.get(group)||0)/volume));
}

function mutablePartition(network,labels) {
 const counts=network.groups.map(edge=>{const row=new Map();for(const member of edge.members)row.set(labels[member],(row.get(labels[member])||0)+1);return row;});
 const update=(member,target)=>{const original=labels[member];for(const edge of network.incidence[member]){const row=counts[edge],remaining=row.get(original)-1;if(remaining)row.set(original,remaining);else row.delete(original);row.set(target,(row.get(target)||0)+1);}labels[member]=target;};
 return {counts,update};
}

export function balancedMoveGain(network,labels,counts,member,target) {
 const original=labels[member];if(original===target)return 0;
 let gain=0;
 for(const position of network.incidence[member]){const groups=counts[position],after=groups.size-Number(groups.get(original)===1)+Number(!groups.has(target));gain+=network.groups[position].weight*(Number(groups.size>1)-Number(after>1));}
 return gain;
}
export function balancedSwapGain(network,labels,counts,left,right,incidenceSets) {
 if(labels[left]===labels[right])return 0;
 let gain=0;
 for(const [member,other]of [[left,right],[right,left]])for(const position of network.incidence[member]){
  if(incidenceSets[other].has(position))continue;
  const groups=counts[position],after=groups.size-Number(groups.get(labels[member])===1)+Number(!groups.has(labels[other]));gain+=network.groups[position].weight*(Number(groups.size>1)-Number(after>1));
 }
 return gain;
}
function balancedFit(network,count,imbalance,random,starts,progress,maxPasses=96,resumeMemberships=null) {
 const cap=Math.ceil(network.ids.length/count*(1+imbalance)),indices=network.ids.map((_,index)=>index),incidenceSets=network.incidence.map(edges=>new Set(edges));let best;
 for(let trial=0;trial<starts;trial++){
  const labels=Array(network.ids.length);
  if(trial===0&&resumeMemberships){const groups=[...new Set(Object.values(resumeMemberships))].sort((left,right)=>left-right);if(groups.length!==count||Object.keys(resumeMemberships).length!==network.ids.length||network.ids.some(id=>!groups.includes(resumeMemberships[id])))throw new Error('Continuation needs the same evidence and group count');for(const [index,id]of network.ids.entries())labels[index]=groups.indexOf(resumeMemberships[id]);}
  else shuffle(indices,random).forEach((member,index)=>{labels[member]=index%count;});
  const state=mutablePartition(network,labels),sizes=Array(count).fill(0);for(const group of labels)sizes[group]++;
  if(sizes.some(size=>size<1||size>cap))throw new Error('Continuation violates the requested balance bounds');
  const gains=[],tolerance=1e-10;let passes=0,verified=false,remainingGain=null,verificationChecks=0;
  const bestMove=member=>{const original=labels[member];let target=original,gain=tolerance;if(sizes[original]>1)for(let group=0;group<count;group++)if(group!==original&&sizes[group]<cap){const improvement=balancedMoveGain(network,labels,state.counts,member,group);if(improvement>gain){target=group;gain=improvement;}}return {member,target,gain};};
  const move=proposal=>{const original=labels[proposal.member];state.update(proposal.member,proposal.target);sizes[original]--;sizes[proposal.target]++;};
  const swap=(left,right)=>{const original=labels[left],target=labels[right];state.update(left,target);state.update(right,original);};
  const verify=()=>{
   verificationChecks++;
   for(const member of indices){const proposal=bestMove(member);if(proposal.target!==labels[member])return {kind:'move',...proposal};}
   for(let left=0;left<indices.length;left++)for(let right=left+1;right<indices.length;right++)if(labels[left]!==labels[right]){const gain=balancedSwapGain(network,labels,state.counts,left,right,incidenceSets);if(gain>tolerance)return {kind:'swap',left,right,gain};}
   return null;
  };
  for(;passes<maxPasses;){
   passes++;progress('Balanced cut · start '+(trial+1)+'/'+starts+' · round '+passes+'/'+maxPasses);
   let changed=false;
   for(const member of shuffle(indices,random)){
    const proposal=bestMove(member);if(proposal.target!==labels[member]){move(proposal);changed=true;continue;}
    const partners=shuffle(indices.filter(other=>labels[other]!==labels[member]),random).slice(0,12);
    for(const other of partners)if(balancedSwapGain(network,labels,state.counts,member,other,incidenceSets)>tolerance){swap(member,other);changed=true;break;}
   }
   gains.push(cutCost(network,labels));
   if(!changed){const improvement=verify();if(!improvement){verified=true;break;}if(improvement.kind==='move')move(improvement);else swap(improvement.left,improvement.right);}
  }
  if(!verified){const improvement=verify();verified=!improvement;remainingGain=improvement?.gain??null;}
  const quality=cutCost(network,labels);if(!best||quality<best.quality-1e-10||Math.abs(quality-best.quality)<=1e-10&&verified&&!best.converged)best={labels:[...labels],quality,converged:verified,passes,maximumGroupSize:cap,imbalance,requestedGroups:count,passBudget:maxPasses,verificationChecks,remainingImprovement:remainingGain,stoppingReason:verified?'all-feasible-single-moves-and-swaps-stable':'round-budget',cutHistory:gains,moveTolerance:tolerance};
 }
 return best;
}

export function aonProfile(network,labels) {
 const volumes=new Map(),sizes=new Map();labels.forEach((group,index)=>volumes.set(group,(volumes.get(group)||0)+network.degree[index]));
 for(const edge of network.groups){if(!sizes.has(edge.members.length))sizes.set(edge.members.length,{total:0,inside:0});const size=sizes.get(edge.members.length);size.total+=edge.weight;if(edge.members.every(member=>labels[member]===labels[edge.members[0]]))size.inside+=edge.weight;}
 return profileValue(network,volumes,sizes);
}
function profileValue(network,volumes,sizes) {
 let total=0;
 for(const [size,counts]of sizes){const mass=sum([...volumes.values()].map(volume=>(volume/network.volume)**size)),fraction=counts.inside/counts.total;if(fraction<=mass+1e-12)continue;
  if(counts.inside>0)total+=counts.inside*Math.log(fraction/Math.max(1e-300,mass));
  const outside=Math.max(0,counts.total-counts.inside);if(outside>0)total+=outside*Math.log((outside/counts.total)/Math.max(1e-300,1-mass));
 }
 return total;
}
function aonFit(network,count,random,starts,progress) {
 let best;
 for(let trial=0;trial<starts;trial++){
  progress('AON approximation · start '+(trial+1)+'/'+starts);
  const labels=trial===0?spectralFit(network,count,random,()=>{}).labels:network.ids.map(()=>Math.floor(random()*count));
  const present=new Set(labels);for(let group=0;group<count;group++)if(!present.has(group)){const sizes=labels.map(label=>labels.filter(other=>other===label).length),member=sizes.indexOf(Math.max(...sizes));labels[member]=group;present.add(group);}
  const state=mutablePartition(network,labels),volumes=new Map(),sizes=new Map(),members=new Map();labels.forEach((group,index)=>{volumes.set(group,(volumes.get(group)||0)+network.degree[index]);members.set(group,(members.get(group)||0)+1);});
  for(const [index,edge]of network.groups.entries()){if(!sizes.has(edge.members.length))sizes.set(edge.members.length,{total:0,inside:0});sizes.get(edge.members.length).total+=edge.weight;if(state.counts[index].size===1)sizes.get(edge.members.length).inside+=edge.weight;}
  const move=(member,target)=>{const original=labels[member];for(const position of network.incidence[member]){const edge=network.groups[position];if(state.counts[position].size===1)sizes.get(edge.members.length).inside-=edge.weight;}state.update(member,target);for(const position of network.incidence[member]){const edge=network.groups[position];if(state.counts[position].size===1)sizes.get(edge.members.length).inside+=edge.weight;}volumes.set(original,(volumes.get(original)||0)-network.degree[member]);volumes.set(target,(volumes.get(target)||0)+network.degree[member]);};
  let quality=profileValue(network,volumes,sizes),changed=false,passes=0;
  for(;passes<15;passes++){
   changed=false;
   for(const member of shuffle(network.ids.map((_,index)=>index),random)){
    const original=labels[member];if(members.get(original)<=1)continue;let target=original,value=quality+1e-9;
    const candidates=new Set();for(const edge of network.incidence[member])for(const group of state.counts[edge].keys())candidates.add(group);
    for(const group of candidates)if(group!==original){move(member,group);const score=profileValue(network,volumes,sizes);move(member,original);if(score>value){target=group;value=score;}}
    if(target!==original){move(member,target);members.set(original,members.get(original)-1);members.set(target,(members.get(target)||0)+1);quality=profileValue(network,volumes,sizes);changed=true;}
   }
   if(!changed)break;
  }
  quality=aonProfile(network,labels);if(!best||quality>best.quality)best={labels:[...labels],quality,converged:!changed,passes,requestedGroups:count,propensities:'Fixed weighted degree / total volume; not jointly estimated',weightInterpretation:'Fractional source-normalized weights: quasi-likelihood, not literal Poisson counts'};
 }
 return best;
}

function localFit(network,seedId,restart) {
 const seed=network.ids.indexOf(seedId);if(seed<0)return {labels:network.ids.map(()=>-1),quality:null,converged:true,seedId,seedAbsent:true};
 let probabilities=network.ids.map((_,index)=>Number(index===seed)),residual=Infinity,iterations=0;
 for(;iterations<1000;iterations++){
  const next=network.ids.map((_,index)=>index===seed?restart:0);
  for(const edge of network.groups){const mass=sum(edge.members.map(member=>probabilities[member]/network.degree[member]))*edge.weight/edge.members.length*(1-restart);for(const member of edge.members)next[member]+=mass;}
  residual=sum(next.map((value,index)=>Math.abs(value-probabilities[index])));probabilities=next;if(residual<1e-9)break;
 }
 const order=network.ids.map((_,index)=>index).sort((left,right)=>probabilities[right]/network.degree[right]-probabilities[left]/network.degree[left]||left-right),inside=new Set();let volume=0,best;
 for(const member of order){inside.add(member);volume+=network.degree[member];if(!inside.has(seed)||volume>network.volume/2)continue;const cut=sum(network.groups.map(edge=>{const count=edge.members.filter(node=>inside.has(node)).length;return count>0&&count<edge.members.length?edge.weight:0;}));const quality=cut/Math.min(volume,network.volume-volume);if(!best||quality<best.quality-1e-12)best={inside:new Set(inside),quality};}
 if(!best)best={inside:new Set([seed]),quality:sum(network.incidence[seed].map(edge=>network.groups[edge].weight))/Math.max(1e-300,Math.min(network.degree[seed],network.volume-network.degree[seed]))};
 return {labels:network.ids.map((_,index)=>best.inside.has(index)?0:-1),quality:best.quality,converged:residual<1e-9,seedId,restart,iterations,residual,probabilityMass:sum(probabilities),localOnly:true};
}

export function periodCategories(edges,articles) {
 return edges.map(edge=>{
  const counts=new Map();for(const id of edge.articles||[]){const year=articles[id]?.year;if(Number.isInteger(year)&&year>=1000&&year<=3000){const decade=Math.floor(year/10)*10;counts.set(decade,(counts.get(decade)||0)+1);}}
  const sorted=[...counts].sort((left,right)=>right[1]-left[1]||left[0]-right[0]);return sorted.length?{...edge,category:String(sorted[0][0])+'s',categoryEvidence:{counts:Object.fromEntries(sorted),rule:'Most frequent supporting-source decade; ties choose earlier'}}:null;
 }).filter(Boolean);
}
function categoricalFit(network,random,starts) {
 const categories=[...new Set(network.groups.map(edge=>edge.category))].sort();if(!categories.length||network.groups.some(edge=>!edge.category))throw new Error('Categorical clustering needs explicit edge categories');
 let best;
 const score=(edge,labels)=>edge.members.every(member=>labels[member]===categories.indexOf(edge.category))?edge.weight:0;
 for(let trial=0;trial<starts;trial++){
  const labels=network.ids.map((_,member)=>{const votes=categories.map(category=>sum(network.incidence[member].map(index=>network.groups[index].category===category?network.groups[index].weight:0)));return trial===0?votes.indexOf(Math.max(...votes)):Math.floor(random()*categories.length);});let changed=false,passes=0;
  for(;passes<20;passes++){changed=false;for(const member of shuffle(network.ids.map((_,index)=>index),random)){const original=labels[member],adjacent=network.incidence[member];let target=original,bestScore=sum(adjacent.map(edge=>score(network.groups[edge],labels)))+1e-10;for(let group=0;group<categories.length;group++){labels[member]=group;const quality=sum(adjacent.map(edge=>score(network.groups[edge],labels)));if(quality>bestScore){bestScore=quality;target=group;}}labels[member]=target;if(target!==original)changed=true;}if(!changed)break;}
  const quality=sum(network.groups.map(edge=>score(edge,labels)));if(!best||quality>best.quality)best={labels:[...labels],quality,converged:!changed,passes,categories};
 }
 return best;
}

export function runHypergraphTrial(edges,options={},progress=()=>{}) {
 const family=options.family||'spectral',definition=TRIAL_METHODS[family];if(!definition)throw new Error('Unknown trial family');
 const network=trialNetwork(edges);if(!network.ids.length)throw new Error('No supported combinations at these settings.');
 const count=options.k??24,seed=options.seed??42,starts=options.starts??3;
 if(!Number.isInteger(count)||count<2||count>80||!Number.isInteger(seed)||seed<1||!Number.isInteger(starts)||starts<1||starts>5)throw new Error('Choose k 2–80, 1–5 starts and a positive integer seed');
 const effective=Math.min(count,network.ids.length),random=rng(seed),imbalance=options.imbalance??.2,restart=options.restart??.15;
 const balancedMaxPasses=options.balancedMaxPasses??96;
 if(!Number.isInteger(balancedMaxPasses)||balancedMaxPasses<1||balancedMaxPasses>512)throw new Error('Choose a balanced refinement budget of 1–512 rounds');
 if(!Number.isFinite(imbalance)||imbalance<0||imbalance>1||!Number.isFinite(restart)||restart<=0||restart>=1)throw new Error('Invalid balance or restart setting');
 let fitted;
 if(family==='spectral'){fitted=spectralFit(network,effective,random,progress);fitted.quality=normalizedCutCost(network,fitted.labels);}
 if(family==='aon')fitted=aonFit(network,effective,random,starts,progress);
 if(family==='balanced')fitted=balancedFit(network,effective,imbalance,random,starts,progress,balancedMaxPasses,options.resumeMemberships);
 if(family==='local')fitted=localFit(network,options.seedId,restart);
 if(family==='categorical')fitted=categoricalFit(network,random,starts);
 const memberships=canonicalMemberships(Object.fromEntries(network.ids.flatMap((id,index)=>fitted.labels[index]<0?[]:[[id,fitted.labels[index]+1]]))),{labels,...diagnostics}=fitted;
 const {resumeMemberships,...recordedSettings}=options;
 const categoryByCluster=family==='categorical'?Object.fromEntries(network.ids.map((id,index)=>[memberships[id],fitted.categories[labels[index]]])):null;
 return {...diagnostics,memberships,categoryByCluster,family,version:TRIAL_VERSION,continuation:resumeMemberships?{initialMemberships:resumeMemberships,rule:'Continue the same pinned evidence and bounds; resampling checks restart without the checkpoint'}:null,settings:{...recordedSettings,family,k:count,seed,starts,imbalance,restart,balancedMaxPasses},definition,linkedArticles:network.ids.length,combinations:network.groups.length,weight:network.weight,clusters:new Set(Object.values(memberships)).size,qualityDirection:['spectral','balanced','local'].includes(family)?'lower':'higher',limitations:definition.help+' Bounded experimental solver; no claim of global optimality or thematic validity. Quality values are not comparable across families.'};
}

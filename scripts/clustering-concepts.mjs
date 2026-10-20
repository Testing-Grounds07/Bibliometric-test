export const CLUSTERING_SCORES = [
 {value:'cpm',label:'CPM',algorithm:'leiden'},
 {value:'map-equation',label:'Map equation',algorithm:'infomap'},
 {value:'hypergraph-modularity',label:'Hypergraph modularity',algorithm:'hypergraph'},
 {value:'description-length',label:'Model description length',algorithm:'sbm'}
];

export function scoreForAlgorithm(algorithm) {
 return CLUSTERING_SCORES.find(score=>score.algorithm===algorithm)||CLUSTERING_SCORES[0];
}

export function searchesForScore(score, {experimental = false} = {}) {
 if(score==='hypergraph-modularity')return [
  {value:'mixed',label:'Local moves · mixed starts'},
  {value:'leiden-seeded',label:'Local moves · Leiden starts'},
  ...(experimental ? [{value:'group-moves',label:'Group moves · experimental'},
  {value:'annealing',label:'Annealing · experimental'}] : [])
 ];
 if(score==='map-equation')return [{value:'infomap',label:'Infomap'}];
 if(score==='description-length')return [{value:'sbm',label:'Nested SBM fitting'}];
 return [{value:'leiden',label:'Leiden'}];
}

export function clusteringConcepts(graph={}) {
 if(graph.clustering?.objective==='joint_CPM')return {algorithm:'leiden_joint_layers',score:'joint_CPM',scoreTitle:'Joint layer CPM',searchTitle:'Joint Leiden',clusterLabel:graph.clustering.label,formula:'Sum of explicitly weighted layer CPM objectives plus declared same-ID coupling for adjacent temporal slices.',scoreSummary:'Membership is from the exact selected joint run. The displayed edges are one named layer; they are not the whole joint objective.',example:'A node can share a joint group despite different citation and text neighborhoods. Publication slices are retrospective cohorts, not historical citation snapshots.',searchSteps:['Fit the declared layers and exact seeds with joint Leiden.','Compare separate individual-layer fits in Methods.'],searchSummary:'Requested finite iterations and seeds do not establish a global optimum.',tuning:'Resolutions, layer weights and temporal coupling are explicit modeling choices; no automatic parameter winner is selected.',validity:'Joint membership does not validate substantive themes, persistence, or causal claims. Independent scientific appraisal remains outstanding.'};
 if(graph._backend?.startsWith('independent-bnr')&&graph.clustering?.algorithm==='not_requested')return {algorithm:'not_requested',score:'not_requested',scoreTitle:'Not requested',searchTitle:'Not requested',clusterLabel:'Construction only · communities not requested',formula:'No community objective was fitted.',scoreSummary:'Connections retain the declared imported graph definition. Unassigned nodes may have observed connections.',example:'A linked source can be unassigned when community detection was not requested.',searchSteps:[],searchSummary:'No optimizer was executed for this result.',tuning:'A new explicitly requested analysis is required to fit communities.',validity:'Construction checks do not establish themes or scientific expert approval.'};
 if(graph.trial){const definition=graph.trial.result.definition;return {algorithm:'trial',score:graph.trial.result.family,scoreTitle:definition.score,searchTitle:definition.search,clusterLabel:definition.name,formula:definition.score,scoreSummary:definition.help,example:'Whole supported combinations provide the evidence. Pair lines remain citation evidence, not this method’s score.',searchSteps:[definition.search],searchSummary:graph.trial.result.limitations,tuning:'Trial parameters are explicit. Reliability reruns this same method; Auto CPM and automatic trial settings selection are not implemented.',validity:'Numerical convergence, structural reliability and AI thematic suggestions are separate checks.'};}
 const algorithm=['infomap','hypergraph','sbm'].includes(graph.clustering?.algorithm)?graph.clustering.algorithm:'leiden';
 const score=scoreForAlgorithm(algorithm),incidence=graph.networkModel==='hypergraph'&&graph.clustering?.modelVersion==='incidence-v1';
 const strategy=searchesForScore('hypergraph-modularity',{experimental:true}).some(search=>search.value===graph.clustering?.hypergraphSearch)?graph.clustering.hypergraphSearch:'mixed';
 const coupling=graph.canvasKind==='coupling'||graph.method==='coupling';
 const common={algorithm,score:score.value,scoreTitle:score.label,incidence,search:algorithm==='hypergraph'?strategy:algorithm,
  tuning:'Auto compares settings, repeated starts and resampled evidence. This is outside the search that fits one setting. No stable range means no clear recommendation—not a forced winner.',
  validity:'A high score is not stability, article quality, or thematic validity. Reliability reruns the same score and search on changed evidence.'};
 if(graph.collaboration)return {...common,searchTitle:'Leiden',clusterLabel:'Collaboration CPM / Leiden',formula:'Reward within-group projected connections minus a resolution-dependent group-size cost.',scoreSummary:'CPM uses explicit '+graph.counting+' work–actor projections; raw support separately counts distinct source works.',example:'Full and fractional pair weights encode different assumptions. Fixed numeric CPM across them measures construction-plus-scale sensitivity.',searchSteps:['Retain unique stable actors within each source work under declared publication/affiliation policies.','Construct explicit pair weights from observed work-specific authorships or affiliations.','Run three seeded Leiden CPM starts and retain the best fixed-definition fit.'],searchSummary:'Detected groups are not verified social relationships or research themes.',tuning:'Use Collaboration for actor kind, counting, recorded ancestry rollup, publication/team/affiliation alternatives and explicit human-audited identity scenarios. Citation Auto CPM does not apply.',validity:'Metadata missingness and identity disambiguation remain research limitations. No collaboration statistical null is implemented.'};
 if(graph.semantic)return {...common,searchTitle:'Leiden',clusterLabel:'Semantic CPM / Leiden',formula:'Reward within-group connections minus a resolution-dependent group-size cost.',scoreSummary:'CPM uses this explicit '+graph.normalization+' semantic network, not citation overlap. Weights are scaled by their analytical mean before fitting.',example:'Terms, classifier topics and source-text similarity are different observed relationships. The same numeric CPM need not mean the same grouping scale across them.',searchSteps:['Construct the selected semantic connections from pinned text or classifier evidence.','Run three seeded Leiden starts at this CPM.','Keep the highest-scoring partition at this fixed definition.'],searchSummary:'Leiden searches CPM; no global optimum or meaningful-theme guarantee is claimed.',tuning:'Use Semantic maps to change text, vocabulary, classifier confidence, cosine or CPM. The semantic sensitivity check varies bounded definitions; citation bootstrap and citation Auto CPM do not apply.',validity:'Text/threshold sensitivity, optimizer completion and AI thematic suggestions are different checks. No semantic statistical null is implemented.'};
 if(algorithm==='hypergraph')return {...common,searchTitle:searchesForScore('hypergraph-modularity',{experimental:true}).find(search=>search.value===strategy).label,clusterLabel:(coupling?'Coupling · ':'')+'Hypergraph modularity / '+(strategy==='group-moves'?'group moves':strategy==='annealing'?'annealing':'local moves'),
  formula:'Score = observed togetherness − resolution × expected togetherness (both weighted and normalized).',
  scoreSummary:'Score whole combinations, not the pairwise lines. Reward members staying together beyond a degree-based random-mixing baseline. The resolution multiplier controls the baseline penalty; 1 preserves the original objective.',
  example:'With linear-majority scoring, 3 of 4 members together earns 0.75 before subtracting the baseline; 2 of 4 earns 0; all 4 earns 1. Majority, quadratic and strict are different scoring definitions, not search algorithms.',
  searchSteps:[strategy==='leiden-seeded'?'Make ten starting guesses with Leiden on a temporary pair projection. These are seeds, not the final scoring network.':'Make ten starting guesses: three Leiden-generated guesses, connected components, singletons, and five seeded combination assignments.',
   'For each guess, first try article moves that improve the direct whole-combination score, for at most 20 passes.',
   strategy==='group-moves'?'Try merging entire neighboring groups when the same score improves, then let individual articles readjust. Repeat for at most four rounds.':strategy==='annealing'?'Explore twelve cooling sweeps. Early exploration can accept temporary score losses; cooling becomes less permissive. Keep the best partition encountered, then finish with greedy article moves.':'Repeat article moves until no improvement is found or the 20-pass limit is reached.',
   'Keep the highest-scoring result across the starts. A pass limit is reported; no global optimum or Leiden-style refinement guarantee is claimed.'],
  searchSummary:strategy==='group-moves'?'Experimental custom group-move search: move whole groups as well as articles, evaluated on the unchanged hypergraph score. Not the published h-Louvain method, which additionally blends objectives and tunes its schedule.':strategy==='annealing'?'Experimental simulated annealing: accept some temporary setbacks to explore beyond a local solution. Twelve fixed cooling sweeps per start, retaining the best result; this is not evidence of convergence or stability.':'Both local-move choices are multi-start direct local search. Leiden starts changes initialization only; native Leiden optimization of this hypergraph score is not implemented.'};
 if(algorithm==='infomap')return {...common,searchTitle:'Infomap',clusterLabel:(coupling?'Coupling · ':'')+'Map equation / Infomap',formula:'Prefer a shorter description of modeled movement.',
  scoreSummary:incidence?'The map equation encodes movement through article and combination-helper nodes. Both kinds of visits count; returning to the same article is allowed.':'The map equation scores how compactly movement along weighted article connections can be described.',
  example:'Short local addresses help when movement stays in a neighborhood. Markov time changes the scale; higher values tend to favor broader groups.',searchSteps:['Infomap tries and reorganizes memberships to shorten the description of movement.','Run ten optimization trials at the selected Markov time.','Keep the shortest description at that same setting.'],searchSummary:'Infomap searches its map-equation objective. It is not CPM or a direct hypergraph-modularity optimizer.'};
 if(algorithm==='sbm')return {...common,searchTitle:'Nested SBM fitting',clusterLabel:(coupling?'Coupling · ':'')+'Description length / nested SBM',formula:'Prefer a shorter description of the network and its model.',scoreSummary:'Description length balances how well a nested block model explains the observed network against model complexity.',example:'A more complicated hierarchy must earn its extra complexity. Hierarchy levels are not CPM resolutions.',searchSteps:['Fit a degree-corrected nested block model from three seeded starts.','Keep the fitted hierarchy with the shortest description.','Choose a hierarchy level to inspect.'],searchSummary:'The fitted hierarchy is selected by description length; stability requires a separate evidence check.'};
 return {...common,searchTitle:'Leiden',clusterLabel:(coupling?'Coupling · ':'')+(incidence?'Bipartite CPM / Leiden':'CPM / Leiden'),formula:'Reward within-group connections, minus a resolution-dependent group-size cost.',
  scoreSummary:incidence?'Bipartite CPM scores article–combination incidence, with a cross-class size penalty and zero within-class penalties.':'CPM rewards within-group connections while penalizing overly loose groups at the selected resolution.',
  example:'The CPM setting changes how fine a division is favored. It is the scoring rule—not Leiden itself.',searchSteps:['Leiden tests article-membership moves that improve CPM.','Refine groups, regroup temporary units, and repeat.','Run ten seeded starts and keep the highest CPM quality at this setting.'],searchSummary:'Leiden is the search; CPM is the score. Multi-start repeats that search. Stability asks whether the result survives changes to the evidence.'};
}

export function clusterResultHeading(graph,previous=false) {
 if(graph._backend?.startsWith('independent-bnr')&&graph.clustering?.algorithm==='not_requested')return (previous?'Previous result · ':'')+'Construction only · unassigned sources';
 return (previous?'Previous result · ':'')+clusteringConcepts(graph).clusterLabel+' clusters';
}

export function validationSummary(reliability = {}, settings = {}) {
 if(reliability.validationMode==='collaboration'||settings.validationMode==='collaboration')return {label:reliability.validationStatus==='completed'?'Construction checked':'Construction not checked',detail:'Collaboration counting/team/affiliation alternatives are not citation bootstrap, significance or validated social communities.'};
 if(reliability.validationMode==='semantic'||settings.validationMode==='semantic')return {label:reliability.validationStatus==='completed'?'Text sensitivity checked':reliability.validationStatus==='partial'?'Text sensitivity partial':reliability.validationStatus==='unavailable'?'Text check unavailable':'Text sensitivity not checked',detail:'Citation bootstrap and citation nulls are not applicable. Semantic text/threshold checks do not validate themes or establish significance.'};
 const detail = [reliability.validationStatus, settings.validationStatus, settings.validationOutcome].filter(Boolean).join(' · ');
 if (reliability.validationState === 'pending') return {label:'Waiting for map', detail};
 if (settings.validationRunning === 'true') return {label:'Finding settings…', detail};
 if (reliability.validationState === 'running') return {label:'Checking evidence…', detail};
 const outcome = reliability.validationOutcome;
 if (outcome) return {label:(outcome.includes('No linked')?'No linked groups':outcome.includes('hold together')?'Holds together':outcome.includes('exploratory')?'Changes':'Sensitive')+(reliability.preliminary==='true'?' · preliminary':''),detail:outcome+' · '+detail};
 if (settings.validationOutcome) return {label:settings.validationOutcome, detail};
 if (/No completed/.test(detail)) return {label:'Check failed · retry', detail};
 if (/Cancelled/.test(detail)) return {label:'Stopped · rerun', detail};
 if (settings.validationPhase === 'queued') return {label:'Settings queued', detail};
 return {label:'Not checked', detail:detail||'Run a quick or full evidence check.'};
}

if(typeof window!=='undefined')window.ATLAS_CLUSTERING_CONCEPTS={scores:CLUSTERING_SCORES,scoreForAlgorithm,searchesForScore,describe:clusteringConcepts,heading:clusterResultHeading,validationSummary};

(() => {
 'use strict';
 const byId = id => document.getElementById(id), column = document.querySelector('.map-column');
 if (!column || byId('workspaceControls')) return;
 const create = (tag, text, className) => { const node = document.createElement(tag); if (text) node.textContent = text; if (className) node.className = className; return node; };
 const controls = create('nav', '', 'workspace-controls'); controls.id = 'workspaceControls'; controls.setAttribute('aria-label', 'Map tools');
 const method = create('div', '', 'shell-method');
 const concepts=window.ATLAS_CLUSTERING_CONCEPTS,methodSelect=byId('clusteringMethod');
 const label = document.querySelector('label[for=clusteringMethod]');label.hidden=true;methodSelect.hidden=true;methodSelect.tabIndex=-1;
 const scoreField=create('label','Score');scoreField.htmlFor='clusteringScore';scoreField.title='The rule that judges a grouping. Choosing a score selects only supported search methods.';
 const scoreSelect=create('select');scoreSelect.id='clusteringScore';for(const score of concepts.scores)scoreSelect.append(new Option(score.label,score.value));scoreField.append(scoreSelect);
 const searchField=create('label','Search');searchField.htmlFor='clusteringSearch';searchField.title='How candidate groupings are explored. Multi-start means repeating a search from different guesses.';
 const searchSelect=create('select');searchSelect.id='clusteringSearch';searchField.append(searchSelect);
 method.append(document.querySelector('label[for=networkModel]'),scoreField,searchField);controls.append(method);
 let searchOptionsKey='',conceptKey='',searchIntent=null;
 function refreshConcepts(){
  const score=concepts.scoreForAlgorithm(methodSelect.value),searches=concepts.searchesForScore(score.value),applied=window.atlasSharedCanvas?.graph();
  if(applied?.clustering?.objective==='joint_CPM'){
   if(!scoreSelect.querySelector('option[value="joint_CPM"]'))scoreSelect.append(new Option('Joint layer CPM','joint_CPM'));
   scoreSelect.value='joint_CPM';scoreSelect.disabled=true;searchSelect.replaceChildren(new Option('Joint Leiden · retained run','joint_leiden'));searchSelect.disabled=true;searchOptionsKey='joint_CPM';
   const explanation=concepts.describe(applied);conceptBody.replaceChildren(create('p',explanation.formula),create('p',explanation.scoreSummary),create('p',explanation.validity));return;
  }
  scoreSelect.querySelector('option[value="joint_CPM"]')?.remove();
  if(applied?._backend?.startsWith('independent-bnr')&&applied.clustering?.algorithm==='not_requested'){
   if(!scoreSelect.querySelector('option[value="not_requested"]'))scoreSelect.append(new Option('Not requested','not_requested'));
   scoreSelect.value='not_requested';scoreSelect.disabled=true;searchSelect.replaceChildren(new Option('Not run','not_requested'));searchSelect.disabled=true;searchOptionsKey='not_requested';
   const explanation=concepts.describe(applied);scoreSelect.title=explanation.scoreSummary;searchSelect.title=explanation.searchSummary;conceptBody.replaceChildren(create('p',explanation.scoreSummary),create('p',explanation.searchSummary),create('p',explanation.validity));return;
  }
  scoreSelect.querySelector('option[value="not_requested"]')?.remove();
  if(searchIntent&&(searchIntent.algorithm!==score.algorithm||applied!==searchIntent.previous))searchIntent=null;
  scoreSelect.value=score.value;
  if(searchOptionsKey!==score.value){searchSelect.replaceChildren(...searches.map(search=>new Option(search.label,search.value)));searchOptionsKey=score.value;}
  const previous=byId('clusterOverview')?.dataset.resultState==='previous';
  if(searchIntent)searchSelect.value=searchIntent.value;
  else if(!previous&&applied?.clustering?.algorithm===score.algorithm)searchSelect.value=score.algorithm==='hypergraph'?applied.clustering.hypergraphSearch||'mixed':score.algorithm;
  if(!searches.some(search=>search.value===searchSelect.value))searchSelect.value=searches[0].value;
  searchSelect.disabled=searches.length===1||methodSelect.disabled;scoreSelect.disabled=methodSelect.disabled;
  method.hidden=!!window.ATLAS_TRIAL_WORKSPACE||window.atlasSharedCanvas?.summary()?.algorithm==='historiography';
  const explanation=concepts.describe(applied?.trial||applied?.semantic||applied?.collaboration?applied:{networkModel:byId('networkModel').value,canvasKind:applied?.canvasKind,clustering:{algorithm:score.algorithm,modelVersion:byId('networkModel').value==='hypergraph'?'incidence-v1':undefined,hypergraphSearch:searchSelect.value}}),key=JSON.stringify(explanation);
  if(key===conceptKey)return;conceptKey=key;
  scoreSelect.title=explanation.scoreSummary;searchSelect.title=explanation.searchSummary;
  conceptBody.replaceChildren();
  conceptBody.append(create('h3','Score · '+explanation.scoreTitle),create('p',explanation.formula),create('p',explanation.scoreSummary),create('p',explanation.example),create('h3','Search · '+explanation.searchTitle));
  const steps=create('ol');for(const step of explanation.searchSteps)steps.append(create('li',step));conceptBody.append(steps,create('p',explanation.searchSummary),create('h3','Auto settings & reliability'),create('p',explanation.tuning),create('p',explanation.validity));
 }
 scoreSelect.onchange=()=>{const score=concepts.scores.find(choice=>choice.value===scoreSelect.value);if(!score)return;searchOptionsKey='';searchSelect.replaceChildren(...concepts.searchesForScore(score.value).map(search=>new Option(search.label,search.value)));searchOptionsKey=score.value;searchIntent={algorithm:score.algorithm,value:searchSelect.value,previous:window.atlasSharedCanvas?.graph()};methodSelect.value=score.algorithm;methodSelect.dispatchEvent(new Event('change',{bubbles:true}));refreshConcepts();};
 searchSelect.onchange=()=>{searchIntent={algorithm:methodSelect.value,value:searchSelect.value,previous:window.atlasSharedCanvas?.graph()};if(methodSelect.value==='hypergraph')methodSelect.dispatchEvent(new Event('change',{bubbles:true}));refreshConcepts();};
 const buttons = create('div', '', 'shell-panel-buttons'); controls.append(buttons);
 const validation = create('details', '', 'shell-validation'); validation.id = 'validationMenu';
 const validationToggle = create('summary', 'Validation'); validation.append(validationToggle);
 const validationMenu = create('div', '', 'shell-validation-menu'); validation.append(validationMenu);
 const validationStatus = create('span', 'Not checked', 'shell-validation-status'); validationStatus.setAttribute('role', 'status'); validationToggle.append(validationStatus);
 const validationActions = [];
 for (const [id, text, hint] of [['validationQuick', 'Quick check · 10 resamples', 'Preliminary evidence check; does not change the map.'], ['validationFull', 'Full check · 50 resamples', 'Reruns the selected method on resampled evidence.'], ['validationSettings', 'Find stable settings', 'Compares settings, then validates promising candidates on fresh resamples. May apply a validated setting.']]) {
  const button = create('button', text); button.type = 'button'; button.title = hint;
  button.onclick = () => { const target = byId(id); if (!target || target.disabled) return; validation.open = false; show('analysis'); const section = target.closest('details'); if (section) section.open = true; target.click(); entries.get('analysis').panel.querySelector('.shell-panel-heading button:last-child').focus({preventScroll:true}); };
  validationMenu.append(button); validationActions.push({id, button});
 }
 const validationDetails = create('button', 'Results & details'); validationDetails.type = 'button'; validationDetails.onclick = () => { validation.open = false; show('analysis', true); for (const id of ['canvasSettings','canvasReliability']) { const section = byId(id); if (section) section.open = true; } }; validationMenu.append(validationDetails);
 validationMenu.append(create('p', 'Stability is not proof of a correct theme.'));
 buttons.append(validation);
 validation.addEventListener('keydown', event => { if (event.key === 'Escape') { validation.open = false; validationToggle.focus(); } });
 document.addEventListener('click', event => { if (!validation.contains(event.target)) validation.open = false; });
 function refreshValidation() {
  const reliability = byId('canvasReliability'), settings = byId('canvasSettings');
  const waiting = reliability?.dataset.validationState === 'pending';
  const status = concepts.validationSummary(reliability?.dataset, settings?.dataset), text = status.label;
  if (validationStatus.textContent !== text) validationStatus.textContent = text;
  validationStatus.title = status.detail;
  for (const {id, button} of validationActions) { const target = byId(id); button.disabled = !target || target.disabled || waiting; }
  validation.hidden = window.atlasSharedCanvas?.summary()?.algorithm === 'historiography';
 }
 const panels = create('div', '', 'shell-panels'); panels.id = 'workspacePanels';
 const entries = new Map();let startupToolChoice=null;
 function addPanel(id, title) {
  const toggle = create('button', title); toggle.type = 'button'; toggle.id = 'tool-' + id; toggle.setAttribute('aria-controls', id + 'Panel'); toggle.setAttribute('aria-expanded', 'false');
  const panel = create('section', '', 'shell-panel'); panel.id = id + 'Panel'; panel.hidden = true; panel.setAttribute('aria-label', title); panel.setAttribute('role', 'region');
  const heading = create('div', '', 'shell-panel-heading'); heading.append(create('h2', title));
  const close = create('button', 'Close'); close.type = 'button'; close.setAttribute('aria-label', 'Close ' + title); close.onclick = () => show(null, true); heading.append(close); panel.append(heading);
  const body = create('div', '', 'shell-panel-body'); panel.append(body); panels.append(panel); buttons.append(toggle);
  toggle.onclick = () => {if(!window.ATLAS_STARTUP_NAVIGATION?.ready())startupToolChoice=id;show(panel.hidden ? id : null, true);};
  panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); show(null, true); } });
  entries.set(id, {toggle, panel, body});
 }
 for (const [id, title] of [['analysis', 'Analysis'], ['display', 'Display'], ['search', 'Search'], ['inspect', 'Inspect']]) addPanel(id, title);
 const clearSelection = create('button', 'Clear selection'); clearSelection.type = 'button'; clearSelection.id = 'clearInspectSelection'; clearSelection.hidden = true;
 const inspectHeading = entries.get('inspect').panel.querySelector('.shell-panel-heading'); inspectHeading.insertBefore(clearSelection, inspectHeading.lastElementChild);
 clearSelection.onclick = () => { window.atlasSharedCanvas.clearSelection(); entries.get('inspect').toggle.focus({preventScroll: true}); };
 let active, lastSelection = null, selectionIntent = null, keyboardActivation = -Infinity;
 function show(id, returnFocus = false) {
  const previous = active; active = id;
  surface.dataset.tool = id || '';
  for (const [key, entry] of entries) { entry.panel.hidden = key !== id; entry.toggle.setAttribute('aria-expanded', String(key === id)); }
  fitPanel();
  if (!id && returnFocus) entries.get(previous)?.toggle.focus({preventScroll: true});
  if (id && returnFocus) entries.get(id).panel.querySelector('.shell-panel-heading button:last-child').focus({preventScroll: true});
 }
 function fitPanel() {
  if (!active) return;
  const viewport = window.visualViewport, height = viewport?.height || innerHeight, offset = viewport?.offsetTop || 0;
  const top = Math.max(offset + 12, Math.min(controls.getBoundingClientRect().bottom + 8, offset + height * .24));
  panels.style.setProperty('--panel-top', top + 'px');
  panels.style.setProperty('--panel-height', Math.max(100, height + offset - top - 16) + 'px');
 }
 window.addEventListener('resize', fitPanel);
 window.addEventListener('scroll', fitPanel, {passive: true});
 window.visualViewport?.addEventListener('resize', fitPanel);
 window.visualViewport?.addEventListener('scroll', fitPanel);
 const intro = document.querySelector('.map-intro'); intro.before(controls);
 const surface = create('div', '', 'shell-surface'), stage = document.querySelector('.network-stage');
 column.insertBefore(surface, stage); surface.append(panels, stage, document.querySelector('.map-caption'));
 const move = (node, target) => { if (node && node.parentElement !== target) target.append(node); };
 const analysis = entries.get('analysis').body, display = entries.get('display').body, search = entries.get('search').body, inspect = entries.get('inspect').body;
 function fieldGroup(parent, title, id) {
  const section = create('section', '', 'shell-field-group'), heading = create('h3', title), body = create('div', '', 'shell-field-body');
  heading.id = id + 'Heading'; section.setAttribute('aria-labelledby', heading.id); section.append(heading, body); parent.append(section); return body;
 }
 const networkSettings = fieldGroup(analysis, 'Network settings', 'networkSettings');
 const settingsHost = create('div', '', 'shell-check-section'), reliabilityHost = create('div', '', 'shell-check-section'); analysis.append(settingsHost, reliabilityHost);
 const methodNotes = create('details', '', 'shell-method-notes'); methodNotes.id = 'analysisMethodNotes'; methodNotes.append(create('summary', 'Score, search & audit')); analysis.append(methodNotes);
 const conceptBody=create('section','','shell-score-search-notes');conceptBody.id='scoreSearchExplanation';methodNotes.append(conceptBody);
 move(document.querySelector('.community-controls'), methodNotes);
 move(byId('analysisNote'), methodNotes);
 move(document.querySelector('.analysis-switches'), networkSettings);
 move(byId('autoCPMInfo'), methodNotes); move(byId('metricExplanation'), methodNotes);
 byId('cpmAuto').textContent = 'Use Auto CPM'; byId('cpmAuto').title = 'Use the precomputed Auto CPM choice. Find settings runs a new comparison.';
 move(byId('canvasFilters'), display);
 const canvasDisplay = byId('canvasDisplay'), displayHelp = create('details', '', 'shell-display-help'); displayHelp.append(create('summary', 'How the display works'));
 const lines = fieldGroup(canvasDisplay, 'Lines', 'displayLines'), appearance = fieldGroup(canvasDisplay, 'Appearance', 'displayAppearance');
 move(byId('displayHeading').closest('section'), appearance);
 for (const node of [document.querySelector('label[for=edgeDisplay]'), byId('edgeDisplay'), byId('edgeLabel').parentElement, byId('minEdge')]) move(node, lines);
 for (const paragraph of [...canvasDisplay.querySelectorAll('p.field-note')]) move(paragraph, displayHelp);
 canvasDisplay.append(displayHelp); canvasDisplay.parentElement.querySelector('summary').textContent = 'Appearance & lines';
 byId('canvasFilters').prepend(create('h3', 'Visibility', 'shell-visibility-heading'));
 const rail = document.querySelector('.control-rail'); move(rail, search);
 const query = byId('query'), clearQuery = create('button', 'Clear search', 'shell-clear-query'); clearQuery.type = 'button'; clearQuery.disabled = !query.value; clearQuery.setAttribute('aria-controls', 'workList'); query.parentElement.append(clearQuery);
 clearQuery.onclick = () => { query.value = ''; query.dispatchEvent(new Event('input', {bubbles: true})); query.focus({preventScroll: true}); };
 query.addEventListener('input', () => { clearQuery.disabled = !query.value; });
 const scope = byId('threshold'), scopeLabel = document.querySelector('label[for=threshold]');
 const scopeField = create('div', '', 'shell-scope'); scopeField.append(scopeLabel, scope); networkSettings.prepend(scopeField);
 move(byId('details'), inspect);
 const foundations = create('details', '', 'shell-foundations'); foundations.id = 'foundationsDisclosure'; foundations.append(create('summary', 'Shared foundations · references cited by this group')); inspect.append(foundations);
 const help = create('details', '', 'shell-reading-help'); help.append(create('summary', 'How to read this map'), create('p', 'Choose a cluster to focus the map. Select an article or connection to inspect its evidence. Drag to pan; pinch or use + / − to zoom. Suggested cluster names need your interpretation.')); inspect.append(help);
 const toolbar = document.querySelector('.map-toolbar'), exports = document.querySelector('.export-actions');
 controls.append(toolbar);
 const masthead = document.querySelector('.masthead'), workspaceTabs = document.querySelector('.workspace-tabs');
 if (workspaceTabs) masthead.insertBefore(workspaceTabs, masthead.querySelector('.header-actions'));
 const project = create('p', 'Adaptive leadership · 2,855 source articles', 'shell-project'); document.querySelector('.brand h1').after(project);
 const more = create('details', '', 'shell-more'); more.append(create('summary', 'More')); const menu = create('div', '', 'shell-more-menu'); more.append(menu);
 const appearanceMenu = fieldGroup(menu, 'Appearance', 'moreAppearance'), exportMenu = fieldGroup(menu, 'Export', 'moreExport'), resourceMenu = fieldGroup(menu, 'Resources', 'moreResources');
 for (const id of ['themeToggle', 'motionToggle']) move(byId(id), appearanceMenu);
 for (const id of ['exportSvg', 'exportData']) move(byId(id), exportMenu);
 exports.append(more);
 move(document.querySelector('.method-bar a'), resourceMenu); document.querySelector('.method-bar').hidden = true;
 const methodGuide=create('a','Clustering explained · animated');methodGuide.href='hypergraph-help.html';methodGuide.target='_blank';methodGuide.rel='noopener';resourceMenu.append(methodGuide);
 const hypergraphTrials=create('a','Hypergraph methods · trial workspace');hypergraphTrials.href='hypergraph-lab.html';hypergraphTrials.target='_blank';hypergraphTrials.rel='noopener';resourceMenu.append(hypergraphTrials);
 const threeLab=create('a','Exploded 3D lab · all clusters');threeLab.href='hypergraph-3d-test.html';threeLab.target='_blank';threeLab.rel='noopener';resourceMenu.append(threeLab);
 const reset = byId('reset'); reset.textContent = 'Reset analysis & view'; reset.title = 'Restore the initial analysis, scope and canvas settings; this is not Clear search.'; move(reset, resourceMenu);
 const compact = matchMedia('(max-width:700px)');
 const placeExpand = () => move(byId('expandMap'), compact.matches ? resourceMenu : exports);
 compact.addEventListener('change', placeExpand); placeExpand();
 function fitMenu() {
  if (!more.open) return;
  const viewport = window.visualViewport, viewportTop = viewport?.offsetTop || 0, viewportBottom = viewportTop + (viewport?.height || innerHeight);
  const anchor = more.getBoundingClientRect(), below = viewportBottom - anchor.bottom - 13, above = anchor.top - viewportTop - 13;
  const upward = below < 60 && above > below;
  menu.style.top = upward ? 'auto' : 'calc(100% + 5px)'; menu.style.bottom = upward ? 'calc(100% + 5px)' : 'auto';
  menu.style.maxHeight = Math.max(0, Math.min(520, upward ? above : below)) + 'px';
 }
 more.addEventListener('toggle', fitMenu);
 window.addEventListener('resize', fitMenu); window.addEventListener('scroll', fitMenu, true);
 window.visualViewport?.addEventListener('resize', fitMenu); window.visualViewport?.addEventListener('scroll', fitMenu);
 more.addEventListener('keydown', event => { if (event.key === 'Escape') { more.open = false; more.querySelector('summary').focus(); event.stopPropagation(); } });
 document.addEventListener('click', event => { if (more.open && !more.contains(event.target)) more.open = false; });
 menu.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || ['themeToggle', 'motionToggle'].includes(button.id)) return;
  more.open = false;
  if (document.activeElement === document.body || menu.contains(document.activeElement)) more.querySelector('summary').focus({preventScroll: true});
 });
 const quickSearch = entries.get('search').toggle; quickSearch.title = 'Find an article by title, author or year';
 const reliability = byId('reliabilityButton'); reliability.textContent = 'Reliability'; reliability.title = 'How well do these groups hold together?';
 const previousReliability = reliability.onclick; reliability.onclick = event => { show('analysis'); previousReliability?.call(reliability, event); };
 const previousReset = byId('reset').onclick; byId('reset').onclick = event => { previousReset?.call(byId('reset'), event); show(null, true); };
 const context = create('p', '', 'shell-context'); context.id = 'shellContext'; intro.append(context);
 const status = create('p', '', 'shell-live-status'); status.id = 'shellLiveStatus'; status.setAttribute('role', 'status'); status.hidden = true; controls.after(status);
 document.body.classList.add('workspace-shell');
 let scheduled = false;
 function refresh() {
  refreshValidation();
  scheduled = false;
  refreshConcepts();
  move(byId('canvasSettings'), settingsHost); move(byId('canvasExtensions'), settingsHost); move(byId('canvasReliability'), reliabilityHost);
  clearQuery.disabled = !query.value;
  const cluster = byId('clusterOverview');
  if (cluster && cluster.parentElement !== column) column.insertBefore(cluster, surface);
  if (cluster) {
   let info = byId('shellClusterInfo') || cluster.querySelector('.shell-cluster-info');
   if (!info) { info = create('details', '', 'shell-cluster-info'); info.append(create('summary', 'About these groups')); cluster.append(info); }
   const paragraphs = [...cluster.querySelectorAll('p.cluster-help:not(#clusterHighlightStatus):not(#clusterNameProgress)')];
   if (paragraphs.length) { for (const paragraph of info.querySelectorAll('p')) paragraph.remove(); for (const paragraph of paragraphs) move(paragraph, info); }
   info.id = 'shellClusterInfo'; move(info, help);
   for (const theme of cluster.querySelectorAll('.cluster-theme-heading')) if (theme.title !== theme.textContent) theme.title = theme.textContent;
   const shortcut = cluster.querySelector(':scope > button.secondary');
   if (shortcut) { byId('shellFoundationsAction')?.remove(); shortcut.id = 'shellFoundationsAction'; shortcut.textContent = 'View shared foundations'; inspect.insertBefore(shortcut, foundations); }
  }
  if (byId('shellFoundationsAction')) byId('shellFoundationsAction').hidden = !document.body.classList.contains('coupling-canvas');
  const overviewNotes = byId('details').querySelector('.overview-context');
  if (overviewNotes) { help.querySelector('.overview-context')?.remove(); move(overviewNotes, help); }
  const foundationPanel = byId('couplingFoundations'); move(foundationPanel, foundations); foundations.hidden = !document.body.classList.contains('coupling-canvas');
  const couplingHeader = byId('evidence-settings');
  const newActions = couplingHeader?.querySelectorAll('button');
  if (newActions?.length) {
   for (const old of menu.querySelectorAll('.shell-coupling-action')) old.remove();
   for (const button of newActions) { button.classList.add('shell-coupling-action'); move(button, button.dataset.workspaceGroup === 'export' ? exportMenu : resourceMenu); }
  }
  for (const button of menu.querySelectorAll('.shell-coupling-action')) button.hidden = !document.body.classList.contains('coupling-canvas');
  fitMenu();
  const note = byId('analysisNote')?.textContent || '', progress = byId('evidence-workspace')?.querySelector('.evidence-progress')?.textContent || '';
  const busyPattern = /^(Loading|Preparing|Analyzing|Reconstructing|Counting|Clustering|Stability|Infomap:|Hypergraph modularity:|Auto CPM:|Block model:|Subcluster analysis failed|Community analysis failed|Analysis failed)/i;
  const visibleStatus = busyPattern.test(progress) && document.body.classList.contains('coupling-canvas') ? progress : busyPattern.test(note) ? note : '';
  if (status.textContent !== visibleStatus) status.textContent = visibleStatus;
  status.hidden = !visibleStatus;
  const works = byId('workList'), stats = byId('stats')?.textContent || '', info = window.atlasSharedCanvas?.summary();
  const coupling = document.body.classList.contains('coupling-canvas');
  const banner = document.querySelector('.method-bar strong'), bannerText = (info?.semantic||info?.collaboration) ? info.title+' · '+(info.entityKind==='source'?'source articles':(info.entityKind==='country'?'countries':info.entityKind+'s')) : info?.algorithm === 'historiography' ? 'Citation history · source articles' : coupling ? 'Coupling · source articles' : 'Co-citation · cited works';
  if (banner && banner.textContent !== bannerText) banner.textContent = bannerText;
  const format = value => Number.isFinite(value) ? Number(value.toPrecision(4)) : 'preparing';
  const setting = !info ? '' : info.methodDisplayLabel ? info.methodDisplayLabel : info.algorithm === 'not_requested' ? 'Construction only · communities not requested' : info.algorithm === 'trial' ? info.trialLabel : info.algorithm === 'historiography' ? 'Citation history · k=' + info.historyCore : info.algorithm === 'sbm' ? 'Nested block model' : info.algorithm === 'infomap' ? 'Infomap · Markov time ' + format(info.markovTime) : info.algorithm === 'hypergraph' ? 'Hypergraph · ' + info.objective : 'Leiden · CPM ' + format(info.resolution) + (info.automatic ? ' · Auto' : '');
  const counts = info ? info.shown + '/' + info.total + ((info.semantic||info.collaboration)?' '+(info.entityKind==='source'?'sources':(info.entityKind==='country'?'countries':info.entityKind+'s'))+' shown':coupling ? ' sources shown' : ' works shown') + (info.hideUnlinked ? ' · unlinked hidden' : '') + (info.minimumClusterSize > 1 ? ' · clusters ≥' + info.minimumClusterSize + ' '+(info.entityKind==='country'?'countries':info.entityKind?info.entityKind+'s':'works') : '') + (info.hiddenClusters ? ' · ' + info.hiddenClusters + ' groups hidden' : '') : stats;
  const next = visibleStatus ? /analysis failed|could not finish|not completed/i.test(visibleStatus) ? 'Analysis did not finish' : 'Updating this map…' : setting + ' · ' + counts + (info?.extensionLabel ? ' · ' + info.extensionLabel : '');
  if (context.textContent !== next) context.textContent = next;
  if (context.title !== stats) context.title = stats;
  if (works) works.setAttribute('aria-label',(info?.semantic||info?.collaboration)?'Matching '+(info.entityKind==='source'?'source articles':(info.entityKind==='country'?'countries':info.entityKind+'s')):document.body.classList.contains('coupling-canvas') ? 'Matching source articles' : 'Matching cited works');
  const hasSelection = document.body.classList.contains('has-selection');
  clearSelection.hidden = !hasSelection;
  for (const button of byId('details').querySelectorAll('button')) if (/^Clear selection/.test(button.textContent)) button.hidden = true;
  const selection = info?.selection || null, explicit = selectionIntent?.key === selection;
  if (selection && (selection !== lastSelection || explicit)) {
   show('inspect');
   if (explicit && selectionIntent.keyboard) {
    const heading = inspectHeading.querySelector('h2'); heading.tabIndex = -1; heading.focus({preventScroll: true});
    entries.get('inspect').panel.scrollIntoView({block: 'nearest', behavior: 'auto'});
   }
  }
  lastSelection = selection; selectionIntent = null;
  entries.get('inspect').toggle.classList.toggle('has-evidence', hasSelection);
  const inspectLabel = hasSelection ? 'Inspect selection' : 'Inspect';
  if (entries.get('inspect').toggle.textContent !== inspectLabel) entries.get('inspect').toggle.textContent = inspectLabel;
 }
 function schedule() { if (!scheduled) { scheduled = true; requestAnimationFrame(refresh); } }
 new MutationObserver(records => { if (records.some(record => !record.target.closest?.('svg'))) schedule(); }).observe(column, {childList: true, subtree: true, attributes:true, attributeFilter:['data-validation-state','data-validation-running','data-validation-outcome','data-validation-status','data-validation-phase','data-preliminary']});
 new MutationObserver(schedule).observe(document.body, {attributes: true, attributeFilter: ['class']});
 document.addEventListener('toggle', event => {
  if (event.target.id === 'canvasReliability' && event.target.open) show('analysis');
 }, true);
 document.addEventListener('keydown', event => { if ((event.key === 'Enter' || event.key === ' ') && event.target.closest?.('button,[data-node],[data-edge],[data-label]')) keyboardActivation = performance.now(); }, true);
 document.addEventListener('pointerdown', () => { keyboardActivation = -Infinity; }, true);
 window.atlasWorkspaceShell = {
  show,
  showAutomatic(id){if(startupToolChoice!==null){const selected=startupToolChoice;startupToolChoice=null;show(selected);return;}show(id);},
  addTool(id, title) { addPanel(id, title); return entries.get(id).body; },
  selected(key) { selectionIntent = {key, keyboard: performance.now() - keyboardActivation < 5000}; keyboardActivation = -Infinity; schedule(); },
  reveal(node) { for (const [id, entry] of entries) if (entry.panel.contains(node)) { show(id); for (let ancestor = node; ancestor && ancestor !== entry.body; ancestor = ancestor.parentElement) if (ancestor.tagName === 'DETAILS') ancestor.open = true; return; } },
  placeCoupling(node) { move(node, networkSettings); },
  refresh: schedule
 };
 refresh();
 if (window.atlasWorkspaceStartup) window.atlasWorkspaceStartup.complete();
 else { document.body.dataset.workspaceState = 'ready'; byId('workspaceStartup')?.remove(); }
})();

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const shell = fs.readFileSync('public/conservative-atlas/workspace-shell.js', 'utf8');

test('validation menu delegates to existing actions without starting work during refresh', () => {
 assert(shell.includes("validation.id = 'validationMenu'"));
 for (const id of ['validationQuick', 'validationFull', 'validationSettings']) assert(shell.includes(id));
 const refresh = shell.match(/function refreshValidation\(\) \{([\s\S]*?)\n \}/)[1];
 assert(!refresh.includes('.click('));
 assert(refresh.includes('target.disabled || waiting'));
 assert(refresh.includes('concepts.validationSummary'));
 assert(shell.includes('target.click()'));
 assert(shell.includes("Stability is not proof of a correct theme."));
});

test('automatic cluster naming progress stays beside the map, outside collapsed help', () => {
 assert(shell.includes('p.cluster-help:not(#clusterHighlightStatus):not(#clusterNameProgress)'));
});

test('Clear search changes only the query, not analysis or selection', () => {
 const body = shell.match(/clearQuery\.onclick = \(\) => \{(.*?)\};/s)[1];
 const calls = [], query = {value: 'leadership', dispatchEvent: event => calls.push(event), focus: options => calls.push(options)};
 const clear = new Function('query', body);
 clear(query);
 assert.equal(query.value, '');
 assert.equal(calls[0].type, 'input');
 assert.equal(calls[0].bubbles, true);
 assert.deepEqual(calls[1], {preventScroll: true});
 assert(!body.includes('reset'));
});

test('revealing nested evidence opens every containing disclosure and its tool', () => {
 const body = shell.match(/reveal\(node\) \{(.*?)\},\s*placeCoupling/s)[1];
 const outer = {tagName: 'DETAILS', open: false}, inner = {tagName: 'DETAILS', open: false, parentElement: outer};
 const target = {tagName: 'BUTTON', parentElement: inner}, panelBody = {};
 outer.parentElement = panelBody;
 const calls = [], entries = new Map([['inspect', {body: panelBody, panel: {contains: node => node === target}}]]);
 new Function('node', 'entries', 'show', body)(target, entries, id => calls.push(id));
 assert.deepEqual(calls, ['inspect']);
 assert.equal(inner.open, true);
 assert.equal(outer.open, true);
});

test('menu cleanup retains the global reset handler and sensitive analysis containers', () => {
 assert(shell.includes("move(reset, resourceMenu)"));
 assert(shell.includes("previousReset?.call(byId('reset'), event)"));
 assert(shell.includes("move(document.querySelector('.analysis-switches'), networkSettings)"));
 assert(shell.includes("move(byId('autoCPMInfo'), methodNotes)"));
 assert(!shell.includes("move(byId('autoCPMReport')"));
 assert(!shell.includes("move(byId('cpmSlider')"));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function startup() {
 const listeners = new Map(), body = {dataset: {workspaceState:'loading'}}, message = {textContent:''}, retry = {hidden:true};
 const screen = {removed:false, remove() { this.removed = true; }};
 let reloads = 0;
 const window = {location: {reload() { reloads++; }}, addEventListener(name, handler) { listeners.set(name, handler); }, removeEventListener(name) { listeners.delete(name); }};
 const document = {body, getElementById: id => ({workspaceStartup:screen, workspaceStartupMessage:message, workspaceStartupRetry:retry})[id]};
 class ErrorEvent {}
 vm.runInNewContext(fs.readFileSync('public/conservative-atlas/workspace-startup.js','utf8'), {window, document, ErrorEvent});
 return {window, body, screen, message, retry, listeners, reloads: () => reloads};
}

test('the prepared workspace replaces the loading screen without waiting for background analyses', () => {
 const page = startup();
 assert.equal(page.body.dataset.workspaceState, 'loading');
 page.window.atlasWorkspaceStartup.complete();
 assert.equal(page.body.dataset.workspaceState, 'ready');
 assert.equal(page.screen.removed, true);
 assert.equal(page.listeners.has('error'), false);
});

test('a failed startup script keeps the old layout hidden and exposes a working retry', () => {
 const page = startup();
 page.listeners.get('error')({target: {tagName:'SCRIPT'}});
 assert.equal(page.body.dataset.workspaceState, 'error');
 assert.equal(page.screen.removed, false);
 assert.equal(page.retry.hidden, false);
 page.retry.onclick();
 assert.equal(page.reloads(), 1);
});

test('unrelated resource errors do not interrupt startup', () => {
 const page = startup();
 page.listeners.get('error')({target: {tagName:'IMG'}});
 assert.equal(page.body.dataset.workspaceState, 'loading');
 assert.equal(page.retry.hidden, true);
});

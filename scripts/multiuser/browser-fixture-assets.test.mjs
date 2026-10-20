import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {fixtureAssetRoot} from './browser-fixture-assets.mjs';

test('browser fixture frozen assets are optional and restricted to its private code preview',async()=>{
 assert.equal(await fixtureAssetRoot(undefined,'1'),undefined);
 const workspace=await mkdtemp(path.join(os.tmpdir(),'bibliomap-code-preview-'));try{const expected=path.join(workspace,'.trials/improvement-program/preview-code/conservative-atlas');await mkdir(expected,{recursive:true});assert.equal(await fixtureAssetRoot(expected,'1',workspace),expected);await assert.rejects(fixtureAssetRoot(expected,'0',workspace),/explicit disposable/);await assert.rejects(fixtureAssetRoot(path.join(workspace,'public'),'1',workspace),/private preview/);await assert.rejects(fixtureAssetRoot(path.join(expected,'..'),'1',workspace),/private preview/);}finally{await rm(workspace,{recursive:true,force:true});}
});

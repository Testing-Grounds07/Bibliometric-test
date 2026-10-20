import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {preparedSemanticEvidence,embeddingEvidence} from './semantic-network.mjs';

test('actual keyword builder defines text provenance for custom mixed-document inputs without loading a model',()=>{
 const python=process.env.PYTHON_EXECUTABLE||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
 const program="import ast,json,pathlib; source=pathlib.Path('scripts/build-cluster-themes.py').read_text(encoding='utf-8'); tree=ast.parse(source); function=next(node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name=='cache_document_provenance'); namespace={}; exec(compile(ast.Module(body=[function],type_ignores=[]),'builder-contract','exec'),namespace); print(json.dumps([namespace['cache_document_provenance']({'documents':[]},False),namespace['cache_document_provenance'](None,True),namespace['cache_document_provenance'](None,False)]))";
 const values=JSON.parse(execFileSync(python,['-c',program],{windowsHide:true,encoding:'utf8'}));
 assert.match(values[0].documentUnit,/mixed/);for(const value of values)assert(value.textScope);
 assert.match(readFileSync('scripts/build-cluster-themes.py','utf8'),/result.update\(cache_document_provenance\(custom, source_mode\)\)/);
});
test('existing real source MiniLM cache is eligible only with explicit supplemental-text provenance',async()=>{
 const evidence=JSON.parse(readFileSync('public/conservative-atlas/source-evidence.json')),cache=JSON.parse(readFileSync('public/conservative-atlas/source-cluster-themes.json'));
 const prepared=await preparedSemanticEvidence(evidence.articles,cache,evidence.sourceCorpusId,true),validated=embeddingEvidence(prepared.works,cache,{},evidence.sourceCorpusId);
 assert.equal(validated.records.length,evidence.articles.length);assert.equal(prepared.supplementalText.checksum.length,64);assert.equal(validated.model.revision,cache.revision);assert.equal(validated.model.dimensions,384);
});

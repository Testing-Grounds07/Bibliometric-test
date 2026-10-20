import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {reselectCPM,AUTO_CPM_VERSION,AUTO_CPM_METHOD,AUTO_CPM_LIMITATIONS} from './auto-cpm.mjs';

const directory='public/conservative-atlas/',context={window:{}};
for(const name of ['data.js','settings-data.js','atlas-settings.js'])vm.runInNewContext(fs.readFileSync(directory+name,'utf8'),context);
const previous=context.window.ATLAS_SETTINGS;
assert([2,3].includes(previous.version),'Expected compatible bootstrap audit');
const fingerprint=createHash('sha256').update(fs.readFileSync(directory+'data.js')).digest('hex');
if(previous.sourceDataSha256)assert.equal(previous.sourceDataSha256,fingerprint,'Source data changed; rebuild rather than reuse audits');
const backup='.trials/conservative-cocitation/settings-before-overview-v3.js';
if(!fs.existsSync(backup))fs.copyFileSync(directory+'settings-data.js',backup);
const output={...previous,version:AUTO_CPM_VERSION,selectionUpdatedAt:new Date().toISOString(),sourceDataSha256:fingerprint,auditSamplesReused:true,method:AUTO_CPM_METHOD,limitations:AUTO_CPM_LIMITATIONS,configs:{}},comparison=[];
for(const [key,config] of Object.entries(previous.configs)){
 assert.equal(config.bootstrapCount,50);assert.equal(config.bootstrapRestarts,2);assert.equal(config.fullRestarts,10);
 const graph=context.window.resolveAtlasGraph(config.base,'.02',config.maximumOrder),next=reselectCPM(graph,config);
 const before=config.candidates.find(candidate=>candidate.resolution===config.autoResolution),after=next.candidates.find(candidate=>candidate.resolution===next.autoResolution);
 output.configs[key]=next;
 comparison.push({key,before:{resolution:before.resolution,clusters:before.clusters},after:{resolution:after.resolution,clusters:after.clusters,bootstrapARI:after.bootstrapARI,fragmentation:after.fragmentation,recommendation:next.recommendation}});
 console.log(key+': '+before.clusters+' → '+after.clusters+' clusters; '+next.recommendation.status);
}
fs.writeFileSync(directory+'settings-data.js','window.ATLAS_SETTINGS='+JSON.stringify(output).replaceAll('<','\\u003c')+';\n');
fs.writeFileSync('.trials/conservative-cocitation/auto-cpm-v3-comparison.json',JSON.stringify(comparison,null,2));
fs.writeFileSync('.trials/conservative-cocitation/auto-cpm-settings.json',JSON.stringify(output));

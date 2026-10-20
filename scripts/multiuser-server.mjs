import path from 'node:path';
import {Neo4jStore} from '../neo4j-store.mjs';
import {MultiuserStore} from './multiuser/store.mjs';
import {FileArtifacts} from './multiuser/artifacts.mjs';
import {configuration} from './multiuser/auth.mjs';
import {Computations} from './multiuser/computations.mjs';
import {createMultiuserServer} from './multiuser/http.mjs';
import {runnerConfiguration} from './multiuser/research-runner.mjs';
import {ResearchIntegration} from './multiuser/research.mjs';

const legacy=Neo4jStore.fromEnvironment(),store=new MultiuserStore(legacy),config=configuration();
await store.init();
const files=new FileArtifacts(process.env.BIBLIOMAP_ARTIFACT_ROOT||path.resolve('.local-artifacts'));await files.init(path.resolve('public'));
const limits={cpu:Number(process.env.BIBLIOMAP_CPU_WORKERS||2),retrieval:Number(process.env.BIBLIOMAP_RETRIEVAL_WORKERS||1),model:Number(process.env.BIBLIOMAP_MODEL_WORKERS||1),coordinator:2};
if(Object.values(limits).some(value=>!Number.isInteger(value)||value<1||value>16))throw Error('Worker counts must be between 1 and 16.');
const computations=new Computations(store,files,{limits});
if(process.env.BIBLIOMAP_RESEARCH_CONFIG){const integration=new ResearchIntegration(store,files,computations,await runnerConfiguration(process.env.BIBLIOMAP_RESEARCH_CONFIG));await integration.init();}
if(config.configured)computations.start();
const server=createMultiuserServer({store,files,computations,config});
server.listen(Number(process.env.BIBLIOMAP_PORT||8086),'127.0.0.1',()=>console.log('Multiuser BiblioMap on localhost:'+server.address().port+(config.configured?'':' · institutional login is not configured; access is closed')));
async function close(){server.close();await computations.close();await legacy.close();}
process.once('SIGINT',()=>close().then(()=>process.exit()));process.once('SIGTERM',()=>close().then(()=>process.exit()));

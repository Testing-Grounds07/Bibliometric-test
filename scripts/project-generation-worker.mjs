import {parentPort, workerData} from 'node:worker_threads';
import {mineProjectBundles} from './project-higher-orders.mjs';
try { parentPort.postMessage({result: mineProjectBundles(workerData.graph.nodes, workerData.graph.minimumSupport, {progress: progress => parentPort.postMessage({progress})})}); }
catch (error) { parentPort.postMessage({error: error.message}); }

import {analysisErrorMessage} from './analysis-errors.mjs';
import {analyzeRoles} from './network-roles.mjs';
import {createScientificManifest} from './scientific-manifest.mjs';
import {constructionCandidates, incidenceNull} from './construction-audit.mjs';
import {partition} from './auto-cpm.mjs';
import {applyCommunityResult} from './community-methods.mjs';
import {roleSensitivity} from './role-sensitivity.mjs';

self.onmessage = async event => {
 const {kind, graph, records, options = {}} = event.data;
 try {
  const result = kind === 'roles' ? analyzeRoles(graph, options) : kind === 'roleSensitivity' ? roleSensitivity(graph, options, progress => self.postMessage({progress})) : kind === 'manifest' ? await createScientificManifest(graph, records, options) : kind === 'construction' ? constructionCandidates(graph) : kind === 'null' ? incidenceNull(graph, options, progress => self.postMessage({progress})) : kind === 'fit' && options.algorithm === 'leiden' ? applyCommunityResult(graph, {...partition(graph, graph.resolution, options.trials || 2, options.seed || 42), algorithm: 'leiden'}) : null;
  if (!result) throw new Error('Unknown scientific audit.');
  self.postMessage({result});
 } catch (error) { self.postMessage({error: analysisErrorMessage(error)}); }
};

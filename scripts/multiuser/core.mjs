import {createHash, randomBytes, timingSafeEqual} from 'node:crypto';

export const VERSION = 'multiuser-1';
export const error = (message, status = 400) => Object.assign(new Error(message), {status});
export const token = () => randomBytes(32).toString('base64url');
export const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonical(value)).digest('hex');
export function canonical(value) {
 if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
 if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(Object.is(value, -0) ? 0 : value);
 if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
 if (value && Object.getPrototypeOf(value) === Object.prototype) return '{' + Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
 throw error('Inputs must be finite JSON values.');
}
export const unique = values => [...new Set(values)].sort();
export function equalSecret(left, right) {
 if (typeof left !== 'string' || typeof right !== 'string') return false;
 const first = Buffer.from(left), second = Buffer.from(right);
 return first.length === second.length && timingSafeEqual(first, second);
}
export const identity = (issuer, subject) => digest([issuer, subject]);
export const scopeFor = (projectId, publicEvidence) => publicEvidence ? 'public' : 'project:' + projectId;
export function calculation(stage, scope, input, settings = {}, dependencies = [], version = VERSION) {
 if (scope !== 'public' && !/^project:[0-9a-f-]{36}$/.test(scope)) throw error('Invalid access scope.');
 const specification = {stage, scope, version, input, settings, dependencies: [...dependencies].sort()};
 return {id: digest(specification), specification};
}
function integer(value, fallback, minimum, maximum) {
 const result = value === undefined || value === '' || value === null ? fallback : Number(value);
 if (!Number.isInteger(result) || result < minimum || result > maximum) throw error('Invalid integer setting.');
 return result;
}
function number(value, fallback, minimum, maximum) {
 const result = value === undefined || value === '' || value === null ? fallback : Number(value);
 if (!Number.isFinite(result) || result < minimum || result > maximum) throw error('Invalid numeric setting.');
 return result;
}
export function analysisSettings(input = {}) {
 const method = input.method || 'cocitation', algorithm = input.algorithm || 'leiden', model = input.networkModel || 'pairwise';
 if (!['cocitation', 'coupling', 'history'].includes(method) || !['leiden', 'infomap', 'hypergraph', 'sbm'].includes(algorithm) || !['pairwise', 'higher-order', 'hypergraph'].includes(model)) throw error('Unsupported analysis.');
 if(input.members!=null&&!Array.isArray(input.members))throw error('Reference scope must be an array.');
 const members = input.members == null ? null : unique(input.members);
 if (members && (members.length > 1500 || members.some(id => typeof id !== 'string' || id.length > 300))) throw error('Invalid reference scope.');
 const base = {method, preset: input.preset || 'conservative'};
 if (!['conservative', 'balanced', 'inclusive'].includes(base.preset)) throw error('Unknown screening preset.');
 if (method === 'history') return {...base, history: {core: integer(input.history?.core, 0, 0, 1000), limit: integer(input.history?.limit, 100, 1, 1000), from: input.history?.from == null ? null : integer(input.history.from, null, 1500, 2100), through: input.history?.through == null ? null : integer(input.history.through, null, 1500, 2100), includeUndated: input.history?.includeUndated !== false}};
 if (method === 'coupling' && model === 'higher-order' || algorithm === 'sbm' && model === 'hypergraph') throw error('This algorithm/network combination is unsupported.');
 const result = {...base, algorithm, networkModel: algorithm === 'hypergraph' ? 'hypergraph' : model, seed: integer(input.seed, 42, 1, 2147483637), trials: integer(input.trials, 10, 1, 10)};
 if (method === 'coupling') {
  if(input.sourceMembers!=null&&(!Array.isArray(input.sourceMembers)||input.sourceMembers.length>20000||input.sourceMembers.some(id=>typeof id!=='string'||id.length>300)))throw error('Invalid source scope.');
  Object.assign(result, {minimumShared: integer(input.minimumShared, 3, 1, 10000), minimumCosine: number(input.minimumCosine, .05, 0, 1),sourceMembers:input.sourceMembers==null?null:unique(input.sourceMembers)});
 }
 else Object.assign(result, {threshold: integer(input.threshold, 10, 1, 1000), support: integer(input.support, 5, 1, 1000), members, order: model === 'pairwise' ? 2 : input.order === 'all' ? 'all' : integer(input.order, 3, 2, 1000), maximumOrder: integer(input.maximumOrder, 1000, 2, 1000)});
 if(method==='cocitation'&&result.order!=='all')result.maximumOrder=result.order;
 if (algorithm === 'leiden') result.resolution = input.resolution == null || input.resolution === '' || input.resolution === 'auto' ? 'auto' : number(input.resolution, null, .000001, 100);
 if (algorithm === 'infomap') result.markovTime = number(input.markovTime, 1, .01, 100);
 if (algorithm === 'hypergraph') {
  result.hypergraphObjective = input.hypergraphObjective || 'linear';
  result.hypergraphSearch = input.hypergraphSearch || 'mixed';
  if (!['mixed','leiden-seeded','group-moves','annealing'].includes(result.hypergraphSearch)) throw error('Unsupported direct hypergraph search.');
  if (['group-moves','annealing'].includes(result.hypergraphSearch)) result.hypergraphSearchVersion = 'direct-search-v1';
  result.hypergraphResolution = number(input.hypergraphResolution, 1, .000001, 100);
  if (!['linear', 'quadratic', 'strict', 'majority'].includes(result.hypergraphObjective)) throw error('Unknown hypergraph objective.');
 }
 if (algorithm === 'sbm') result.selectedLevel = integer(input.selectedLevel, 0, 0, 100);
 return result;
}
export function workInputs(works) {
 return [...works].map(work => ({...work,...(Array.isArray(work.referenced_works)?{referenced_works:unique(work.referenced_works)}:{})})).sort((left, right) => left.id.localeCompare(right.id));
}
export const topologyInputs = works => workInputs(works).map(work => ({id: work.id, references: work.referenced_works}));
export const textInputs = works => workInputs(works).map(work => ({id: work.id, title: work.display_name || '', abstract: work.abstract_inverted_index || {}}));
export function assertRole(role, required = 'viewer') {
 if (!role || ({viewer: 1, editor: 2, owner: 3}[role] || 0) < {viewer: 1, editor: 2, owner: 3}[required]) throw error('Project not found or access denied.', 404);
}

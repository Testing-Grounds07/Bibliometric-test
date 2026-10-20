export function createCommunityLoader(host, document, timeoutMs = 60000) {
 let pending;
 const ready = () => typeof host.ATLAS_COMMUNITIES?.start === 'function' && typeof host.ATLAS_COMMUNITIES?.startReliability === 'function';
 const attempt = retry => new Promise((resolve, reject) => {
  const script = document.createElement('script');
  const timer = setTimeout(() => finish(new Error('Loading timed out.')), timeoutMs);
  const finish = error => {
   clearTimeout(timer); script.onload = null; script.onerror = null; script.remove();
   if (error) reject(error); else resolve(host.ATLAS_COMMUNITIES);
  };
  script.src = './community-methods.js?v=coupling-errors-2' + (retry ? '&retry=' + Date.now() : '');
  script.async = true;
  script.onload = () => finish(ready() ? null : new Error('The analysis engine did not initialize.'));
  script.onerror = () => finish(new Error('The analysis engine could not be downloaded.'));
  document.head.append(script);
 });
 return function loadCommunities() {
  if (ready()) return Promise.resolve(host.ATLAS_COMMUNITIES);
  if (!pending) pending = attempt(false).catch(() => attempt(true)).catch(() => {
   throw new Error('Could not load the analysis engine after two attempts. Check your connection, then run the check again.');
  }).finally(() => { pending = null; });
  return pending;
 };
}

export const loadCommunities = typeof window === 'undefined' ? null : createCommunityLoader(window, document);

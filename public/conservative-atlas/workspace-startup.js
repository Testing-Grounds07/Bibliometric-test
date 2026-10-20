(() => {
 'use strict';
 const screen = document.getElementById('workspaceStartup'), retry = document.getElementById('workspaceStartupRetry');
 retry.onclick = () => window.location.reload();
 function failed(event) {
  if (document.body.dataset.workspaceState === 'ready') return;
  if (event.target?.tagName !== 'SCRIPT' && !(event instanceof ErrorEvent)) return;
  document.body.dataset.workspaceState = 'error';
  document.getElementById('workspaceStartupMessage').textContent = 'The map could not finish loading. Reload to try again.';
  retry.hidden = false;
 }
 window.addEventListener('error', failed, true);
 window.atlasWorkspaceStartup = {
  complete() {
   document.body.dataset.workspaceState = 'ready';
   screen.remove();
   window.removeEventListener('error', failed, true);
  }
 };
})();

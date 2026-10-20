export function revealSection(target, always = false) {
 if (!target) return;
 window.atlasWorkspaceShell?.reveal(target);
 target.setAttribute('tabindex', '-1');
 target.focus({preventScroll: true});
 const bounds = target.getBoundingClientRect();
 if (always || bounds.top < 0 || bounds.top > window.innerHeight - 100) target.scrollIntoView({behavior: 'auto', block: 'start'});
}

export function restoreOrigin(origin, fallback) {
 if (!origin?.node?.isConnected) { revealSection(fallback, true); return; }
 origin.node.focus({preventScroll: true});
 const top = Number.isFinite(origin.viewportTop) ? window.scrollY + origin.node.getBoundingClientRect().top - origin.viewportTop : origin.scrollY;
 window.scrollTo({top: Math.max(0, top), behavior: 'auto'});
}

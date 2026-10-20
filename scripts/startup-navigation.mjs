export function baselineLocation(input) {
 try {return ['/conservative-atlas/','/conservative-atlas/index.html','/conservative-atlas/hypergraph-lab.html'].includes(new URL(input,'http://localhost').pathname);} catch {return false;}
}

export function createStartupNavigation(input, changed = () => {}) {
 let revision=0,phase=baselineLocation(input)?'baseline':'pending',navigating=false;
 const update=next=>{phase=next;changed({phase,revision,navigating});};
 return {
  state:()=>({phase,revision,navigating}),
  ready:()=>['baseline','study','completed'].includes(phase),
  automatic:()=>['baseline','study'].includes(phase),
  begin(){revision++;navigating=true;update('pending');return revision;},
  completed(token){if(token!==revision)return false;navigating=false;update('completed');return true;},
  waiting(token){if(token!==revision)return false;navigating=false;update('waiting');return true;},
  failed(token){if(token!==revision)return false;navigating=false;update('failed');return true;},
  installed(){if(navigating)return false;revision++;update('study');return true;},
  saved(){if(navigating)return false;revision++;update('completed');return true;},
  baseline(){revision++;navigating=false;update('baseline');}
 };
}

export function startupNavigation() {
 if(typeof window==='undefined')return null;
 if(!window.ATLAS_STARTUP_NAVIGATION){const input=window.location?.href||(typeof location==='undefined'?'/conservative-atlas/':location.href);window.ATLAS_STARTUP_NAVIGATION=createStartupNavigation(input,detail=>{const EventType=window.CustomEvent||globalThis.CustomEvent;if(EventType)window.dispatchEvent?.(new EventType('atlas:navigation-state',{detail}));});}
 return window.ATLAS_STARTUP_NAVIGATION;
}

export function navigationReady(graph) {
 const policy=startupNavigation();if(policy&&!policy.ready())return false;
 const current=typeof window==='undefined'?null:window.atlasSharedCanvas?.graph?.();
 return !current||!graph||current===graph;
}

export function automaticNavigationAllowed(graph) {return navigationReady(graph)&&(startupNavigation()?.automatic()??true);}

startupNavigation();

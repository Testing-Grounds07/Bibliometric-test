import {standaloneImport,importedThemeBinding} from './imported-theme-evidence.mjs';
import {navigationReady,automaticNavigationAllowed} from './startup-navigation.mjs';

export function descriptionsAllowed(graph,session={}){
 const imported=standaloneImport(graph);
 return !!graph&&(!imported||!session.active&&!!importedThemeBinding(graph))&&navigationReady(graph)&&(!graph.linkedBrowse||imported)&&!graph.collaboration&&!graph.temporalSelection&&!(graph.semantic&&graph.entityKind!=='source')&&(!session.active||session.canCompute===true);
}

// Imported saved maps have a frozen partition, but verified text interpretation
// uses the ordinary automatic queue once that exact map is navigation-ready.
export function automaticDescriptionsAllowed(graph,session={}){
 return descriptionsAllowed(graph,session)&&!graph.temporalSeries&&(standaloneImport(graph)||automaticNavigationAllowed(graph));
}

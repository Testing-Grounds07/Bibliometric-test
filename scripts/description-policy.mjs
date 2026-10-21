import {standaloneImport,importedThemeBinding} from './imported-theme-evidence.mjs';
import {navigationReady} from './startup-navigation.mjs';

export function descriptionsAllowed(graph,session={}){
 const imported=standaloneImport(graph);
 return !!graph&&(!imported||!session.active&&!!importedThemeBinding(graph))&&navigationReady(graph)&&(!graph.linkedBrowse||imported)&&!graph.collaboration&&!graph.temporalSelection&&!(graph.semantic&&graph.entityKind!=='source')&&(!session.active||session.canCompute===true);
}

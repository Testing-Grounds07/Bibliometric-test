import {navigationReady} from './startup-navigation.mjs';

export function descriptionsAllowed(graph,session={}){
 return !!graph&&!(graph._backend==='independent-bnr-standalone'&&graph.importedStandalone)&&navigationReady(graph)&&!graph.linkedBrowse&&!graph.collaboration&&!graph.temporalSelection&&!(graph.semantic&&graph.entityKind!=='source')&&(!session.active||session.canCompute===true);
}

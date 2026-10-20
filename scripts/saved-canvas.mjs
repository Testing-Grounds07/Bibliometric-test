const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);

export function prepareCanvasSnapshot(snapshot, options={}){
 const seen=new Set();
 function validate(session,depth){
  if(depth>8||seen.has(session))throw Error('The saved view has an invalid parent hierarchy.');
  if(!record(session)||!record(session.graph)||!Array.isArray(session.graph.nodes)||!Array.isArray(session.graph.links)||!record(session.controls)||!record(session.state)||!record(session.texts))throw Error('The saved view is missing required graph, controls or display state. The current study was not changed.');
  seen.add(session);
  if(options.corpusId&&session.evidenceCorpusId&&session.evidenceCorpusId!==options.corpusId)throw Error('The saved view and evidence belong to different corpora.');
  if(options.corpusId&&session.graph.sourceCorpusId&&session.graph.sourceCorpusId!==options.corpusId)throw Error('The saved graph and evidence belong to different corpora.');
  for(const value of Object.values(session.controls))if(!record(value))throw Error('The saved view contains invalid control state.');
  if(session.reference!=null)validate(session.reference,depth+1);
 }
 validate(snapshot,0);const prepared=structuredClone(snapshot);
 function normalize(session){session.hiddenClusters=new Set(session.hiddenClusters||[]);session.filteredClusters=session.filteredClusters?new Set(session.filteredClusters):null;if(options.completedBrowse)session.graph.linkedBrowse=true;if(session.reference)normalize(session.reference);}
 normalize(prepared);return prepared;
}

export function validateCanvasPacket(packet){
 if(packet===null)return;
 if(!record(packet)||typeof packet.corpusId!=='string'||!record(packet.evidence)||!Array.isArray(packet.evidence.articles)||packet.evidence.sourceCorpusId!==packet.corpusId)throw Error('The saved evidence packet is incomplete or belongs to a different corpus. The current study was not changed.');
}

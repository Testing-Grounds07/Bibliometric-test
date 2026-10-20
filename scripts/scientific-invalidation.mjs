export function invalidateScientificOutputs(graph) {
 if (graph.scientificManifest && !graph.evidenceProvenance) {
  const manifest = graph.scientificManifest;
  graph.evidenceProvenance = {evidenceId: manifest.evidence?.id || null, retrievedAt: manifest.evidence?.retrievedAt || null, retrieval: manifest.evidence?.retrieval || null, completeness: manifest.evidence?.completeness, versions: manifest.versions, textVersions: manifest.dependencies?.textVersions};
 }
 delete graph.scienceAudit;
 delete graph.collaborationSensitivity;
 delete graph.temporalSeries;
 delete graph.temporalSelection;
 delete graph.burstReport;
 delete graph.scientificManifest;
 return graph;
}

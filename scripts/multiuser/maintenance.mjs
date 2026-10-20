import {identity,digest,error} from './core.mjs';

export async function migrationReport(store){
 const projects=await store.tx(false,async transaction=>(await transaction.run('MATCH (project:BMProject) WHERE project.deleted_at IS NULL AND NOT (:BMMembership)-[:IN_PROJECT]->(project) RETURN project')).records.map(record=>JSON.parse(record.get('project').properties.payload))),corpora=await store.legacy.list('corpora'),analyses=await store.legacy.list('analyses');
 return {projects:projects.map(item=>({id:item.id,name:item.name})),corpora:corpora.map(item=>({id:item.id,projectId:item.project_id,works:item.work_count})),legacyAnalyses:analyses.map(item=>({id:item.id,projectId:item.project_id,name:item.name})),policy:'Add owner memberships and project-private frozen evidence; preserve IDs, payloads, native networks, bundles and lineage. Legacy outputs are not equivalent reusable calculations.'};
}
export async function migrate(store,files,owner,{execute=false}={}){
 if(!owner.issuer||!owner.subject||!owner.email)throw error('Explicit owner issuer, subject and email are required.');
 const report=await migrationReport(store);if(!execute)return {...report,dryRun:true};
 const userId=identity(owner.issuer,owner.subject);
 await store.tx(true,async transaction=>{
  await store.lock(transaction,'migration');
  await transaction.run('MERGE (item:BMUser {id:$id}) ON CREATE SET item.issuer=$issuer,item.subject=$subject,item.email=$email,item.name=$name,item.enabled=true,item.admin=true,item.createdAt=$now',{id:userId,issuer:owner.issuer,subject:owner.subject,email:owner.email.toLowerCase(),name:owner.name||owner.email,now:Date.now()});
  for(const project of report.projects){await store.lock(transaction,'project:'+project.id);await transaction.run('MATCH (user:BMUser {id:$userId}),(project:BMProject {id:$projectId}) WHERE NOT (:BMMembership)-[:IN_PROJECT]->(project) SET project.migrationOwnerId=$userId MERGE (member:BMMembership {id:$id}) ON CREATE SET member.role="owner",member.projectId=$projectId,member.userId=$userId MERGE (user)-[:HAS_MEMBERSHIP]->(member) MERGE (member)-[:IN_PROJECT]->(project)',{id:digest([userId,project.id]),userId,projectId:project.id});}
  await transaction.run('MATCH (project:BMProject {migrationOwnerId:$userId}),(analysis:BMAnalysis {project_id:project.id}) WHERE NOT (analysis)-[:PINNED_RESULT]->() SET analysis.legacy_snapshot=true',{userId});
 });
 let imported=0;
 for(const summary of report.corpora){
  const eligible=await store.tx(false,async transaction=>(await transaction.run('MATCH (project:BMProject {id:$id,migrationOwnerId:$userId}) RETURN project',{id:summary.projectId,userId})).records.length>0);if(!eligible)continue;
  const corpus=await store.legacy.get('corpora',summary.id),snapshot={works:corpus.works,metadata:[],publicEvidence:false,importedAt:corpus.created_at,originalCorpusId:corpus.id,originalSearchId:corpus.search_id||null,decisions:corpus.decisions,complete:true,coverage:'Legacy metadata as saved; original completeness may be unknown.'},blob=await files.put(snapshot);
  const artifactId=await store.tx(true,async transaction=>{const id=await store.registerArtifact(transaction,{...blob,scope:'project:'+corpus.project_id,kind:'evidence'});await store.projectEvidence(transaction,id,snapshot);return id;});
  await store.attachEvidence(userId,corpus.project_id,artifactId,{query:corpus.name,retrieved:corpus.works.length,evidenceDate:corpus.created_at,legacy:true,originalCorpusId:corpus.id});imported++;
 }
 return {...report,dryRun:false,ownerId:userId,importedEvidence:imported};
}
export async function cleanupReport(store,files){
 const data=await store.tx(false,async transaction=>{
  const roots=(await transaction.run('MATCH (project:BMProject) WHERE project.deleted_at IS NULL OPTIONAL MATCH (project)-[:HAS_EVIDENCE]->(:BMEvidenceRef)-[:USES]->(evidence:BMArtifact) OPTIONAL MATCH (project)-[:HAS_RESULT]->(:BMResult)-[:USES_RUN]->(:BMJob)-[:PRODUCED]->(result:BMArtifact) OPTIONAL MATCH (project)-[:HAS_RESEARCH_RUN]->(:BMJob)-[:PRODUCED]->(research:BMArtifact) RETURN collect(DISTINCT evidence.id)+collect(DISTINCT result.id)+collect(DISTINCT research.id) AS ids')).records[0].get('ids');
  const needed=(await transaction.run('MATCH (subscription:BMSubscription {cancelled:false})-[:SUBSCRIBES]->(root:BMJob)-[:NEEDS*0..]->(job:BMJob) MATCH (:BMUser {id:subscription.userId,enabled:true})-[:HAS_MEMBERSHIP]->(:BMMembership {projectId:subscription.projectId})-[:IN_PROJECT]->(project:BMProject) WHERE project.deleted_at IS NULL AND root.state IN ["queued","running"] OPTIONAL MATCH (job)-[:INPUT|PRODUCED]->(artifact:BMArtifact) RETURN collect(DISTINCT artifact.id) AS ids')).records[0].get('ids');
  const preserved=(await transaction.run('MATCH (root:BMArtifact) WHERE root.id IN $roots MATCH (root)-[:DEPENDS_ON|COMPUTED_FROM*0..]->(artifact:BMArtifact) RETURN collect(DISTINCT artifact.id) AS ids',{roots:[...roots,...needed]})).records[0].get('ids');
  const all=(await transaction.run('MATCH (artifact:BMArtifact) RETURN artifact')).records.map(record=>record.get('artifact').properties);return {all,preserved};
 });
 const preserved=new Set(data.preserved),candidates=data.all.filter(item=>!preserved.has(item.id)),keptChecksums=new Set(data.all.filter(item=>preserved.has(item.id)).map(item=>item.checksum)),disk=await files.files();
 const removable=disk.filter(item=>!keptChecksums.has(item.checksum));
 return {artifacts:candidates.map(item=>({id:item.id,checksum:item.checksum,scope:item.scope,bytes:item.bytes})),files:removable,bytes:removable.reduce((sum,item)=>sum+item.bytes,0),policy:'Manual cleanup only. Referenced evidence/results and dependencies are retained. Semantic model/embedding caches and old .trials directories are excluded.'};
}
export async function cleanup(store,files,{execute=false}={}){
 if(!execute)return {...await cleanupReport(store,files),dryRun:true};
 await store.tx(true,async transaction=>{await store.lock(transaction,'maintenance');await transaction.run('MERGE (item:BMScheduler {id:"maintenance"}) SET item.enabled=true');});
 try{
  const active=await store.tx(false,async transaction=>(await transaction.run('MATCH (item:BMJob {state:"running"}) RETURN count(item) AS total')).records[0].get('total'));if(active)throw error('Stop workers and wait for running jobs to finish before cleanup.',409);
  const report=await cleanupReport(store,files),ids=report.artifacts.map(item=>item.id);
  await store.tx(true,async transaction=>{
   await store.lock(transaction,'scheduler');await transaction.run('MATCH (job:BMJob) WHERE job.artifactId IN $ids OR job.inputArtifact IN $ids SET job.state="purged"',{ids});
   await transaction.run('MATCH (item:BMArtifactNode) WHERE item.artifactId IN $ids DETACH DELETE item',{ids});await transaction.run('MATCH (item:BMArtifactBundle) WHERE item.artifactId IN $ids DETACH DELETE item',{ids});await transaction.run('MATCH (item:BMArtifact) WHERE item.id IN $ids DETACH DELETE item',{ids});
   for(const label of ['BMArtifactHyperedge','BMArtifactWork'])await transaction.run(`MATCH (item:${label}) WHERE item.artifactId IN $ids DETACH DELETE item`,{ids});
   await transaction.run('MATCH (item:BMReferenceIdentity) WHERE NOT (item)--() DELETE item');
   await transaction.run('MATCH (item:BMReferenceVersion) WHERE NOT (item)-[:USES]->(:BMArtifact) DETACH DELETE item');
  });
  for(const file of report.files)await files.remove(file.checksum);return {...report,dryRun:false};
 }finally{await store.tx(true,transaction=>transaction.run('MATCH (item:BMScheduler {id:"maintenance"}) SET item.enabled=false'));}
}

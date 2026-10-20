import {randomUUID} from 'node:crypto';
import {identity, digest, token, canonical, assertRole, error} from './core.mjs';
import {graphRows} from '../../neo4j-store.mjs';
import {nativeNetwork} from '../workspace-projects-core.mjs';

const properties = (result, name = 'item') => result.records[0]?.get(name)?.properties || null;
const rows = (result, name = 'item') => result.records.map(record => record.get(name).properties);
export class MultiuserStore {
 constructor(legacy) { this.legacy = legacy; this.driver = legacy.driver; this.database = legacy.database; }
 async tx(write, callback) {
  const session = this.driver.session({database: this.database});
  try { return await session[write ? 'executeWrite' : 'executeRead'](callback); } finally { await session.close(); }
 }
 async init() {
  await this.legacy.init();
  for (const label of ['BMUser','BMSession','BMLogin','BMInvitation','BMMembership','BMWorkspace','BMArtifact','BMArtifactNode','BMArtifactWork','BMReferenceIdentity','BMArtifactBundle','BMArtifactHyperedge','BMReferenceVersion','BMScreeningVersion','BMCalculation','BMJob','BMSubscription','BMResult','BMEvidenceRef','BMGuard','BMWorkerSlot','BMScheduler']) await this.driver.executeQuery(`CREATE CONSTRAINT ${label.toLowerCase()}_id IF NOT EXISTS FOR (item:${label}) REQUIRE item.id IS UNIQUE`, {}, {database: this.database});
 }
 async lock(transaction, id) { await transaction.run('MERGE (guard:BMGuard {id:$id}) SET guard.version=coalesce(guard.version,0)+1', {id}); }
 async gate(userId, projectId, required = 'viewer', transaction) {
  const check = async current => {
   const result = await current.run('MATCH (user:BMUser {id:$userId,enabled:true})-[:HAS_MEMBERSHIP]->(member:BMMembership {projectId:$projectId})-[:IN_PROJECT]->(project:BMProject) WHERE project.deleted_at IS NULL RETURN member.role AS role', {userId,projectId});
   const role = result.records[0]?.get('role'); assertRole(role, required); return role;
  };
  return transaction ? check(transaction) : this.tx(false, check);
 }
 async user(id) { return this.tx(false, async transaction => properties(await transaction.run('MATCH (item:BMUser {id:$id,enabled:true}) RETURN item', {id}))); }
 async acceptIdentity(claims, invitationToken) {
  const id = identity(claims.iss, claims.sub), email = claims.email_verified === true && typeof claims.email === 'string' ? claims.email.toLowerCase() : null;
  return this.tx(true, async transaction => {
   await this.lock(transaction, 'user:' + id);
   let user = properties(await transaction.run('MATCH (item:BMUser {id:$id}) RETURN item', {id}));
   let invitation;
   if (invitationToken) {
    const invitationId = digest(invitationToken); await this.lock(transaction, 'invitation:' + invitationId);
    invitation = properties(await transaction.run('MATCH (item:BMInvitation {id:$id}) WHERE item.usedAt IS NULL AND item.expiresAt>$now RETURN item', {id:invitationId,now:Date.now()}));
    if (!invitation || !email || invitation.email !== email || invitation.issuer !== claims.iss) throw error('Invitation does not match the verified institutional account.', 403);
    const inviter = await this.userIn(transaction, invitation.inviterId);
    if (!inviter) throw error('Invitation is no longer valid.', 403);
    await this.lock(transaction,'project:'+invitation.projectId);await this.gate(inviter.id, invitation.projectId, 'owner', transaction);
   }
   if (!user && !invitation || user?.enabled === false) throw error('An invitation is required.', 403);
   if (!user) {
    user = {id,issuer:claims.iss,subject:claims.sub,email,name:String(claims.name || email || 'Researcher').slice(0,200),enabled:true,admin:false,createdAt:Date.now()};
    await transaction.run('CREATE (item:BMUser) SET item=$user', {user});
   }
   if (invitation) {
    await this.lock(transaction, 'project:' + invitation.projectId);
    const membershipId = digest([id, invitation.projectId]);
    await transaction.run('MATCH (user:BMUser {id:$userId}),(project:BMProject {id:$projectId}) MERGE (member:BMMembership {id:$id}) ON CREATE SET member.projectId=$projectId,member.userId=$userId,member.role=$role MERGE (user)-[:HAS_MEMBERSHIP]->(member) MERGE (member)-[:IN_PROJECT]->(project)', {userId:id,projectId:invitation.projectId,id:membershipId,role:invitation.role});
    await transaction.run('MATCH (item:BMInvitation {id:$id}) SET item.usedAt=$now,item.acceptedBy=$userId', {id:invitation.id,now:Date.now(),userId:id});
   }
   return user;
  });
 }
 async userIn(transaction, id) { return properties(await transaction.run('MATCH (item:BMUser {id:$id,enabled:true}) RETURN item',{id})); }
 async newSession(userId) {
  const secret = token(), csrf = token(), id = digest(secret), expiresAt = Date.now() + 12 * 3600000;
  await this.tx(true, async transaction => { if (!await this.userIn(transaction,userId)) throw error('Sign in required.',401); await transaction.run('CREATE (item:BMSession {id:$id,userId:$userId,csrf:$csrf,expiresAt:$expiresAt})',{id,userId,csrf,expiresAt}); });
  return {secret,csrf,expiresAt};
 }
 async session(secret) {
  if (!secret) return null;
  return this.tx(false, async transaction => {
   const result = await transaction.run('MATCH (session:BMSession {id:$id}),(user:BMUser {id:session.userId,enabled:true}) WHERE session.expiresAt>$now RETURN session,user',{id:digest(secret),now:Date.now()});
   return result.records.length ? {session:result.records[0].get('session').properties,user:result.records[0].get('user').properties} : null;
  });
 }
 async logout(secret) { await this.tx(true, transaction => transaction.run('MATCH (item:BMSession {id:$id}) DELETE item',{id:digest(secret || '')})); }
 async loginState(id, payload) { await this.tx(true, transaction => transaction.run('CREATE (item:BMLogin {id:$id,payload:$payload,expiresAt:$expiry})',{id:digest(id),payload:JSON.stringify(payload),expiry:Date.now()+600000})); }
 async takeLogin(id) {
  return this.tx(true, async transaction => {
   await this.lock(transaction,'login:'+digest(id));
   const item=properties(await transaction.run('MATCH (item:BMLogin {id:$id}) WHERE item.expiresAt>$now RETURN item',{id:digest(id),now:Date.now()}));
   await transaction.run('MATCH (item:BMLogin {id:$id}) DELETE item',{id:digest(id)}); return item ? JSON.parse(item.payload) : null;
  });
 }
 async projects(userId) {
  return this.tx(false, async transaction => (await transaction.run('MATCH (:BMUser {id:$userId,enabled:true})-[:HAS_MEMBERSHIP]->(member)-[:IN_PROJECT]->(project:BMProject) WHERE project.deleted_at IS NULL RETURN project,member.role AS role ORDER BY project.updated_at DESC',{userId})).records.map(record=>({...JSON.parse(record.get('project').properties.payload),role:record.get('role')})));
 }
 async createProject(userId, name) {
  if (typeof name !== 'string' || !name.trim() || name.length>200) throw error('Enter a project name, up to 200 characters.');
  const now=new Date().toISOString(), project={id:randomUUID(),name:name.trim(),description:'',created_at:now,updated_at:now,revision:0};
  return this.tx(true, async transaction => {
   if (!await this.userIn(transaction,userId)) throw error('Sign in required.',401);
   await transaction.run('MATCH (user:BMUser {id:$userId}) CREATE (project:BMRecord:BMProject {id:$id,name:$name,payload:$payload,created_at:$now,updated_at:$now,revision:0}) CREATE (member:BMMembership {id:$memberId,projectId:$id,userId:$userId,role:"owner"}) CREATE (user)-[:HAS_MEMBERSHIP]->(member)-[:IN_PROJECT]->(project)',{userId,id:project.id,name:project.name,payload:JSON.stringify(project),now,memberId:digest([userId,project.id])}); return {...project,role:'owner'};
  });
 }
 async editProject(userId, projectId, input) {
  return this.tx(true,async transaction=>{
   await this.lock(transaction,'project:'+projectId);await this.gate(userId,projectId,'editor',transaction);
   const item=properties(await transaction.run('MATCH (item:BMProject {id:$id}) RETURN item',{id:projectId}));
   if(input.revision!==(item.revision||0))throw error('Project changed. Reload before saving.',409);
   const project=JSON.parse(item.payload);for(const key of ['name','description'])if(input[key]!==undefined){if(typeof input[key]!=='string'||input[key].length>(key==='name'?200:30000)||key==='name'&&!input[key].trim())throw error('Invalid project field.');project[key]=input[key];}
   project.revision=(item.revision||0)+1;project.updated_at=new Date().toISOString();
   await transaction.run('MATCH (item:BMProject {id:$id}) SET item.payload=$payload,item.name=$name,item.updated_at=$now,item.revision=$revision',{id:projectId,payload:JSON.stringify(project),name:project.name,now:project.updated_at,revision:project.revision});return project;
  });
 }
 async members(userId,projectId){await this.gate(userId,projectId,'owner');return this.tx(false,async transaction=>(await transaction.run('MATCH (user:BMUser)-[:HAS_MEMBERSHIP]->(member {projectId:$projectId}) RETURN user.id AS id,user.name AS name,user.email AS email,member.role AS role',{projectId})).records.map(record=>record.toObject()));}
 async invite(userId,projectId,email,role,issuer){
  if(!['owner','editor','viewer'].includes(role)||typeof email!=='string'||!/^\S+@\S+\.\S+$/.test(email))throw error('Choose a role and valid institutional email.');
  const secret=token();await this.tx(true,async transaction=>{await this.lock(transaction,'project:'+projectId);await this.gate(userId,projectId,'owner',transaction);await transaction.run('CREATE (item:BMInvitation {id:$id,projectId:$projectId,inviterId:$userId,email:$email,role:$role,issuer:$issuer,expiresAt:$expiresAt})',{id:digest(secret),projectId,userId,email:email.toLowerCase(),role,issuer,expiresAt:Date.now()+7*86400000});});return secret;
 }
 async changeMember(userId,projectId,memberId,role){
  if(role!==null&&!['owner','editor','viewer'].includes(role))throw error('Unknown role.');
  await this.tx(true,async transaction=>{
   await this.lock(transaction,'project:'+projectId);await this.gate(userId,projectId,'owner',transaction);
   const members=rows(await transaction.run('MATCH (item:BMMembership {projectId:$projectId}) RETURN item',{projectId})),member=members.find(item=>item.userId===memberId);
   if(!member)throw error('Member not found.',404);if(member.role==='owner'&&role!=='owner'&&members.filter(item=>item.role==='owner').length===1)throw error('A project must retain an owner.',409);
   if(role)await transaction.run('MATCH (item:BMMembership {id:$id}) SET item.role=$role',{id:member.id,role});else await transaction.run('MATCH (item:BMMembership {id:$id}) DETACH DELETE item',{id:member.id});
  });
 }
 async workspace(userId,projectId){await this.gate(userId,projectId);return this.tx(false,async transaction=>{const item=properties(await transaction.run('MATCH (item:BMWorkspace {id:$id}) RETURN item',{id:digest([userId,projectId])}));return item?{revision:item.revision,...JSON.parse(item.payload)}:{revision:0};});}
 async saveWorkspace(userId,projectId,revision,payload){
  return this.tx(true,async transaction=>{
   await this.lock(transaction,'project:'+projectId);await this.gate(userId,projectId,'viewer',transaction);
   const id=digest([userId,projectId]);await this.lock(transaction,'workspace:'+id);
   const previous=properties(await transaction.run('MATCH (item:BMWorkspace {id:$id}) RETURN item',{id}));if(revision!==(previous?.revision||0))throw error('Your workspace changed on another device. Reload before saving.',409);
   if(payload.resultId){const base=await this.resultIn(transaction,userId,projectId,payload.resultId);await this.validateAttachments(transaction,userId,projectId,base,payload.attachmentIds||[]);}
   if(payload.findingId){const record=await this.legacy.getIn(transaction,'analyses',payload.findingId);if(record?.project_id!==projectId)throw error('Finding not found.',404);}
   const next=revision+1;await transaction.run('MERGE (item:BMWorkspace {id:$id}) SET item.projectId=$projectId,item.userId=$userId,item.payload=$payload,item.revision=$revision,item.updatedAt=$now WITH item MATCH (user:BMUser {id:$userId}) SET user.lastProjectId=$projectId',{id,projectId,userId,payload:JSON.stringify(payload),revision:next,now:Date.now()});return {revision:next};
  });
 }
 async registerArtifact(transaction, artifact) {
  await this.available(transaction);
  const id=digest([artifact.scope,artifact.checksum,artifact.kind]);
  await transaction.run('MERGE (item:BMArtifact {id:$id}) ON CREATE SET item += $properties',{id,properties:{...artifact,id,state:'succeeded',createdAt:Date.now()}});return id;
 }
 async projectEvidence(transaction,artifactId,snapshot){
  await this.lock(transaction,'artifact:'+artifactId);const artifact=await this.artifactIn(transaction,artifactId);if(artifact.evidenceProjected)return;
  for(let offset=0;offset<snapshot.works.length;offset+=250){
   const works=snapshot.works.slice(offset,offset+250).map(work=>({id:digest([artifactId,work.id]),workId:work.id,payload:JSON.stringify(work),identityId:digest([artifact.scope,work.id]),references:[...new Set(work.referenced_works||[])].map(id=>({id:digest([artifact.scope,id]),workId:id}))}));
   await transaction.run('MATCH (artifact:BMArtifact {id:$artifactId}) UNWIND $works AS work MERGE (identity:BMReferenceIdentity {id:work.identityId}) ON CREATE SET identity.workId=work.workId,identity.scope=$scope CREATE (item:BMArtifactWork {id:work.id,artifactId:$artifactId,workId:work.workId,payload:work.payload}) CREATE (artifact)-[:OBSERVED]->(item)-[:REPRESENTS]->(identity) WITH item,work UNWIND work.references AS reference MERGE (target:BMReferenceIdentity {id:reference.id}) ON CREATE SET target.workId=reference.workId,target.scope=$scope CREATE (item)-[:CITES {artifactId:$artifactId}]->(target)',{artifactId,scope:artifact.scope,works});
  }
  await transaction.run('MATCH (artifact:BMArtifact {id:$id}) SET artifact.evidenceProjected=true',{id:artifactId});
 }
 async attachEvidence(userId,projectId,artifactId,details={}){
  return this.tx(true,async transaction=>{
   await this.lock(transaction,'project:'+projectId);await this.gate(userId,projectId,'editor',transaction);
   const artifact=await this.artifactIn(transaction,artifactId);if(!artifact||artifact.scope!=='public'&&artifact.scope!=='project:'+projectId)throw error('Evidence not found.',404);
   const id=digest([projectId,artifactId]);await transaction.run('MATCH (project:BMProject {id:$projectId}),(artifact:BMArtifact {id:$artifactId}) MERGE (item:BMEvidenceRef {id:$id}) ON CREATE SET item.projectId=$projectId,item.artifactId=$artifactId,item.details=$details,item.createdAt=$now MERGE (project)-[:HAS_EVIDENCE]->(item) MERGE (item)-[:USES]->(artifact)',{id,projectId,artifactId,details:JSON.stringify(details),now:Date.now()});return {id,...details};
  });
 }
 async evidence(userId,projectId,id){return this.tx(false,async transaction=>{await this.gate(userId,projectId,'viewer',transaction);const item=properties(await transaction.run('MATCH (:BMProject {id:$projectId})-[:HAS_EVIDENCE]->(item:BMEvidenceRef {id:$id}) RETURN item',{projectId,id}));if(!item)throw error('Evidence not found.',404);return {...item,artifact:await this.artifactIn(transaction,item.artifactId)};});}
 async screening(userId,projectId){return this.tx(false,async transaction=>{await this.gate(userId,projectId,'viewer',transaction);const project=properties(await transaction.run('MATCH (item:BMProject {id:$id}) RETURN item',{id:projectId})),versions=rows(await transaction.run('MATCH (:BMProject {id:$id})-[:HAS_SCREENING]->(item:BMScreeningVersion) RETURN item ORDER BY item.revision DESC',{id:projectId}));return {revision:project.screeningRevision||0,versions:versions.map(item=>({...item,decisions:JSON.parse(item.decisions)}))};});}
 async saveScreening(userId,projectId,revision,parent,blob,snapshot,decisions){
  return this.tx(true,async transaction=>{
   await this.lock(transaction,'project:'+projectId);await this.gate(userId,projectId,'editor',transaction);
   const project=properties(await transaction.run('MATCH (item:BMProject {id:$id}) RETURN item',{id:projectId}));if(revision!==(project.screeningRevision||0))throw error('Screening changed. Reload its latest version before saving.',409);
   const evidence=properties(await transaction.run('MATCH (:BMProject {id:$projectId})-[:HAS_EVIDENCE]->(item:BMEvidenceRef {id:$id}) RETURN item',{projectId,id:parent.id}));if(evidence?.artifactId!==parent.artifact.id)throw error('Evidence not found.',404);
   const artifactId=await this.registerArtifact(transaction,{...blob,scope:'project:'+projectId,kind:'evidence'}),evidenceId=digest([projectId,artifactId]),id=randomUUID(),next=revision+1,now=Date.now();
   await this.projectEvidence(transaction,artifactId,snapshot);
   await transaction.run('MATCH (project:BMProject {id:$projectId}),(artifact:BMArtifact {id:$artifactId}),(parent:BMArtifact {id:$parentArtifact}) MERGE (artifact)-[:DEPENDS_ON]->(parent) MERGE (evidence:BMEvidenceRef {id:$evidenceId}) ON CREATE SET evidence.projectId=$projectId,evidence.artifactId=$artifactId,evidence.createdAt=$now,evidence.details=$details MERGE (project)-[:HAS_EVIDENCE]->(evidence) MERGE (evidence)-[:USES]->(artifact) CREATE (version:BMScreeningVersion {id:$id,projectId:$projectId,revision:$revision,createdAt:$now,createdBy:$userId,parentEvidenceId:$parentEvidenceId,evidenceId:$evidenceId,decisions:$decisions}) CREATE (project)-[:HAS_SCREENING]->(version)-[:USES]->(artifact) SET project.screeningRevision=$revision,project.currentScreeningId=$id',{projectId,artifactId,parentArtifact:parent.artifact.id,parentEvidenceId:parent.id,evidenceId,id,revision:next,userId,now,decisions:JSON.stringify(decisions),details:JSON.stringify({query:'Screening version '+next,retrieved:snapshot.works.length,evidenceDate:snapshot.retrievedAt||snapshot.importedAt,screeningVersion:id})});
   return {id,revision:next,evidenceId};
  });
 }
 async artifactIn(transaction,id){return properties(await transaction.run('MATCH (item:BMArtifact {id:$id,state:"succeeded"}) RETURN item',{id}));}
 async artifact(id){return this.tx(false,transaction=>this.artifactIn(transaction,id));}
 async referenceVersions(scope,epoch,ids){return this.tx(false,async transaction=>(await transaction.run('MATCH (item:BMReferenceVersion {scope:$scope,epoch:$epoch})-[:USES]->(artifact:BMArtifact {state:"succeeded"}) WHERE item.workId IN $ids RETURN artifact',{scope,epoch,ids})).records.map(record=>record.get('artifact').properties));}
 async saveReferenceVersion(job,epoch,workId,blob){return this.tx(true,async transaction=>{await this.fenced(transaction,job);const artifactId=await this.registerArtifact(transaction,{...blob,scope:job.scope,kind:'reference-version'}),id=digest([job.scope,epoch,workId]);await transaction.run('MATCH (artifact:BMArtifact {id:$artifactId}) MERGE (item:BMReferenceVersion {id:$id}) ON CREATE SET item.scope=$scope,item.epoch=$epoch,item.workId=$workId MERGE (item)-[:USES]->(artifact)',{id,scope:job.scope,epoch,workId,artifactId});});}
 async submit(userId,projectId,specification,inputArtifact,force=false){
  return this.tx(true,async transaction=>{
   await this.lock(transaction,'project:'+projectId);await this.gate(userId,projectId,'editor',transaction);
   const job=await this.ensureJob(transaction,specification,inputArtifact,userId,force);
   const subscription={id:randomUUID(),userId,projectId,jobId:job.id,cancelled:false,createdAt:Date.now()};
   await transaction.run('MATCH (job:BMJob {id:$jobId}) CREATE (item:BMSubscription) SET item=$subscription CREATE (item)-[:SUBSCRIBES]->(job)',{jobId:job.id,subscription});return {id:subscription.id,status:job.state};
  });
 }
 async ensureJob(transaction,specification,inputArtifact,userId,force=false){
  await this.available(transaction);
  await this.lock(transaction,'calculation:'+specification.id);
  await transaction.run('MERGE (item:BMCalculation {id:$id}) ON CREATE SET item.scope=$scope,item.stage=$stage,item.specification=$specification',{id:specification.id,scope:specification.specification.scope,stage:specification.specification.stage,specification:canonical(specification.specification)});
  if(!force){const found=properties(await transaction.run('MATCH (:BMCalculation {id:$id})-[:HAS_RUN]->(item:BMJob) WHERE item.state="succeeded" OR (item.state IN ["queued","running"] AND item.forced=false) RETURN item ORDER BY CASE item.state WHEN "succeeded" THEN 0 ELSE 1 END,item.createdAt DESC LIMIT 1',{id:specification.id}));if(found){await transaction.run('MATCH (item:BMCalculation {id:$id}) SET item.cacheHits=coalesce(item.cacheHits,0)+$hit,item.joinedRequests=coalesce(item.joinedRequests,0)+$joined',{id:specification.id,hit:found.state==='succeeded'?1:0,joined:found.state==='succeeded'?0:1});return found;}}
  const job={id:randomUUID(),calculationId:specification.id,stage:specification.specification.stage,scope:specification.specification.scope,inputArtifact,userId,state:'queued',forced:force,createdAt:Date.now(),attempt:0,lease:0,availableAt:Date.now(),resource:['analysis','retrieval-result'].includes(specification.specification.stage)?'coordinator':specification.specification.stage==='retrieval'||specification.specification.stage==='reference-metadata'?'retrieval':['keywords','description'].includes(specification.specification.stage)?'model':'cpu'};
  await transaction.run('MATCH (calculation:BMCalculation {id:$calculationId}),(input:BMArtifact {id:$inputId}) CREATE (item:BMJob) SET item=$job CREATE (calculation)-[:HAS_RUN]->(item) CREATE (item)-[:INPUT]->(input)',{calculationId:specification.id,inputId:inputArtifact,job});return job;
 }
 async child(parent,specification,inputArtifact,force=false){
  return this.tx(true,async transaction=>{const current=await this.fenced(transaction,parent);const job=await this.ensureJob(transaction,specification,inputArtifact,current.userId,force);await transaction.run('MATCH (parent:BMJob {id:$parentId}),(child:BMJob {id:$id}) MERGE (parent)-[:NEEDS]->(child)',{parentId:parent.id,id:job.id});return job;});
 }
 async job(id){return this.tx(false,async transaction=>properties(await transaction.run('MATCH (item:BMJob {id:$id}) RETURN item',{id})));}
 async subscription(userId,id){
  return this.tx(false,async transaction=>{
   const result=await transaction.run('MATCH (item:BMSubscription {id:$id,userId:$userId})-[:SUBSCRIBES]->(job:BMJob) RETURN item,job',{id,userId});if(!result.records.length)throw error('Job not found.',404);
   const subscription=result.records[0].get('item').properties;await this.gate(userId,subscription.projectId,'viewer',transaction);
   const job=result.records[0].get('job').properties;return {subscription,job};
  });
 }
 async cancel(userId,id){await this.tx(true,async transaction=>{const item=properties(await transaction.run('MATCH (item:BMSubscription {id:$id,userId:$userId}) RETURN item',{id,userId}));if(!item)throw error('Job not found.',404);await this.gate(userId,item.projectId,'viewer',transaction);await transaction.run('MATCH (item:BMSubscription {id:$id}) SET item.cancelled=true',{id});});}
 async hasDemand(transaction,jobId){
  const result=await transaction.run('MATCH (subscription:BMSubscription {cancelled:false})-[:SUBSCRIBES]->(:BMJob)-[:NEEDS*0..]->(job:BMJob {id:$jobId}) MATCH (:BMUser {id:subscription.userId,enabled:true})-[:HAS_MEMBERSHIP]->(:BMMembership {projectId:subscription.projectId})-[:IN_PROJECT]->(project:BMProject) WHERE project.deleted_at IS NULL RETURN count(subscription)>0 AS needed',{jobId});return result.records[0].get('needed');
 }
 async claim(workerId,limits,now=Date.now()){
  return this.tx(true,async transaction=>{
   await this.lock(transaction,'scheduler');
   if(!await this.available(transaction,false))return null;
   const running=rows(await transaction.run('MATCH (item:BMJob {state:"running"}) RETURN item'));
   for(const item of running){if(item.leaseUntil<=now){await this.lock(transaction,'job:'+item.id);await transaction.run('MATCH (item:BMJob {id:$id,state:"running"}) WHERE item.leaseUntil<=$now SET item.state=$state,item.availableAt=$now REMOVE item.workerId,item.slotId',{id:item.id,state:item.attempt>=3?'failed':'queued',now});}}
   const active=rows(await transaction.run('MATCH (item:BMJob {state:"running"}) WHERE item.leaseUntil>$now RETURN item',{now})),candidates=rows(await transaction.run('MATCH (item:BMJob {state:"queued"}) WHERE item.availableAt<=$now RETURN item ORDER BY item.createdAt,item.id',{now}));
   for(const candidate of candidates)if(!await this.hasDemand(transaction,candidate.id))await transaction.run('MATCH (item:BMJob {id:$id}) SET item.state="cancelled",item.completedAt=$now',{id:candidate.id,now});
   const scheduler=properties(await transaction.run('MERGE (item:BMScheduler {id:"default"}) RETURN item'));
   candidates.sort((left,right)=>Number(left.userId===scheduler.lastUserId)-Number(right.userId===scheduler.lastUserId)||left.createdAt-right.createdAt);
   for(const candidate of candidates){
    if(active.filter(item=>item.resource===candidate.resource).length>=(limits[candidate.resource]??1)||candidate.resource==='cpu'&&active.some(item=>item.resource==='cpu'&&item.userId===candidate.userId)||!await this.hasDemand(transaction,candidate.id))continue;
    const lease=candidate.lease+1;await transaction.run('MATCH (item:BMJob {id:$id}) SET item.state="running",item.workerId=$workerId,item.lease=$lease,item.leaseUntil=$until,item.attempt=item.attempt+1,item.startedAt=$now WITH item MATCH (scheduler:BMScheduler {id:"default"}) SET scheduler.lastUserId=$userId',{id:candidate.id,workerId,lease,until:now+60000,now,userId:candidate.userId});return {...candidate,state:'running',workerId,lease,leaseUntil:now+60000,startedAt:now,attempt:candidate.attempt+1};
   }
   return null;
  });
 }
 async fenced(transaction,job){
  await this.lock(transaction,'job:'+job.id);
  const current=properties(await transaction.run('MATCH (item:BMJob {id:$id,state:"running",workerId:$workerId,lease:$lease}) WHERE item.leaseUntil>$now RETURN item',{id:job.id,workerId:job.workerId,lease:job.lease,now:Date.now()}));if(!current)throw error('Worker lease expired.',409);return current;
 }
 async heartbeat(job,message){return this.tx(true,async transaction=>{await this.fenced(transaction,job);const needed=await this.hasDemand(transaction,job.id);await transaction.run('MATCH (item:BMJob {id:$id}) SET item.leaseUntil=$until,item.message=$message',{id:job.id,until:Date.now()+60000,message:String(message||'Running').slice(0,300)});return needed;});}
 async checkpoint(job,value){await this.tx(true,async transaction=>{await this.fenced(transaction,job);await transaction.run('MATCH (item:BMJob {id:$id}) SET item.checkpoint=$value',{id:job.id,value:JSON.stringify(value)});});}
 async publish(job,artifact,payload,authorize){
  return this.tx(true,async transaction=>{
   await this.fenced(transaction,job);if(!await this.hasDemand(transaction,job.id))throw error('No active subscribers remain.',409);
   if(authorize)await authorize(transaction);
   const analysisKey=payload?.graph?digest([payload.evidenceChecksum||null,payload.algorithmVersion||null,payload.textVersion||null,payload.settings||{},payload.graph.semantic||null,payload.graph.collaboration||null,payload.graph.nodes.map(node=>[node.id,node.cluster]),payload.graph.links.map(edge=>[edge.source,edge.target,edge.strength??null])]):null;
   const artifactId=await this.registerArtifact(transaction,{...artifact,scope:job.scope,kind:job.stage,...(payload?.operation==='research-method'?{summary:JSON.stringify({operation:'research-method',method:payload.exchange.summary.operation,backend:'independent-bnr-methods',nodes:payload.exchange.summary.nodes,parentResultId:payload.parentResultId})}:{}),...(analysisKey?{analysisKey,summary:JSON.stringify({method:payload.settings?.method,algorithm:payload.graph.clustering?.algorithm||'chronology',operation:payload.operation||null,resolution:payload.graph.resolution,threshold:payload.settings?.threshold,nodes:payload.graph.nodes.length,clusters:payload.graph.stats?.clusters,evidenceDate:payload.evidenceDate})}:{})});
   if(Array.isArray(payload?.works)&&payload.complete)await this.projectEvidence(transaction,artifactId,payload);
   const graph=payload?.graph;
   if(graph){
    await this.lock(transaction,'artifact:'+artifactId);
    const projected=(await transaction.run('MATCH (item:BMArtifact {id:$id}) RETURN item.projected AS projected',{id:artifactId})).records[0].get('projected');
    if(!projected){
     const native=nativeNetwork(graph),projection=graphRows('analyses',{id:artifactId,network:native});
     for(let offset=0;offset<projection.networkNodes.length;offset+=1000)await transaction.run('MATCH (artifact:BMArtifact {id:$id}) UNWIND $nodes AS node CREATE (item:BMArtifactNode {id:node.id,artifactId:$id,workId:node.work_id,entityKey:node.entity_key,entityKind:node.entity_kind,payload:node.payload}) CREATE (artifact)-[:HAS_NODE]->(item)',{id:artifactId,nodes:projection.networkNodes.slice(offset,offset+1000)});
     for(let offset=0;offset<projection.networkEdges.length;offset+=2000)await transaction.run(`UNWIND $edges AS edge MATCH (source:BMArtifactNode {id:edge.source}),(target:BMArtifactNode {id:edge.target}) CREATE (source)-[:${projection.networkType} {artifactId:$id,payload:edge.payload}]->(target)`,{id:artifactId,edges:projection.networkEdges.slice(offset,offset+2000)});
     const bundles=(graph.bundles||[]).map(bundle=>({id:digest([artifactId,bundle.id]),payload:JSON.stringify(bundle),members:bundle.members.map(member=>JSON.stringify([artifactId,member]))}));
     for(let offset=0;offset<bundles.length;offset+=500)await transaction.run('MATCH (artifact:BMArtifact {id:$id}) UNWIND $bundles AS bundle CREATE (item:BMArtifactBundle {id:bundle.id,artifactId:$id,payload:bundle.payload}) CREATE (artifact)-[:HAS_BUNDLE]->(item) WITH item,bundle UNWIND bundle.members AS memberId MATCH (node:BMArtifactNode {id:memberId}) CREATE (item)-[:HAS_MEMBER]->(node)',{id:artifactId,bundles:bundles.slice(offset,offset+500)});
     const groups=(graph.hyperedges||[]).map((group,position)=>({id:digest([artifactId,'hyperedge',position]),payload:JSON.stringify(group),members:group.members.map(member=>JSON.stringify([artifactId,member]))}));
     for(let offset=0;offset<groups.length;offset+=500)await transaction.run('MATCH (artifact:BMArtifact {id:$id}) UNWIND $groups AS group CREATE (item:BMArtifactHyperedge {id:group.id,artifactId:$id,payload:group.payload}) CREATE (artifact)-[:HAS_HYPEREDGE]->(item) WITH item,group UNWIND group.members AS memberId MATCH (node:BMArtifactNode {id:memberId}) CREATE (item)-[:HAS_MEMBER]->(node)',{id:artifactId,groups:groups.slice(offset,offset+500)});
     await transaction.run('MATCH (item:BMArtifact {id:$id}) SET item.projected=true',{id:artifactId});
    }
   }
   await transaction.run('MATCH (job:BMJob {id:$id}),(artifact:BMArtifact {id:$artifactId}) SET job.state="succeeded",job.artifactId=$artifactId,job.completedAt=$now,job.message="Completed" MERGE (job)-[:PRODUCED]->(artifact)',{id:job.id,artifactId,now:Date.now()});
   await transaction.run('MATCH (job:BMJob {id:$id})-[:NEEDS]->(child:BMJob)-[:PRODUCED]->(dependency:BMArtifact),(artifact:BMArtifact {id:$artifactId}) MERGE (artifact)-[:DEPENDS_ON]->(dependency)',{id:job.id,artifactId});
   await transaction.run('MATCH (job:BMJob {id:$id})-[:INPUT]->(input:BMArtifact),(artifact:BMArtifact {id:$artifactId}) MERGE (artifact)-[:COMPUTED_FROM]->(input)',{id:job.id,artifactId});
   for(const dependencyId of [payload?.evidenceArtifactId,payload?.parentArtifactId].filter(Boolean))await transaction.run('MATCH (artifact:BMArtifact {id:$id}),(dependency:BMArtifact {id:$dependencyId}) MERGE (artifact)-[:DEPENDS_ON]->(dependency)',{id:artifactId,dependencyId});return artifactId;
  });
 }
 async fail(job,problem){await this.tx(true,async transaction=>{await this.fenced(transaction,job);const needed=await this.hasDemand(transaction,job.id),retry=needed&&problem.transient&&job.attempt<3,state=!needed?'cancelled':retry?'queued':'failed';await transaction.run('MATCH (item:BMJob {id:$id}) SET item.state=$state,item.availableAt=$availableAt,item.error=$message,item.completedAt=$now',{id:job.id,state,availableAt:Date.now()+Math.max(job.attempt*30000,(problem.retryAfter||0)*1000),message:problem.status?problem.message:'Computation did not complete. Retry or inspect server diagnostics.',now:Date.now()});});}
 async available(transaction,fail=true){const item=properties(await transaction.run('MATCH (item:BMScheduler {id:"maintenance"}) RETURN item'));if(item?.enabled&&fail)throw error('Storage maintenance is in progress. Retry shortly.',503);return !item?.enabled;}
 async maintenance(){return this.tx(false,transaction=>this.available(transaction,false));}
 async attachResult(userId,projectId,jobId){
  return this.tx(true,async transaction=>{
   await this.lock(transaction,'project:'+projectId);await this.gate(userId,projectId,'viewer',transaction);
   const allowed=(await transaction.run('MATCH (:BMSubscription {userId:$userId,projectId:$projectId,cancelled:false})-[:SUBSCRIBES]->(job:BMJob {id:$jobId,state:"succeeded"}) RETURN job',{userId,projectId,jobId})).records.length;if(!allowed)throw error('Result not found.',404);
   const id=digest([projectId,jobId]);await transaction.run('MATCH (project:BMProject {id:$projectId}),(job:BMJob {id:$jobId}) MERGE (item:BMResult {id:$id}) ON CREATE SET item.projectId=$projectId,item.jobId=$jobId,item.createdAt=$now MERGE (project)-[:HAS_RESULT]->(item) MERGE (item)-[:USES_RUN]->(job)',{id,projectId,jobId,now:Date.now()});return id;
  });
 }
 async resultIn(transaction,userId,projectId,id){await this.gate(userId,projectId,'viewer',transaction);const item=properties(await transaction.run('MATCH (:BMProject {id:$projectId})-[:HAS_RESULT]->(item:BMResult {id:$id})-[:USES_RUN]->(job:BMJob {state:"succeeded"}) RETURN item,job',{projectId,id}));if(!item)throw error('Result not found.',404);const job=properties(await transaction.run('MATCH (item:BMJob {id:$id}) RETURN item',{id:item.jobId}));return {...item,job,artifact:await this.artifactIn(transaction,job.artifactId)};}
 async result(userId,projectId,id){return this.tx(false,transaction=>this.resultIn(transaction,userId,projectId,id));}
 async validateAttachments(transaction,userId,projectId,base,ids){if(!Array.isArray(ids)||ids.length>200)throw error('Invalid analysis attachments.');for(const id of ids){const attachment=await this.resultIn(transaction,userId,projectId,id);if(!base.artifact.analysisKey||attachment.artifact.analysisKey!==base.artifact.analysisKey)throw error('Attachments do not match this analysis.',409);}}
 async history(userId,projectId){
  return this.tx(false,async transaction=>{
   await this.gate(userId,projectId,'viewer',transaction);
   const evidence=rows(await transaction.run('MATCH (:BMProject {id:$projectId})-[:HAS_EVIDENCE]->(item) RETURN item ORDER BY item.createdAt DESC',{projectId}));
   const results=(await transaction.run('MATCH (:BMProject {id:$projectId})-[:HAS_RESULT]->(item)-[:USES_RUN]->(job:BMJob {state:"succeeded"})-[:PRODUCED]->(artifact:BMArtifact) RETURN item,job,artifact.summary AS summary ORDER BY item.createdAt DESC',{projectId})).records.map(record=>{
    const item=record.get('item').properties,job=record.get('job').properties;return {id:item.id,createdAt:item.createdAt,computedAt:job.completedAt,stage:job.stage,...JSON.parse(record.get('summary')||'{}')};
   });
   const findings=await this.legacy.listIn(transaction,'analyses',projectId),subscriptions=rows(await transaction.run('MATCH (item:BMSubscription {userId:$userId,projectId:$projectId,cancelled:false})-[:SUBSCRIBES]->(job:BMJob) WHERE job.state IN ["running","queued"] RETURN item',{userId,projectId}));
   return {evidence:evidence.map(item=>({id:item.id,...JSON.parse(item.details),createdAt:item.createdAt})),results,findings:findings.map(item=>({id:item.id,name:item.name,created_at:item.created_at,legacy:!item.view_state.resultId})),jobs:subscriptions.map(item=>({id:item.id}))};
  });
 }
 async saveFinding(userId,projectId,input){
  return this.tx(true,async transaction=>{
   await this.lock(transaction,'project:'+projectId);await this.gate(userId,projectId,'editor',transaction);
   const result=await this.resultIn(transaction,userId,projectId,input.resultId);await this.validateAttachments(transaction,userId,projectId,result,input.attachmentIds||[]);
   const now=new Date().toISOString(),record={id:randomUUID(),project_id:projectId,corpus_id:null,name:String(input.name||'Research map').slice(0,200),query:{},search_snapshot:{},corpus:[],ref_coverage:{},parameters:{workspaceVersion:2},network:{},cited_works:{},view_state:{resultId:result.id,attachmentIds:input.attachmentIds||[],display:input.display||{},findings:String(input.findings||'').slice(0,30000)},created_at:now,updated_at:now};
   await this.legacy.writeIn(transaction,'analyses',record,graphRows('analyses',record));await transaction.run('MATCH (finding:BMAnalysis {id:$id}),(result:BMResult {id:$resultId}) SET finding.workspace_version=2 CREATE (finding)-[:PINNED_RESULT]->(result)',{id:record.id,resultId:result.id});return {id:record.id,name:record.name};
  });
 }
 async deleteProject(userId,projectId){await this.tx(true,async transaction=>{
  await this.lock(transaction,'project:'+projectId);await this.gate(userId,projectId,'owner',transaction);
  const ids=(await transaction.run('MATCH (item:BMRecord {project_id:$id}) RETURN item.id AS id',{id:projectId})).records.map(record=>record.get('id'));
  await transaction.run('MATCH ()-[relation:CITES]->() WHERE relation.record_id IN $ids DELETE relation',{ids});
  for(const [label,field] of [['BMObservation','record_id'],['BMNetworkNode','analysis_id'],['BMCoCitationBundle','analysis_id']])await transaction.run(`MATCH (item:${label}) WHERE item.${field} IN $ids DETACH DELETE item`,{ids});
  await transaction.run('MATCH (item:BMRecord) WHERE item.id IN $ids DETACH DELETE item',{ids});
  await transaction.run('MATCH (item:BMProject {id:$id}) SET item.deleted_at=$now,item.name="Deleted project",item.payload=$payload',{id:projectId,now:Date.now(),payload:JSON.stringify({id:projectId,name:'Deleted project'})});await transaction.run('MATCH (item:BMSubscription {projectId:$id}) SET item.cancelled=true',{id:projectId});await transaction.run('MATCH (item) WHERE (item:BMMembership OR item:BMWorkspace OR item:BMEvidenceRef OR item:BMResult OR item:BMScreeningVersion) AND item.projectId=$id DETACH DELETE item',{id:projectId});await transaction.run('MATCH (item:BMInvitation {projectId:$id}) DELETE item',{id:projectId});
 });}
}

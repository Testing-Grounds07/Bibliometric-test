import {randomUUID} from 'node:crypto';
import {digest,token,calculation,error} from './core.mjs';
import {AUDIENCE} from './research-contracts.mjs';
const one=result=>result.records[0]?.get('item')?.properties;
export class ResearchStore{
 constructor(store){this.store=store;}
 async init(){for(const label of ['BMResearchGrant','BMResearchRequest'])await this.store.driver.executeQuery(`CREATE CONSTRAINT ${label.toLowerCase()}_id IF NOT EXISTS FOR (item:${label}) REQUIRE item.id IS UNIQUE`,{},{database:this.store.database});}
 async authorize(binding,projectId,compute=false,tx){
  const check=async t=>{
   if(binding.projectId!==projectId)throw error('Delegation project does not match.',403);
   const session=one(await t.run('MATCH (item:BMSession {id:$id,userId:$userId}) WHERE item.expiresAt>$now RETURN item',{id:binding.sessionId,userId:binding.userId,now:Date.now()}));
   const user=await this.store.userIn(t,binding.userId);
   if(!session||!user||user.issuer!==binding.issuer)throw error('Delegating institutional session expired or revoked.',401);
   if(binding.grantId){const grant=one(await t.run('MATCH (item:BMResearchGrant {id:$id}) WHERE item.revokedAt IS NULL AND item.expiresAt>$now RETURN item',{id:binding.grantId,now:Date.now()}));if(!grant||grant.userId!==binding.userId||grant.sessionId!==binding.sessionId||grant.projectId!==projectId||grant.audience!==AUDIENCE||grant.issuer!==binding.issuer||!grant.scopes.includes(compute?'compute':'read'))throw error('Delegation expired, revoked or insufficient.',403);}
   await this.store.gate(binding.userId,projectId,compute?'editor':'viewer',t);return binding;
  };return tx?check(tx):this.store.tx(false,check);
 }
 async issue(session,projectId,input){
  if(!input||Object.keys(input).some(k=>!['scopes','expiresInSeconds'].includes(k))||!Array.isArray(input.scopes)||!input.scopes.includes('read')||input.scopes.some(v=>!['read','compute'].includes(v))||new Set(input.scopes).size!==input.scopes.length)throw error('Explicit read and optional compute scopes required.');
  const seconds=input.expiresInSeconds??900;if(!Number.isInteger(seconds)||seconds<30||seconds>3600)throw error('Delegation lifetime must be 30–3600 seconds.');
  const secret=token(),binding={userId:session.user.id,issuer:session.user.issuer,sessionId:session.session.id,projectId};
  const grant={id:digest(secret),...binding,audience:AUDIENCE,scopes:input.scopes,expiresAt:Math.min(Number(session.session.expiresAt),Date.now()+seconds*1000)};
  await this.store.tx(true,async tx=>{await this.authorize(binding,projectId,input.scopes.includes('compute'),tx);await tx.run('CREATE (item:BMResearchGrant) SET item=$grant',{grant});});
  return {token:secret,id:grant.id,audience:AUDIENCE,projectId,scopes:grant.scopes,expiresAt:grant.expiresAt,authentication:'Session-bound local delegation; not public OAuth'};
 }
 async bearer(secret,projectId,compute){if(!/^[a-zA-Z0-9_-]{40,100}$/.test(secret||''))throw error('Research delegation required.',401);const grant=await this.store.tx(false,async tx=>one(await tx.run('MATCH (item:BMResearchGrant {id:$id}) RETURN item',{id:digest(secret)})));if(!grant)throw error('Research delegation required.',401);return this.authorize({userId:grant.userId,issuer:grant.issuer,sessionId:grant.sessionId,projectId:grant.projectId,grantId:grant.id},projectId,compute);}
 async revoke(binding,id){await this.store.tx(true,async tx=>{await this.authorize(binding,binding.projectId,false,tx);await tx.run('MATCH (item:BMResearchGrant {id:$id,userId:$userId,projectId:$projectId}) SET item.revokedAt=$now',{id,userId:binding.userId,projectId:binding.projectId,now:Date.now()});});}
 async submit(binding,key,input,artifact){return this.store.tx(true,async tx=>{
  const projectId=binding.projectId;await this.store.lock(tx,'project:'+projectId);await this.authorize(binding,projectId,true,tx);
  const id=digest([binding.userId,projectId,key]),requestHash=digest(input);await this.store.lock(tx,'research-request:'+id);
  const prior=one(await tx.run('MATCH (item:BMResearchRequest {id:$id}) RETURN item',{id}));
  if(prior){if(prior.requestHash!==requestHash)throw error('Idempotency key already binds a different request.',409);return {id:prior.subscriptionId,reused:true};}
  const specification=calculation('research-engine','project:'+projectId,digest(input),{},[],'research-bridge-1');
  const job=await this.store.ensureJob(tx,specification,artifact.id,binding.userId),subscription={id:randomUUID(),userId:binding.userId,projectId,jobId:job.id,cancelled:false,createdAt:Date.now()};
  await tx.run('MATCH (job:BMJob {id:$jobId}) CREATE (item:BMSubscription) SET item=$subscription CREATE (item)-[:SUBSCRIBES]->(job)',{jobId:job.id,subscription});
  await tx.run('CREATE (item:BMResearchRequest {id:$id,requestHash:$requestHash,subscriptionId:$subscriptionId,executionId:$executionId,jobId:$jobId})',{id,requestHash,subscriptionId:subscription.id,executionId:input.execution_id,jobId:job.id});
  return {id:subscription.id,status:job.state};
 });}
}

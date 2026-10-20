import {identity} from './core.mjs';

export async function ensureFixtureViewer(store,issuer,owner,project){
 if(!/^https:\/\/test-institution\.invalid\/[0-9a-f-]{36}$/.test(issuer)||owner?.id!==identity(issuer,'one')||owner.issuer!==issuer||!owner.enabled||owner.admin||!/^[0-9a-f-]{36}$/.test(project?.id||''))throw Error('A viewer may be seeded only into the validated synthetic fixture.');
 const id=identity(issuer,'viewer'),email='viewer@test.invalid';let viewer=await store.user(id);
 if(viewer&&(viewer.issuer!==issuer||viewer.subject!=='viewer'||viewer.email!==email||!viewer.enabled||viewer.admin))throw Error('The existing synthetic viewer identity is invalid.');
 if(viewer){let role;try{role=await store.gate(id,project.id);}catch(problem){if(problem.status!==403)throw problem;}if(role){if(role!=='viewer')throw Error('The synthetic viewer must retain only the viewer role.');return viewer;}}
 const invitation=await store.invite(owner.id,project.id,email,'viewer',issuer);viewer=await store.acceptIdentity({iss:issuer,sub:'viewer',email,email_verified:true,name:'Synthetic read-only viewer'},invitation);if(await store.gate(viewer.id,project.id)!=='viewer')throw Error('Synthetic viewer membership was not created.');return viewer;
}

export function validateFixtureReuse(records) {
 if (!Array.isArray(records) || records.length !== 2) throw new Error('Exactly two existing synthetic fixture projects are required.');
 let issuer;
 const users = {}, projects = {};
 for (const [position, record] of records.entries()) {
  const name = ['one','two'][position], owner = record.owners?.[0], project = record.project;
  if (!project || !/^[0-9a-f-]{36}$/.test(project.id || '') || project.deleted_at || record.owners?.length !== 1 || !owner?.enabled || owner.admin || owner.subject !== name || owner.email !== name + '@test.invalid' || !/^https:\/\/test-institution\.invalid\/[0-9a-f-]{36}$/.test(owner.issuer || '') || owner.id !== identity(owner.issuer, name)) throw new Error('Only uniquely owned enabled synthetic fixture accounts may be reused.');
  if (issuer && issuer !== owner.issuer) throw new Error('Reused fixture accounts must share the same synthetic issuer.');
  issuer = owner.issuer; users[name] = owner; projects[name] = {...JSON.parse(project.payload), id: project.id};
 }
 if (projects.one.id === projects.two.id) throw new Error('Fixture projects must remain separate.');
 return {issuer, users, projects};
}

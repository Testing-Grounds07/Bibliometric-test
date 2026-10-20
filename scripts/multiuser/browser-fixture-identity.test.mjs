import test from 'node:test';
import assert from 'node:assert/strict';
import {identity} from './core.mjs';
import {validateFixtureReuse,ensureFixtureViewer} from './browser-fixture-identity.mjs';

const issuer='https://test-institution.invalid/11111111-1111-4111-8111-111111111111';
const fixture=()=>['one','two'].map((name,position)=>({project:{id:position?'22222222-2222-4222-8222-222222222222':'11111111-1111-4111-8111-111111111111',payload:JSON.stringify({name:'Research '+name})},owners:[{id:identity(issuer,name),issuer,subject:name,email:name+'@test.invalid',enabled:true,admin:false}]}));
test('fixture reuse retains original synthetic issuer, projects and accounts',()=>{const reused=validateFixtureReuse(fixture());assert.equal(reused.issuer,issuer);assert.equal(reused.users.one.id,identity(issuer,'one'));assert.notEqual(reused.projects.one.id,reused.projects.two.id);});
test('fixture reuse fails closed for ordinary accounts, ambiguous owners and different issuers',()=>{
 for(const change of [records=>{records[0].owners.push(records[0].owners[0]);},records=>{records[0].owners[0].issuer='https://institution.example';},records=>{records[1].owners[0].enabled=false;},records=>{records[1].owners[0].admin=true;},records=>{records[1].owners[0].issuer=issuer.replace('11111111','22222222');records[1].owners[0].id=identity(records[1].owners[0].issuer,'two');}]){const records=fixture();change(records);assert.throws(()=>validateFixtureReuse(records),/synthetic|share/);}
});

test('synthetic viewer seeding is invitation-bound, read-only and idempotent without replacing owners/findings',async()=>{
 const context=validateFixtureReuse(fixture()),viewer={id:identity(issuer,'viewer'),issuer,subject:'viewer',email:'viewer@test.invalid',enabled:true,admin:false};let existing=null,role,invites=0,accepted=0;
 const store={user:async()=>existing,gate:async()=>{if(!role)throw Object.assign(Error('no membership'),{status:403});return role;},invite:async(ownerId,projectId,email,requestedRole,requestedIssuer)=>{assert.equal(ownerId,context.users.one.id);assert.equal(projectId,context.projects.one.id);assert.equal(email,viewer.email);assert.equal(requestedRole,'viewer');assert.equal(requestedIssuer,issuer);invites++;return 'synthetic-invitation';},acceptIdentity:async(claims,invitation)=>{assert.equal(claims.email_verified,true);assert.equal(claims.sub,'viewer');assert.equal(invitation,'synthetic-invitation');accepted++;role='viewer';return existing=viewer;}};
 assert.equal(await ensureFixtureViewer(store,issuer,context.users.one,context.projects.one),viewer);assert.equal(await ensureFixtureViewer(store,issuer,context.users.one,context.projects.one),viewer);assert.equal(invites,1);assert.equal(accepted,1);role='editor';await assert.rejects(ensureFixtureViewer(store,issuer,context.users.one,context.projects.one),/only the viewer/);await assert.rejects(ensureFixtureViewer(store,'https://ordinary.example',context.users.one,context.projects.one),/synthetic/);assert.equal(invites,1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import * as oidc from 'openid-client';
import {Authentication} from './auth.mjs';

test('OIDC code flow verifies PKCE, signed identity, nonce, one-use login state and CSRF',async()=>{
 const issuer='https://institution.example.test',origin='https://bibliomap.example.test',flows=new Map(),sessions=new Map(),keys=generateKeyPairSync('rsa',{modulusLength:2048}),jwk={...keys.publicKey.export({format:'jwk'}),kid:'test-key',use:'sig',alg:'RS256'};
 let authorization,wrongNonce=false;
 const store={loginState:async(id,payload)=>flows.set(id,payload),takeLogin:async id=>{const state=flows.get(id);flows.delete(id);return state;},acceptIdentity:async claims=>{assert.equal(claims.sub,'institutional-subject');assert.equal(claims.email_verified,true);return {id:'user',issuer};},newSession:async()=>{const session={secret:'test-session',csrf:'test-csrf'};sessions.set(session.secret,{user:{id:'user',issuer},session});return session;},session:async secret=>sessions.get(secret),logout:async secret=>sessions.delete(secret)};
 const config={configured:true,origin,issuer,clientId:'registered',clientSecret:'secret',secure:true},auth=new Authentication(store,config),client=new oidc.Configuration({issuer,authorization_endpoint:issuer+'/authorize',token_endpoint:issuer+'/token',jwks_uri:issuer+'/jwks',id_token_signing_alg_values_supported:['RS256']},'registered','secret');
 oidc.enableNonRepudiationChecks(client);
 client[oidc.customFetch]=async(target,options)=>{
  if(String(target).endsWith('/jwks'))return Response.json({keys:[jwk]});
  assert(String(target).endsWith('/token'));const parameters=new URLSearchParams(options.body.toString());assert.equal(createHash('sha256').update(parameters.get('code_verifier')).digest('base64url'),authorization.searchParams.get('code_challenge'));
  const header=Buffer.from(JSON.stringify({alg:'RS256',kid:'test-key'})).toString('base64url'),payload=Buffer.from(JSON.stringify({iss:issuer,sub:'institutional-subject',aud:'registered',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+300,nonce:wrongNonce?'wrong':authorization.searchParams.get('nonce'),email:'invited@example.test',email_verified:true})).toString('base64url'),signature=sign('RSA-SHA256',Buffer.from(header+'.'+payload),keys.privateKey).toString('base64url');
  return Response.json({access_token:'upstream-token',token_type:'Bearer',id_token:header+'.'+payload+'.'+signature});
 };auth.connection=client;
 const response=()=>({status:null,headers:null,writeHead(status,headers){this.status=status;this.headers=headers;},end(){}});
 async function login(){const output=response();await auth.handle({method:'GET',url:'/auth/login',headers:{}},output,new URL(origin+'/auth/login'));authorization=new URL(output.headers.Location);assert.equal(authorization.searchParams.get('code_challenge_method'),'S256');const cookie=output.headers['Set-Cookie'].split(';')[0];assert(output.headers['Set-Cookie'].includes('HttpOnly'));assert(output.headers['Set-Cookie'].includes('Secure'));return cookie;}
 const cookie=await login(),callback='/auth/callback?code=provider-code&state='+authorization.searchParams.get('state'),output=response();await auth.handle({method:'GET',url:callback,headers:{cookie}},output,new URL(origin+callback));assert.equal(output.status,302);assert.equal(output.headers.Location,'/conservative-atlas/projects');
 await assert.rejects(auth.handle({method:'GET',url:callback,headers:{cookie}},response(),new URL(origin+callback)),/expired/);
 await assert.rejects(auth.authenticate({headers:{cookie:'bm_session=test-session',origin,'x-csrf-token':'wrong'}},true),problem=>problem.status===403);assert.equal((await auth.authenticate({headers:{cookie:'bm_session=test-session',origin,'x-csrf-token':'test-csrf'}},true)).user.id,'user');
 const second=await login();wrongNonce=true;const invalid='/auth/callback?code=invalid&state='+authorization.searchParams.get('state');await assert.rejects(auth.handle({method:'GET',url:invalid,headers:{cookie:second}},response(),new URL(origin+invalid)));
});

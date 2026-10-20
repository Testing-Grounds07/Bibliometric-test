import * as oidc from 'openid-client';
import {token, equalSecret, error} from './core.mjs';

export function configuration(environment = process.env) {
 const base = new URL(environment.BIBLIOMAP_PUBLIC_URL || 'https://configuration.invalid');
 if (base.pathname !== '/' || base.search || base.hash || base.username || base.password || base.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(base.hostname)) throw error('Configure BIBLIOMAP_PUBLIC_URL as the exact HTTPS origin.',503);
 const configured = !!(environment.BIBLIOMAP_PUBLIC_URL && environment.OIDC_ISSUER && environment.OIDC_CLIENT_ID && environment.OIDC_CLIENT_SECRET && environment.BIBLIOMAP_SERVICE_TOKEN?.length >= 32);
 return {origin:base.origin,issuer:environment.OIDC_ISSUER,clientId:environment.OIDC_CLIENT_ID,clientSecret:environment.OIDC_CLIENT_SECRET,serviceToken:environment.BIBLIOMAP_SERVICE_TOKEN,configured,secure:base.protocol==='https:'};
}
export function cookies(request) {
 return Object.fromEntries((request.headers.cookie||'').split(';').flatMap(part=>{const position=part.indexOf('=');return position>0?[[part.slice(0,position).trim(),part.slice(position+1).trim()]]:[];}));
}
const send = (response,status,value) => {response.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});response.end(JSON.stringify(value));};
export class Authentication {
 constructor(store,config) {this.store=store;this.config=config;}
 cookie(name,value,maxAge){return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${this.config.secure?'; Secure':''}`;}
 async client(){if(!this.config.configured)throw error('Institutional sign-in is not configured. Ask the administrator to configure the provider and callback URL.',503);if(!this.connection){const client=await oidc.discovery(new URL(this.config.issuer),this.config.clientId,this.config.clientSecret);oidc.enableNonRepudiationChecks(client);this.connection=client;}return this.connection;}
 async authenticate(request,write=false){
  if(!this.config.configured)throw error('Institutional sign-in is not configured. Access is closed.',503);
  const session=await this.store.session(cookies(request).bm_session);if(!session)throw error('Sign in required.',401);
  if(session.user.issuer!==this.config.issuer)throw error('Sign in with the configured institution.',401);
  if(write&&(request.headers.origin!==this.config.origin||!equalSecret(request.headers['x-csrf-token'],session.session.csrf)))throw error('Request could not be verified. Reload and try again.',403);
  return session;
 }
 async handle(request,response,url){
  if(!url.pathname.startsWith('/auth/'))return false;
  if(url.pathname==='/auth/login'&&request.method==='GET'){
   const client=await this.client(),state=token(),verifier=oidc.randomPKCECodeVerifier(),nonce=token(),flow=token();
   let returnTo=url.searchParams.get('return')||'/conservative-atlas/projects';if(!returnTo.startsWith('/conservative-atlas/')||returnTo.startsWith('//')||returnTo.includes('\\'))returnTo='/conservative-atlas/projects';
   const invitation=url.searchParams.get('invite');if(invitation&& !/^[A-Za-z0-9_-]{43}$/.test(invitation))throw error('Invalid invitation.');
   await this.store.loginState(flow,{state,verifier,nonce,invitation,returnTo});
   const target=oidc.buildAuthorizationUrl(client,{redirect_uri:this.config.origin+'/auth/callback',scope:'openid email profile',state,nonce,code_challenge:await oidc.calculatePKCECodeChallenge(verifier),code_challenge_method:'S256'});
   response.writeHead(302,{'Location':target.href,'Set-Cookie':this.cookie('bm_login',flow,600),'Cache-Control':'no-store'});response.end();return true;
  }
  if(url.pathname==='/auth/callback'&&request.method==='GET'){
   const flow=cookies(request).bm_login;if(!flow)throw error('Login expired. Start sign-in again.',401);
   const state=await this.store.takeLogin(flow);if(!state)throw error('Login expired. Start sign-in again.',401);
   const tokens=await oidc.authorizationCodeGrant(await this.client(),new URL(request.url,this.config.origin),{pkceCodeVerifier:state.verifier,expectedState:state.state,expectedNonce:state.nonce,idTokenExpected:true});
   const claims=tokens.claims();if(!claims?.sub||claims.iss!==this.config.issuer)throw error('Institutional identity could not be verified.',403);
   const user=await this.store.acceptIdentity(claims,state.invitation),session=await this.store.newSession(user.id);
   response.writeHead(302,{'Location':state.returnTo,'Set-Cookie':[this.cookie('bm_session',session.secret,43200),this.cookie('bm_login','',0)],'Cache-Control':'no-store'});response.end();return true;
  }
  if(url.pathname==='/auth/session'&&request.method==='GET'){
   const {user,session}=await this.authenticate(request);send(response,200,{user:{id:user.id,name:user.name,email:user.email,lastProjectId:user.lastProjectId,admin:user.admin},csrf:session.csrf});return true;
  }
  if(url.pathname==='/auth/logout'&&request.method==='POST'){
   await this.authenticate(request,true);await this.store.logout(cookies(request).bm_session);response.setHeader('Set-Cookie',this.cookie('bm_session','',0));send(response,200,{ok:true});return true;
  }
  send(response,404,{error:'Unknown authentication request.'});return true;
 }
}

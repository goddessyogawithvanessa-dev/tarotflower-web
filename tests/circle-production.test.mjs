import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { randomBytes, createHash } from 'node:crypto';
const require=createRequire(import.meta.url),runtime=createRequire(require.resolve('wrangler/package.json'))('miniflare');
const token=()=>randomBytes(32).toString('base64url'),hash=s=>createHash('sha256').update(s).digest('base64url');
let mf,db;
const deliveries=[];
before(async()=>{
 const opts={workers:[
  {name:'caller',modules:true,script:"export default {fetch(request,env){return env.IDENTITY.fetch(request)}}",
    serviceBindings:{IDENTITY:{name:'authority',entrypoint:'CircleIdentityService'}}},
  {name:'authority',modules:[{type:'ESModule',path:new URL('../worker/index.js',import.meta.url).pathname},{type:'ESModule',path:new URL('../worker/workbench/access.js',import.meta.url).pathname},{type:'ESModule',path:new URL('../worker/circle/identity.js',import.meta.url).pathname}, {type:'ESModule',path:new URL('../worker/circle/passwords.js',import.meta.url).pathname}, {type:'ESModule',path:new URL('../worker/circle/consent.js',import.meta.url).pathname}],
    compatibilityFlags:['nodejs_compat'], compatibilityDate:'2026-07-18',d1Databases:['LIBRARY_DB'],r2Buckets:['LIBRARY_ASSETS'],
    serviceBindings:{EMAIL_SERVICE:async request=>{deliveries.push(await request.json());return Response.json({ok:true});}},
    bindings:{CIRCLE_TURNSTILE_SECRET_KEY:'test-secret',APP_ORIGIN:'https://tarotflower.com',CIRCLE_ORIGIN:'https://moonlightcircle.com',CIRCLE_DEV_MODE:'true',CIRCLE_LOCAL_BRIDGE_SECRET:token(),TOKEN_PEPPER:token(),CIRCLE_OWNER_EMAIL:'owner@example.test'},
    outboundService:async request=>{if(new URL(request.url).hostname==='challenges.cloudflare.com'){const form=await request.formData();return Response.json({success:form.get('response')==='valid-test-challenge',action:'circle_login',hostname:'moonlightcircle.com'});}throw new Error('No external requests in tests')}}]};
 mf=new runtime.Miniflare(runtime.convertV4MiniflareOptions?runtime.convertV4MiniflareOptions(opts):opts);
 db=await mf.getD1Database('LIBRARY_DB','authority');
 for(const file of ['../worker/schema.sql','../worker/circle/schema.sql'])for(const s of (await readFile(new URL(file,import.meta.url),'utf8')).replace(/^--.*$/gm,'').split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(s).run();
});
after(async()=>mf?.dispose());
async function api(action,data={}){const r=await mf.dispatchFetch('https://caller.test/'+action,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});return{status:r.status,data:await r.json()};}
test('production configuration uses the named private service and rejects local auth bypass',async()=>{
 const tx=await api('start',{state:token(),challenge:token(),ip:'192.0.2.1'});
 assert.equal(tx.status,200);assert.match(tx.data.authorizeUrl,/^https:\/\/moonlightcircle.com\/login/);
 assert.equal((await api('dev-mailbox',{request:tx.data.request})).status,404);
 assert.equal((await api('password-link',{request:tx.data.request,email:'owner@example.test',turnstileToken:'local-circle-turnstile',ip:'192.0.2.1'})).status,400);
});
test('production authorization start is rate limited',async()=>{
 for(let i=0;i<120;i++)assert.equal((await api('start',{state:token(),challenge:token(),ip:'192.0.2.2'})).status,200);
 assert.equal((await api('start',{state:token(),challenge:token(),ip:'192.0.2.2'})).status,429);
});
test('expired codes are rejected and cleanup removes expired temporary records',async()=>{
 const state=token(),verifier=token(),tx=await api('start',{state,challenge:hash(verifier),ip:'192.0.2.3'}),code=token();
 await db.prepare('UPDATE circle_auth_requests SET code_hash=?,code_expires_at=? WHERE request_hash=?').bind(hash(code),1,hash(tx.data.request)).run();
 assert.equal((await api('exchange',{code,verifier,state})).status,400);
 await db.prepare('UPDATE circle_auth_requests SET expires_at=1 WHERE request_hash=?').bind(hash(tx.data.request)).run();
 await api('start',{state:token(),challenge:token(),ip:'192.0.2.4'});
 assert.equal(await db.prepare('SELECT request_hash FROM circle_auth_requests WHERE request_hash=?').bind(hash(tx.data.request)).first(),null);
});

test('production setup uses the private email service asynchronously and keeps unknown-email responses generic',async()=>{
 const requestLink=async(email)=>{const tx=await api('start',{state:token(),challenge:token(),ip:'192.0.2.5'});return api('password-link',{request:tx.data.request,email,purpose:'setup',turnstileToken:'valid-test-challenge',ip:'192.0.2.5'});};
 const unknown=await requestLink('unknown@example.test'),known=await requestLink('owner@example.test');
 assert.deepEqual(unknown,known);assert.equal(known.status,202);
 for(let attempt=0;attempt<20&&!deliveries.length;attempt++)await new Promise(resolve=>setTimeout(resolve,20));
 assert.equal(deliveries.length,1);assert.equal(deliveries[0].to,'owner@example.test');
 const link=new URL(deliveries[0].passwordLink);assert.equal(link.origin,'https://moonlightcircle.com');assert.equal(link.pathname,'/api/auth/password/open');
 assert.equal((await db.prepare('SELECT count(*) AS n FROM circle_sessions').first()).n,0);
 assert.equal((await db.prepare('SELECT count(*) AS n FROM identity_passwords').first()).n,0);
});

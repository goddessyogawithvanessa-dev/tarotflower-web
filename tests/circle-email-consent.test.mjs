import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { EMAIL_CONSENT_TEXT, EMAIL_CONSENT_VERSION, syncCircleEmailConsents } from '../worker/circle/consent.js';
const require = createRequire(import.meta.url);
const runtime = createRequire(require.resolve('wrangler/package.json'))('miniflare');
let mf, db, identityDb;
const sourcePath = file => new URL('../'+file,import.meta.url).pathname;
const payload = email => ({id:crypto.randomUUID(),userId:crypto.randomUUID(),email,firstName:'Circle Member',
  text:EMAIL_CONSENT_TEXT,version:EMAIL_CONSENT_VERSION,recordedAt:Date.now()-1000});
const request = data => ({
  method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
async function apply(database,file) {
  for (const sql of (await readFile(sourcePath(file),'utf8')).replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean))
    await database.prepare(sql).run();
}
before(async()=>{
  const options = {workers:[
    {name:'caller',modules:true,script:"export default {fetch(r,e){return e.EMAIL.fetch(r)}}",
      serviceBindings:{EMAIL:{name:'email',entrypoint:'LibraryEmailService'}},d1Databases:['LIBRARY_DB']},
    {name:'email',modulesRoot:sourcePath(''),modules:['worker/email-service/index.js','worker/email-service/library-purchase-email.js','worker/email-service/tarot-email-suite.js',
      'worker/email-service/circle-consent.js','worker/circle/consent.js'].map(file=>({type:'ESModule',path:sourcePath(file)})),
      compatibilityDate:'2026-07-18',d1Databases:['DB'],
      serviceBindings:{ASSETS:()=>new Response('Not found',{status:404})},
      outboundService:()=>{throw new Error('No email/network allowed in consent tests');}},
  ]};
  mf = new runtime.Miniflare(runtime.convertV4MiniflareOptions ? runtime.convertV4MiniflareOptions(options) : options);
  db = await mf.getD1Database('DB','email'); identityDb = await mf.getD1Database('LIBRARY_DB','caller');
  await apply(db,'tests/fixtures/email-production-schema.sql');
  await apply(db,'worker/email-service/migrations/0001_circle_email_consent.sql');
  await apply(identityDb,'worker/schema.sql'); await apply(identityDb,'worker/circle/schema.sql');
});
after(async()=>mf?.dispose());
async function send(data) { return mf.dispatchFetch('https://email.internal/api/circle-email-consent',request(data)); }
async function subscriber(email) {return db.prepare('SELECT * FROM subscribers WHERE lower(email)=?').bind(email.toLowerCase()).first();}
test('verified Circle opt-in creates one subscriber, exact consent and stable identity link without sending a campaign',async()=>{
  const data=payload('new@example.test'),r=await send(data);assert.equal(r.status,200);
  const receipt=await r.json(),s=await subscriber(data.email);assert.equal(receipt.subscriberId,s.id);
  assert.equal(s.status,'active');assert.ok(s.unsubscribe_token);
  const consent=await db.prepare('SELECT * FROM subscriber_consents WHERE id=?').bind(data.id).first();
  assert.equal(consent.consent_text,EMAIL_CONSENT_TEXT);assert.equal(consent.source_path,'https://moonlightcircle.com/join');
  assert.equal(consent.consented_at,new Date(data.recordedAt).toISOString());
  const ecosystem=await db.prepare('SELECT * FROM ecosystem_email_consents WHERE id=?').bind(data.id).first();
  assert.equal(ecosystem.user_id,data.userId);assert.equal(ecosystem.version,EMAIL_CONSENT_VERSION);assert.equal(ecosystem.status,'granted');
  assert.equal((await db.prepare('SELECT count(*) AS n FROM subscriber_sequence_enrollments').first()).n,0);
  const publicWorker=await mf.getWorker('email');
  assert.equal((await publicWorker.fetch('https://email.internal/api/circle-email-consent',request(data))).status,404,'Opt-in handler is not publicly callable');
});
test('existing subscriber is reused case-insensitively; concurrent retries have one receipt and no duplicate subscriber',async()=>{
  await db.prepare("INSERT INTO subscribers(id,email,first_name,status,unsubscribe_token) VALUES ('existing','Existing@Example.Test','Existing Name','active','old-unsubscribe')").run();
  const data=payload('existing@example.test');
  const responses=await Promise.all([send(data),send(data)]);for(const r of responses)assert.equal(r.status,200);
  const s=await subscriber(data.email);assert.equal(s.id,'existing');assert.equal(s.first_name,'Existing Name');assert.equal(s.unsubscribe_token,'old-unsubscribe');
  assert.equal((await db.prepare('SELECT count(*) AS n FROM subscribers WHERE lower(email)=?').bind(data.email).first()).n,1);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM subscriber_consents WHERE id=?').bind(data.id).first()).n,1);
  assert.equal((await send({...data,userId:crypto.randomUUID()})).status,409);
});
test('unsubscribe withdraws Circle permission; replay and a delayed older consent cannot reactivate it',async()=>{
  const data=payload('unsubscribe@example.test');await send(data);const s=await subscriber(data.email);
  const publicWorker=await mf.getWorker('email');
  const r=await publicWorker.fetch('https://tarotflower.com/api/email/unsubscribe',{
    method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',accept:'application/json'},
    body:new URLSearchParams({token:s.unsubscribe_token}).toString()});
  assert.equal(r.status,200);
  assert.equal((await subscriber(data.email)).status,'unsubscribed');
  let record=await db.prepare('SELECT status,withdrawn_at FROM ecosystem_email_consents WHERE id=?').bind(data.id).first();
  assert.equal(record.status,'withdrawn');assert.ok(record.withdrawn_at);
  assert.equal((await send(data)).status,200);
  const delayed={...data,id:crypto.randomUUID()};assert.equal((await send(delayed)).status,200);
  assert.equal((await subscriber(data.email)).status,'unsubscribed');
  assert.equal((await db.prepare('SELECT status FROM ecosystem_email_consents WHERE id=?').bind(delayed.id).first()).status,'withdrawn');
});
test('a new explicit opt-in may renew old withdrawal; suppression remains protected',async()=>{
  const at=new Date(Date.now()-86400000).toISOString();
  for(const [email,status] of [['returning@example.test','unsubscribed'],['suppressed@example.test','suppressed']]){
    await db.prepare('INSERT INTO subscribers(id,email,status,unsubscribed_at) VALUES (?,?,?,?)').bind(crypto.randomUUID(),email,status,at).run();
    assert.equal((await send(payload(email))).status,200);
    assert.equal((await subscriber(email)).status,status==='unsubscribed'?'active':'suppressed');
  }
});
test('consent delivery is durable, retries safely, and declined choices never enter the email list',async()=>{
  const data=payload('durable@example.test');
  await identityDb.prepare('INSERT INTO customers(email,user_id,display_name,email_verified_at,created_at,updated_at) VALUES (?,?,?,1,1,1)')
    .bind(data.email,data.userId,data.firstName).run();
  await identityDb.prepare("INSERT INTO circle_email_consents(id,user_id,email,status,version,consent_text,recorded_at) VALUES (?,?,?,'granted',?,?,?)")
    .bind(data.id,data.userId,data.email,data.version,data.text,data.recordedAt).run();
  const declined=payload('declined@example.test');
  await identityDb.prepare('INSERT INTO customers(email,user_id,created_at,updated_at) VALUES (?,?,1,1)').bind(declined.email,declined.userId).run();
  await identityDb.prepare("INSERT INTO circle_email_consents(id,user_id,email,status,version,consent_text,recorded_at) VALUES (?,?,?,'declined',?,?,?)")
    .bind(declined.id,declined.userId,declined.email,declined.version,declined.text,declined.recordedAt).run();
  await syncCircleEmailConsents({LIBRARY_DB:identityDb,EMAIL_SERVICE:{fetch:()=>new Response('',{status:503})}});
  const pending=await identityDb.prepare('SELECT * FROM circle_email_consents WHERE id=?').bind(data.id).first();
  assert.equal(pending.synced_at,null);assert.equal(pending.attempts,1);assert.ok(pending.next_attempt_at>Date.now());
  await identityDb.prepare('UPDATE circle_email_consents SET next_attempt_at=0 WHERE id=?').bind(data.id).run();
  await syncCircleEmailConsents({LIBRARY_DB:identityDb,EMAIL_SERVICE:{fetch:(url,init)=>mf.dispatchFetch(url,init)}});
  const sent=await identityDb.prepare('SELECT * FROM circle_email_consents WHERE id=?').bind(data.id).first();
  assert.ok(sent.synced_at);assert.equal(sent.subscriber_id,(await subscriber(data.email)).id);
  assert.equal(await subscriber(declined.email),null);
});
test('stale version, altered wording and invalid payload shapes are rejected',async()=>{
  for(const changes of [{version:'old'},{text:'Different consent'},{recordedAt:Date.now()+120000},{userId:''},{email:'a b@example.test'}])
    assert.equal((await send({...payload('invalid@example.test'),...changes})).status,400);
  assert.equal(await subscriber('invalid@example.test'),null);
});

import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { randomBytes, createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const runtime = createRequire(require.resolve('wrangler/package.json'))('miniflare');
class Miniflare extends runtime.Miniflare { constructor(options) { options.modules = [{ type: 'ESModule', path: options.scriptPath }, { type: 'ESModule', path: new URL('../worker/workbench/access.js', import.meta.url).pathname }, { type: 'ESModule', path: new URL('../worker/circle/identity.js', import.meta.url).pathname }, {type:'ESModule',path:new URL('../worker/circle/passwords.js',import.meta.url).pathname}, {type:'ESModule',path:new URL('../worker/circle/consent.js',import.meta.url).pathname}]; super(runtime.convertV4MiniflareOptions ? runtime.convertV4MiniflareOptions(options) : options); } }
const random = () => randomBytes(32).toString('base64url');
const hash = value => createHash('sha256').update(value).digest('base64url');
const time = () => Math.floor(Date.now()/1000);
let mf, db;
const origin = 'http://127.0.0.1:8787', circle = 'http://localhost:3010', secret = random();
before(async () => {
  mf = new Miniflare({ modules: true, scriptPath: new URL('../worker/index.js', import.meta.url).pathname,
    compatibilityFlags: ['nodejs_compat'], compatibilityDate: '2026-07-18', d1Databases: ['LIBRARY_DB', 'MIGRATION_DB'], r2Buckets: ['LIBRARY_ASSETS'],
    bindings: { APP_ORIGIN: origin, CIRCLE_ORIGIN: circle, CIRCLE_DEV_MODE: 'true', CIRCLE_LOCAL_BRIDGE_SECRET: secret,
      CIRCLE_OWNER_EMAIL: 'owner@example.test', TOKEN_PEPPER: random() },
    outboundService: () => { throw new Error('Tests must not send external requests'); } });
  db = await mf.getD1Database('LIBRARY_DB');
  for (const file of ['../worker/schema.sql','../worker/circle/schema.sql','../worker/seed.sql']) {
    const sql = (await readFile(new URL(file, import.meta.url),'utf8')).replace(/^--.*$/gm,'');
    for (const statement of sql.split(';').map(s=>s.trim()).filter(Boolean)) await db.prepare(statement).run();
  }
});
after(async () => mf?.dispose());
async function api(action, data = {}) {
  const response = await mf.dispatchFetch(origin+'/__local/circle/'+action, { method:'POST', headers: {'content-type':'application/json','x-circle-local-secret':secret}, body:JSON.stringify(data) });
  return { status:response.status, data:await response.json() };
}
async function grant(email, source='goddess-yoga-retreat') {
  await db.prepare('INSERT INTO circle_eligibility(id,email,source_id,reason,evidence_reference,granted_by,granted_at) VALUES (?,?,?,?,?,?,?)')
    .bind(random(),email,source,'Test qualifying connection',random(),'test-owner',time()).run();
}
async function start() {
  const verifier=random(),state=random();
  const {data}=await api('start',{state,challenge:hash(verifier)});
  return {...data,verifier,state};
}
async function proof(email, purpose='setup') {
  const tx=await start();
  assert.equal((await api('password-link',{request:tx.request,email,purpose,turnstileToken:'local-circle-turnstile',ip:random()})).status,202);
  const {data}=await api('dev-mailbox',{request:tx.request});
  assert.ok(data.mail);
  const link=new URL(data.mail.magic_link);
  return {...tx,raw:link.searchParams.get('token'),link:String(link)};
}
const passwords = new Map();
async function setup(email) {
  const tx = await proof(email), password = random() + ' locally generated';
  const result = await api('password-set',{token:tx.raw,password,ip:random()});
  assert.equal(result.status,200); assert.equal(result.data.session,undefined);
  passwords.set(email,password);
  return tx;
}
async function authorize(email, password = passwords.get(email)) {
  const tx = await start();
  const result = await api('password-login',{request:tx.request,email,password,turnstileToken:'local-circle-turnstile',ip:random()});
  assert.equal(result.status,200,JSON.stringify(result.data));
  return {...tx,code:new URL(result.data.redirect).searchParams.get('code')};
}
async function login(email) {
  if (!passwords.has(email)) await setup(email);
  const tx = await authorize(email);
  const result = await api('exchange',{code:tx.code,verifier:tx.verifier,state:tx.state});
  assert.equal(result.status,200);
  return result.data;
}
async function join(session,name='A Circle Member') {
  return api('join',{session,name,accepted:true,guidelinesVersion:'2026-09-23',privacyVersion:'2026-09-23.1',emailConsent:false,emailConsentVersion:'2026-09-23'});
}
test('public callers cannot access the private identity bridge',async()=>{
  const r=await mf.dispatchFetch(origin+'/__local/circle/owner-members',{method:'POST',body:'{}'});
  assert.equal(r.status,404);
});
test('unknown email gets generic response and cannot create an identity',async()=>{
  const tx=await start();
  const response=await api('password-link',{request:tx.request,email:'unknown@example.test',turnstileToken:'local-circle-turnstile',ip:random()});
  assert.equal(response.status,202); assert.match(response.data.message,/If this email can continue/);
  assert.equal((await api('dev-mailbox',{request:tx.request})).data.mail,null);
  assert.equal(await db.prepare('SELECT email FROM customers WHERE email=?').bind('unknown@example.test').first(),null);
});
test('email proof only permits setting a password; password, PKCE, state, one-time exchange and consent are enforced',async()=>{
  await grant('new@example.test');
  const proofTx=await proof('new@example.test');
  assert.equal((await api('password-info',{token:proofTx.raw})).status,200);
  assert.equal((await db.prepare('SELECT consumed_at FROM identity_password_tokens WHERE token_hash=?').bind(hash(proofTx.raw)).first()).consumed_at,null);
  assert.equal((await api('profile',{session:proofTx.raw})).status,401);
  const password=random(); passwords.set('new@example.test',password);
  assert.equal((await api('password-set',{token:proofTx.raw,password:'short',ip:random()})).status,400);
  assert.equal((await api('password-set',{token:proofTx.raw,password,ip:random()})).status,200);
  assert.equal((await api('password-set',{token:proofTx.raw,password,ip:random()})).status,400);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM circle_sessions').first()).n,0);
  const tx=await authorize('new@example.test'),code=tx.code;
  assert.equal((await api('exchange',{code,verifier:random(),state:tx.state})).status,400);
  assert.equal((await api('exchange',{code,verifier:tx.verifier,state:random()})).status,400);
  const auth=await api('exchange',{code,verifier:tx.verifier,state:tx.state});
  assert.equal(auth.status,200); assert.ok(auth.data.profile.user.verifiedAt);
  assert.equal(auth.data.profile.membership,null);
  assert.equal((await api('exchange',{code,verifier:tx.verifier,state:tx.state})).status,400);
  assert.equal((await api('join',{session:auth.data.session,name:'Mira',accepted:false})).status,400);
  assert.equal((await join(auth.data.session,'Mira')).status,200);
  const p=(await api('profile',{session:auth.data.session})).data;
  assert.equal(p.membership.status,'active'); assert.equal(p.user.name,'Mira');
  assert.equal((await db.prepare('SELECT count(*) AS n FROM circle_acceptances WHERE user_id=?').bind(p.user.id).first()).n,2);
  await join(auth.data.session);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM circle_memberships WHERE user_id=?').bind(p.user.id).first()).n,1);
});
test('existing customer and stable identity are reused without granting product access to community members',async()=>{
  await db.prepare('INSERT INTO customers(email,stripe_customer_id,created_at,updated_at) VALUES (?,?,?,?)').bind('existing@example.test','cus_keep',time()-1000,time()).run();
  await grant('existing@example.test','tarot-reading');
  const a=await login('existing@example.test'),b=await login('existing@example.test');
  assert.equal(a.profile.user.id,b.profile.user.id);
  assert.equal((await db.prepare('SELECT stripe_customer_id FROM customers WHERE email=?').bind('existing@example.test').first()).stripe_customer_id,'cus_keep');
  assert.equal((await db.prepare('SELECT count(*) AS n FROM entitlements WHERE customer_email=?').bind('existing@example.test').first()).n,0);
});
test('verified purchase supplies eligibility, separate from community status',async()=>{
  const email='buyer@example.test',product='ritual-step-into-the-fire-test';
  await db.prepare('INSERT INTO customers(email,created_at,updated_at) VALUES (?,?,?)').bind(email,time(),time()).run();
  await db.prepare("INSERT INTO purchases(stripe_checkout_session_id,customer_email,product_id,amount_total,currency,payment_status,purchased_at) VALUES ('cs_circle_test',?,?,1000,'eur','paid',?)").bind(email,product,time()).run();
  await db.prepare("INSERT INTO entitlements(customer_email,product_id,source_checkout_session_id,granted_at) VALUES (?,?,'cs_circle_test',?)").bind(email,product,time()).run();
  const auth=await login(email);
  assert.equal(auth.profile.eligibility[0].source_id,'ritual-product');
  await join(auth.session);
  await db.prepare('UPDATE entitlements SET revoked_at=? WHERE customer_email=?').bind(time(),email).run();
  const p=(await api('profile',{session:auth.session})).data;
  assert.equal(p.membership.status,'active');assert.equal(p.eligible,true);
});
test('Library email sessions and old Circle sessions cannot bypass a password',async()=>{
  await grant('library@example.test');
  const auth=await login('library@example.test');
  const raw=random(),hex=createHash('sha256').update(raw).digest('hex');
  await db.prepare("INSERT INTO sessions(token_hash,customer_email,created_at,expires_at,last_seen_at,auth_method) VALUES (?,?,?,?,?,'email_magic_link')").bind(hex,'library@example.test',time(),time()+1000,time()).run();
  const r=await mf.dispatchFetch(origin+'/circle-auth/authorize?request='+random(),{headers:{cookie:'tf_library_session='+raw},redirect:'manual'});
  assert.equal(r.status,410);
  assert.equal((await mf.dispatchFetch(origin+'/circle-auth/verify?token='+random())).status,410);
  assert.equal((await api('request-link',{})).status,410);
  await db.prepare("INSERT INTO circle_sessions(token_hash,user_id,audience,created_at,expires_at) VALUES (?,?,'moonlight',?,?)").bind(hash(raw),auth.profile.user.id,time(),time()+1000).run();
  assert.equal((await api('profile',{session:raw})).status,401);
  const tx=await start(),code=random();
  await db.prepare('UPDATE circle_auth_requests SET user_id=?,code_hash=?,code_expires_at=? WHERE request_hash=?').bind(auth.profile.user.id,hash(code),time()+90,hash(tx.request)).run();
  assert.equal((await api('exchange',{code,state:tx.state,verifier:tx.verifier})).status,400);
});
test('owner view and invitations require the verified configured owner',async()=>{
  const member=await login('new@example.test');
  assert.equal((await api('owner-members',{session:member.session,email:'owner@example.test'})).status,404);
  const owner=await login('owner@example.test');
  const invite=await api('owner-invite',{session:owner.session,email:'invited@example.test',source:'goddess-yoga-class-workshop',reason:'A real workshop'});
  assert.equal(invite.status,201);
  const newcomer=await login('invited@example.test');
  assert.equal(newcomer.profile.eligibility[0].invitation_id,invite.data.invitationId);
  await join(newcomer.session);
  const list=await api('owner-members',{session:owner.session});
  assert.equal(list.status,200);assert.ok(list.data.active>=2);
  assert.ok(list.data.members.find(m=>m.email==='invited@example.test'));
});
test('expired invitation and email links cannot be used',async()=>{
  const owner=await login('owner@example.test');
  await api('owner-invite',{session:owner.session,email:'expired@example.test',source:'personal-invitation',reason:'Test'});
  await db.prepare('UPDATE circle_invitations SET expires_at=? WHERE email=?').bind(time()-1,'expired@example.test').run();
  const tx=await start();
  await api('password-link',{request:tx.request,email:'expired@example.test',turnstileToken:'local-circle-turnstile',ip:random()});
  assert.equal((await api('dev-mailbox',{request:tx.request})).data.mail,null);
  const proofTx=await proof('existing@example.test','reset');
  await db.prepare('UPDATE identity_password_tokens SET expires_at=? WHERE token_hash=?').bind(time()-1,hash(proofTx.raw)).run();
  assert.equal((await api('password-set',{token:proofTx.raw,password:random(),ip:random()})).status,400);
});
test('suspended membership cannot be rejoined and revoked eligibility is reflected immediately',async()=>{
  const auth=await login('new@example.test');
  await db.prepare("UPDATE circle_memberships SET status='suspended' WHERE user_id=?").bind(auth.profile.user.id).run();
  assert.equal((await join(auth.session)).status,403);
  assert.equal((await api('profile',{session:auth.session})).data.membership.status,'suspended');
  await db.prepare('UPDATE circle_eligibility SET revoked_at=? WHERE email=?').bind(time(),'new@example.test').run();
  assert.equal((await api('profile',{session:auth.session})).data.eligible,false);
});
test('logout revokes the password-authenticated Circle session',async()=>{
  const auth=await login('existing@example.test');
  assert.equal((await api('logout',{session:auth.session})).status,200);
  assert.equal((await api('profile',{session:auth.session})).status,401);
});
test('rate limit stops repeated deliveries without revealing eligibility',async()=>{
  await grant('limited@example.test');
  let last;
  for(let i=0;i<6;i++){
    const tx=await start();
    last=await api('password-link',{request:tx.request,email:'limited@example.test',turnstileToken:'local-circle-turnstile',ip:random()});
    if(i===5)assert.equal((await api('dev-mailbox',{request:tx.request})).data.mail,null);
  }
  assert.equal(last.status,202);
});

test('upgrade preserves existing Library customers and leaves old sessions unverified',async()=>{
  const migrationDb=await mf.getD1Database('MIGRATION_DB');
  let old=(await readFile(new URL('../worker/schema.sql',import.meta.url),'utf8')).replace('  user_id TEXT UNIQUE,\n','').replace('  display_name TEXT,\n','').replace('  email_verified_at INTEGER,\n','').replace("  auth_method TEXT NOT NULL DEFAULT 'legacy',\n",'');
  async function apply(sql){for(const s of sql.replace(/^--.*$/gm,'').split(';').map(v=>v.trim()).filter(Boolean))await migrationDb.prepare(s).run();}
  await apply(old);
  await migrationDb.prepare("INSERT INTO customers(email,stripe_customer_id,created_at,updated_at) VALUES ('kept@example.test','cus_existing',100,200)").run();
  await migrationDb.prepare("INSERT INTO sessions(token_hash,customer_email,created_at,expires_at,last_seen_at) VALUES ('old-hash','kept@example.test',100,9999999999,200)").run();
  await apply(await readFile(new URL('../worker/migrations/0005_shared_identity.sql',import.meta.url),'utf8'));
  await apply(await readFile(new URL('../worker/migrations/0006_circle_membership.sql',import.meta.url),'utf8'));
  await apply(await readFile(new URL('../worker/migrations/0007_identity_passwords.sql',import.meta.url),'utf8'));
  await apply(await readFile(new URL('../worker/migrations/0008_circle_email_consents.sql',import.meta.url),'utf8'));
  assert.equal((await migrationDb.prepare('SELECT count(*) AS n FROM circle_email_consents').first()).n,0);
  const customer=await migrationDb.prepare("SELECT * FROM customers WHERE email='kept@example.test'").first();
  assert.equal(customer.stripe_customer_id,'cus_existing');assert.equal(customer.created_at,100);assert.equal(customer.email_verified_at,null);
  assert.equal((await migrationDb.prepare("SELECT auth_method FROM sessions WHERE token_hash='old-hash'").first()).auth_method,'legacy');
  assert.equal((await migrationDb.prepare('SELECT count(*) AS n FROM circle_sources').first()).n,8);
});

test('incorrect and nonexistent credentials use the same response and password login is rate limited',async()=>{
  await grant('attempts@example.test'); await setup('attempts@example.test');
  const tx=await start();
  const attempt=(email,password)=>api('password-login',{request:tx.request,email,password,turnstileToken:'local-circle-turnstile',ip:random()});
  const wrong=await attempt('attempts@example.test',random()),unknown=await attempt('absent@example.test',random());
  assert.deepEqual(wrong,unknown); assert.equal(wrong.status,401);
  for(let i=0;i<9;i++)assert.equal((await attempt('attempts@example.test',random())).status,401);
  assert.equal((await attempt('attempts@example.test',passwords.get('attempts@example.test'))).status,429);
});
test('reset is single-use, keeps the same identity, revokes sessions and invalidates pre-reset authorization codes',async()=>{
  await grant('reset@example.test'); const old=await login('reset@example.test');
  const code=await authorize('reset@example.test'),tx=await proof('reset@example.test','reset');
  const other=await proof('reset@example.test','reset'),password=random();
  const libraryRaw=random();
  await db.prepare("INSERT INTO sessions(token_hash,customer_email,created_at,expires_at,last_seen_at,auth_method) VALUES (?,?,?,?,?,'email_magic_link')")
    .bind(createHash('sha256').update(libraryRaw).digest('hex'),'reset@example.test',time(),time()+1000,time()).run();
  const result=await api('password-set',{token:tx.raw,password,ip:random()});
  assert.equal(result.status,200);assert.equal(result.data.session,undefined);
  assert.equal((await api('profile',{session:old.session})).status,401);
  assert.equal((await api('exchange',{code:code.code,verifier:code.verifier,state:code.state})).status,400);
  assert.equal((await api('password-info',{token:other.raw})).status,400);
  assert.equal((await api('password-set',{token:tx.raw,password:random(),ip:random()})).status,400);
  const loginTx=await start();
  assert.equal((await api('password-login',{request:loginTx.request,email:'reset@example.test',password:passwords.get('reset@example.test'),turnstileToken:'local-circle-turnstile',ip:random()})).status,401);
  passwords.set('reset@example.test',password);
  const current=await login('reset@example.test');assert.equal(current.profile.user.id,old.profile.user.id);
  // Replaying a consumed proof must not revoke a newly created session.
  await api('password-set',{token:tx.raw,password:random(),ip:random()});
  assert.equal((await api('profile',{session:current.session})).status,200);
  assert.ok((await db.prepare('SELECT revoked_at FROM sessions WHERE customer_email=?').bind('reset@example.test').first()).revoked_at);
});
test('concurrent setup/reset submissions have one winner and credentials are uniquely salted',async()=>{
  const password=random();
  for(const email of ['race@example.test','salt@example.test']){
    await grant(email); const proofTx=await proof(email);
    const result=await Promise.all([api('password-set',{token:proofTx.raw,password,ip:random()}),api('password-set',{token:proofTx.raw,password,ip:random()})]);
    assert.deepEqual(result.map(r=>r.status).sort(),[200,400]);
  }
  const rows=(await db.prepare("SELECT password_hash FROM identity_passwords p JOIN customers c ON c.user_id=p.user_id WHERE c.email IN ('race@example.test','salt@example.test')").all()).results;
  for(const row of rows){assert.match(row.password_hash,/^scrypt\$32768\$8\$3\$/);assert.ok(!row.password_hash.includes(password));}
  assert.notEqual(rows[0].password_hash,rows[1].password_hash);
});
test('setup cannot overwrite an existing password and resetting an unknown account creates nothing',async()=>{
  for(const [email,purpose] of [['reset@example.test','setup'],['nobody@example.test','reset']]){
    const tx=await start();
    assert.equal((await api('password-link',{request:tx.request,email,purpose,turnstileToken:'local-circle-turnstile',ip:random()})).status,202);
    assert.equal((await api('dev-mailbox',{request:tx.request})).data.mail,null);
  }
});
test('legacy members set a password once and database-defined eligibility sources need no core model changes',async()=>{
  const email='legacy-growth@example.test';
  await grant(email,'legacy-moonlight-circle');
  const auth=await login(email);
  assert.equal(auth.profile.eligibility[0].source_id,'legacy-moonlight-circle');
  assert.equal((await join(auth.session,'Legacy Member')).status,200);
  await db.prepare("INSERT INTO circle_sources(id,label) VALUES ('test-future-source','Additional qualifying source')").run();
  await grant(email,'test-future-source');
  await db.prepare("UPDATE circle_eligibility SET revoked_at=? WHERE email=? AND source_id='legacy-moonlight-circle'").bind(time(),email).run();
  const p=(await api('profile',{session:auth.session})).data;
  assert.equal(p.user.id,auth.profile.user.id);assert.equal(p.membership.status,'active');assert.equal(p.eligible,true);
  assert.equal(p.eligibility[0].source_id,'test-future-source');
  await db.prepare("UPDATE circle_sources SET active=0 WHERE id='test-future-source'").run();
  assert.equal((await api('profile',{session:auth.session})).data.eligible,false);
  const owner=await login('owner@example.test');
  const row=(await api('owner-members',{session:owner.session})).data.members.find(m=>m.email===email);
  assert.match(row.sources,/Legacy Moonlight Circle membership/);
  assert.match(row.sources,/Additional qualifying source/);
});

test('joining records an optional, immutable choice and the exact server-owned consent wording',async()=>{
  const email='consent-choice@example.test';await grant(email);const auth=await login(email);
  const form={session:auth.session,name:'Consent Test',accepted:true,guidelinesVersion:'2026-09-23',privacyVersion:'2026-09-23.1'};
  assert.equal((await api('join',form)).status,400);
  assert.equal((await api('join',{...form,emailConsent:true,emailConsentVersion:'old'})).status,400);
  assert.equal((await api('join',{...form,emailConsent:'yes',emailConsentVersion:'2026-09-23'})).status,400);
  assert.equal((await api('join',{...form,emailConsent:true,emailConsentVersion:'2026-09-23',emailConsentText:'Forged text'})).status,200);
  const consent=await db.prepare('SELECT * FROM circle_email_consents WHERE user_id=?').bind(auth.profile.user.id).first();
  assert.equal(consent.status,'granted');assert.equal(consent.consent_text,auth.profile.emailConsentText);
  assert.equal(consent.email,email);assert.equal(consent.version,auth.profile.emailConsentVersion);assert.ok(consent.recorded_at);
  await api('join',{...form,emailConsent:false,emailConsentVersion:'2026-09-23'});
  assert.deepEqual(await db.prepare('SELECT * FROM circle_email_consents WHERE user_id=?').bind(auth.profile.user.id).first(),consent);
  const declined=await db.prepare("SELECT e.status,m.status AS membership FROM circle_email_consents e JOIN circle_memberships m ON m.user_id=e.user_id JOIN customers c ON c.user_id=e.user_id WHERE c.email='invited@example.test'").first();
  assert.equal(declined.status,'declined');assert.equal(declined.membership,'active');
});

test('all eight current origin types are preserved on one member identity',async()=>{
  const email='many-sources@example.test';
  const sources=(await db.prepare("SELECT id,label FROM circle_sources WHERE id<>'test-future-source'").all()).results;
  assert.equal(sources.length,8);
  for(const source of sources)await grant(email,source.id);
  const auth=await login(email);assert.equal(auth.profile.eligibility.length,8);
  assert.equal((await join(auth.session,'Many Sources')).status,200);
  const owner=await login('owner@example.test'),directory=(await api('owner-members',{session:owner.session})).data;
  const row=directory.members.find(m=>m.email===email);
  for(const source of sources)assert.ok(row.sources.includes(source.label));
  assert.equal(row.user_id,auth.profile.user.id);assert.equal(row.name,'Many Sources');assert.ok(row.joined_at);assert.equal(row.status,'active');
  assert.equal(directory.total,(await db.prepare('SELECT count(*) AS n FROM circle_memberships').first()).n);
  assert.equal(directory.active,(await db.prepare("SELECT count(*) AS n FROM circle_memberships WHERE status='active'").first()).n);
});

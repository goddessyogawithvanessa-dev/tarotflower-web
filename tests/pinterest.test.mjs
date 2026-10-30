import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createHash,createHmac} from 'node:crypto';
const script=await readFile(new URL('../public/scripts/pinterest.js',import.meta.url),'utf8');
const ga4PurchaseScript=await readFile(new URL('../public/scripts/ga4-purchase.js',import.meta.url),'utf8');
function browser(choice=null,gpc=false,path='/step-into-your-fire/',receipt={}) {
 const values=new Map(choice?[['tf_pinterest_consent_v1',choice]]:[]), listeners={},scripts=[],calls=[],fetches=[];
 const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
 const document={cookie:'',querySelector:()=>({dataset:{pinterestTag:'123456789'}}),head:{appendChild:s=>scripts.push(s)},createElement:()=>({}),addEventListener:(n,f)=>listeners[n]=f,dispatchEvent:e=>calls.push(e.type)};
 const ctx={document,localStorage:storage,sessionStorage:storage,navigator:{globalPrivacyControl:gpc},location:{pathname:path,hostname:'tarotflower.com',reload:()=>calls.push('reload')},fetch:(url)=>{fetches.push(url);return Promise.resolve(Response.json(receipt));},CustomEvent:function(type){this.type=type;},console};ctx.window=ctx;
 vm.runInNewContext(script,ctx);
 return {ctx,scripts,listeners,calls,fetches,queued:()=>ctx.pintrk?.queue||[]};
}
test('Pinterest has independent opt-in; GA choice cannot load it; declined/GPC block loading',()=>{
 for(const [choice,gpc] of [[null,false],['declined',false],['accepted',true]]){
  const b=browser(choice,gpc);assert.equal(b.scripts.length,0);assert.equal(b.ctx.TarotFlowerPinterest.track('checkout',{}),false);
 }
 const b=browser();b.ctx.TarotFlowerPinterest.choose('accepted');assert.equal(b.scripts.length,1);
 assert.equal(b.queued().filter(c=>c[0]==='load').length,1);
 assert.equal(b.queued().filter(c=>c[1]==='pagevisit').length,1);
 b.ctx.TarotFlowerPinterest.choose('accepted');assert.equal(b.scripts.length,1);
 b.ctx.TarotFlowerPinterest.choose('declined');assert.equal(b.ctx.TarotFlowerPinterest.track('lead',{}),false);assert.ok(b.calls.includes('reload'));
});
test('FIRE initiation and Oracle lead are distinct from successful checkout; no email is transmitted',()=>{
 const b=browser('accepted');
 b.listeners.click({target:{closest:()=>({hasAttribute:()=>false})}});
 b.listeners['tf:oracle-subscribed']();
 assert.ok(b.queued().some(c=>c[1]==='initiatecheckout'));
 assert.ok(b.queued().some(c=>c[1]==='lead'&&c[2].lead_type==='Sacred Becoming Oracle waitlist'));
 assert.ok(!b.queued().some(c=>c[1]==='checkout'));
 assert.ok(!JSON.stringify(b.queued()).includes('email'));
});
test('verified FIRE purchase bridge queues one checkout and never loads tracking on private pages',async()=>{
 const receipt={event_id:'stable-event',order_id:'stable-event',value:33,currency:'USD'};
 const bridge=browser('accepted',false,'/fire-purchase-complete/',receipt);
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(bridge.fetches.length,1);
 assert.equal(bridge.queued().filter(c=>c[1]==='checkout').length,1);
 assert.ok(bridge.calls.includes('tf:pinterest-purchase'));
 bridge.ctx.TarotFlowerPinterest.choose('accepted');
 assert.equal(bridge.fetches.length,1);
 const privatePage=browser('accepted',false,'/library/rituals/step-into-your-fire/',receipt);
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(privatePage.fetches.length,0);
 assert.equal(privatePage.queued().filter(c=>c[1]==='checkout').length,0);
});
test('Receipt requires consent and a signed paid FIRE transaction',async()=>{
 const require=createRequire(import.meta.url),runtime=createRequire(require.resolve('wrangler/package.json'))('miniflare');
 const pepper='isolated-test-pepper-at-least-32-characters';
 const opts={modulesRoot:new URL('../',import.meta.url).pathname,modules:['worker/index.js','worker/workbench/access.js','worker/circle/identity.js','worker/circle/passwords.js','worker/circle/consent.js'].map(f=>({type:'ESModule',path:new URL('../'+f,import.meta.url).pathname})),compatibilityDate:'2026-07-18',compatibilityFlags:['nodejs_compat'],d1Databases:['LIBRARY_DB'],bindings:{APP_ORIGIN:'http://localhost',LIBRARY_TEST_MODE:'false',TOKEN_PEPPER:pepper}};
 const mf=new runtime.Miniflare(runtime.convertV4MiniflareOptions?runtime.convertV4MiniflareOptions(opts):opts);
 try{
 const db=await mf.getD1Database('LIBRARY_DB');
 for(const file of ['worker/schema.sql','worker/seed.sql'])for(const s of (await readFile(new URL('../'+file,import.meta.url),'utf8')).replace(/^--.*$/gm,'').split(';').filter(s=>s.trim()))await db.prepare(s).run();
 const now=Math.floor(Date.now()/1000),email='receipt@example.test',id='cs_live_isolated_fixture',token='isolated-session';
 await db.prepare('INSERT INTO customers(email,created_at,updated_at) VALUES (?,?,?)').bind(email,now,now).run();
 await db.prepare('INSERT INTO sessions(token_hash,customer_email,created_at,expires_at,last_seen_at) VALUES (?,?,?,?,?)').bind(createHash('sha256').update(token).digest('hex'),email,now,now+600,now).run();
 await db.prepare("INSERT INTO purchases(stripe_checkout_session_id,customer_email,product_id,amount_total,currency,payment_status,purchased_at) VALUES (?,?,'ritual-step-into-the-fire-test',3300,'usd','paid',?)").bind(id,email,now).run();
 const proof=createHmac('sha256',pepper).update('pinterest-receipt:'+id).digest('hex');
 const cookie=`tf_pinterest_consent=accepted; tf_library_session=${token}; tf_pinterest_receipt=${id}.${proof}`;
 const fetchReceipt=Cookie=>mf.dispatchFetch('http://localhost/api/pinterest/fire-receipt',{headers:{Cookie}});
 assert.deepEqual(await(await fetchReceipt('')).json(),{});
 assert.deepEqual(await(await fetchReceipt(cookie.replace(proof,'forged'))).json(),{});
 assert.deepEqual(await(await fetchReceipt(cookie.replace(proof,'wrong-owner'))).json(),{});
 const r=await fetchReceipt(cookie),body=await r.json();assert.equal(body.value,33);assert.equal(body.currency,'USD');assert.equal(body.order_quantity,1);assert.ok(body.event_id);assert.ok(!JSON.stringify(body).includes(email));assert.match(r.headers.get('set-cookie'),/Max-Age=0/);
 await db.prepare("UPDATE purchases SET payment_status='unpaid'").run();assert.deepEqual(await(await fetchReceipt(cookie)).json(),{});
 }finally{await mf.dispose();}
});

test('GA4 purchase bridge sends one privacy-safe purchase with the verified discounted total',async()=>{
 const calls=[],events=[],values=new Map(),listeners={};
 const purchase={transaction_id:'stable-ga4-transaction',value:1,currency:'USD',items:[{item_id:'step-into-your-fire',price:1,quantity:1}]};
 const document={addEventListener:(name,fn)=>listeners[name]=fn,dispatchEvent:event=>events.push(event.type)};
 const ctx={document,sessionStorage:{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)},
  fetch:()=>Promise.resolve(Response.json(purchase)),CustomEvent:function(type){this.type=type;},
  gtag:(...args)=>calls.push(args),__tfAnalyticsLoaded:true,console};ctx.window=ctx;
 vm.runInNewContext(ga4PurchaseScript,ctx);
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(calls.filter(call=>call[0]==='event'&&call[1]==='purchase').length,1);
 assert.deepEqual(JSON.parse(JSON.stringify(calls[0][2])),purchase);
 assert.ok(events.includes('tf:ga4-purchase'));
 await listeners['tf:analytics-ready']?.();
 assert.equal(calls.filter(call=>call[0]==='event'&&call[1]==='purchase').length,1);
 assert.ok(!JSON.stringify(calls).includes('@'));
});

test('GA4 receipt requires a signed paid FIRE transaction and has a stable deduplication id',async()=>{
 const require=createRequire(import.meta.url),runtime=createRequire(require.resolve('wrangler/package.json'))('miniflare');
 const pepper='analytics-receipt-test-pepper-at-least-32-characters';
 const opts={modulesRoot:new URL('../',import.meta.url).pathname,modules:['worker/index.js','worker/workbench/access.js','worker/circle/identity.js','worker/circle/passwords.js','worker/circle/consent.js'].map(f=>({type:'ESModule',path:new URL('../'+f,import.meta.url).pathname})),compatibilityDate:'2026-07-18',compatibilityFlags:['nodejs_compat'],d1Databases:['LIBRARY_DB'],bindings:{APP_ORIGIN:'http://localhost',LIBRARY_TEST_MODE:'false',TOKEN_PEPPER:pepper}};
 const mf=new runtime.Miniflare(runtime.convertV4MiniflareOptions?runtime.convertV4MiniflareOptions(opts):opts);
 try{
  const db=await mf.getD1Database('LIBRARY_DB');
  for(const file of ['worker/schema.sql','worker/seed.sql'])for(const s of (await readFile(new URL('../'+file,import.meta.url),'utf8')).replace(/^--.*$/gm,'').split(';').filter(s=>s.trim()))await db.prepare(s).run();
  const now=Math.floor(Date.now()/1000),email='buyer@real-domain.test',id='cs_live_discounted_fire';
  await db.prepare('INSERT INTO customers(email,created_at,updated_at) VALUES (?,?,?)').bind(email,now,now).run();
  await db.prepare("INSERT INTO purchases(stripe_checkout_session_id,customer_email,product_id,amount_total,currency,payment_status,purchased_at) VALUES (?,?,'ritual-step-into-the-fire-test',100,'usd','paid',?)").bind(id,email,now).run();
  const proof=createHmac('sha256',pepper).update('analytics-receipt:'+id).digest('hex');
  const fetchReceipt=Cookie=>mf.dispatchFetch('http://localhost/api/analytics/fire-receipt',{headers:{Cookie}});
  assert.deepEqual(await(await fetchReceipt('')).json(),{});
  assert.deepEqual(await(await fetchReceipt(`tf_analytics_receipt=${id}.forged`)).json(),{});
  const cookie=`tf_analytics_receipt=${id}.${proof}`;
  const first=await fetchReceipt(cookie),body=await first.json();
  const replay=await(await fetchReceipt(cookie)).json();
  assert.equal(body.value,1);assert.equal(body.currency,'USD');assert.equal(body.transaction_id,replay.transaction_id);
  assert.equal(body.items[0].price,1);assert.ok(!JSON.stringify(body).includes(email));
  assert.match(first.headers.get('set-cookie'),/Max-Age=0/);
  await db.prepare('INSERT INTO customers(email,created_at,updated_at) VALUES (?,?,?)').bind('qa@example.test',now,now).run();
  await db.prepare("UPDATE purchases SET customer_email='qa@example.test'").run();
  assert.deepEqual(await(await fetchReceipt(cookie)).json(),{});
  await db.prepare('UPDATE purchases SET customer_email=?').bind(email).run();
  await db.prepare("UPDATE purchases SET payment_status='unpaid'").run();
  assert.deepEqual(await(await fetchReceipt(cookie)).json(),{});
 }finally{await mf.dispose();}
});

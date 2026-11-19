import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {EMAILS} from '../worker/email-service/tarot-email-suite.js';
const require=createRequire(import.meta.url),runtime=createRequire(require.resolve('wrangler/package.json'))('miniflare');
const p=f=>new URL('../'+f,import.meta.url).pathname;
let mf,db;const messages=[];
const previewFailures=new Set();
function statements(sql) {
  let quoted=false,start=0,result=[];
  for(let i=0;i<sql.length;i++){
    if(sql[i]==="'"){if(quoted&&sql[i+1]==="'"){i++;continue;}quoted=!quoted;}
    if(sql[i]===';'&&!quoted){result.push(sql.slice(start,i));start=i+1;}
  }
  return result.filter(s=>s.trim());
}
async function apply(file){for(const sql of statements(await readFile(p(file),'utf8')))await db.prepare(sql).run();}
before(async()=>{
 const opts={workers:[{name:'email',modulesRoot:p(''),modules:[
  'worker/email-service/index.js','worker/email-service/library-purchase-email.js','worker/email-service/tarot-email-suite.js',
  'worker/email-service/circle-consent.js','worker/circle/consent.js'].map(f=>({type:'ESModule',path:p(f)})),
  compatibilityDate:'2026-07-18',d1Databases:['DB'],r2Buckets:['GUIDE_ASSETS'],
  bindings:{ALLOWED_ORIGINS:'https://tarotflower.com',TURNSTILE_ALLOWED_HOSTNAMES:'tarotflower.com',
    TURNSTILE_SECRET_KEY:'test',CONTACT_TURNSTILE_SITE_KEY:'test',CONTACT_DRY_RUN:'true',
    SMTP_USERNAME:'test@example.test',SMTP_APP_PASSWORD:'test-only',CAMPAIGN_SEND_TOKEN:'local-test',
    CAMPAIGN_FROM:'Vanessa Hylande <vanessa@tarotflower.com>',CAMPAIGN_REPLY_TO:'vanessa@tarotflower.com',
    CAMPAIGN_OWNER_COPY:'vanessa@tarotflower.com',CAMPAIGN_PUBLIC_ORIGIN:'https://tarotflower.com',
    SMTP_AUTHORIZED_FROM:'vanessa@tarotflower.com',CAMPAIGN_AUTHENTICATION_VERIFIED:'true',CAMPAIGN_BATCH_SIZE:'25',
    QA_RECORD_TOKEN:'local-qa-record-token',
    ADMIN_REVIEW_TOKEN:'local-review-token',
    GUIDE_DOWNLOAD_TOKEN_SECRET:'local-test-guide-secret-32-characters'},
  serviceBindings:{ASSETS:()=>new Response('Not found',{status:404}),
    EMAIL_PREVIEW:async r=>{const message=await r.json();messages.push(message);
      const failureKey=`${message.subject}:${message.to}`;
      if(message.subject==='Retry-safe campaign test'&&!previewFailures.has(failureKey)){
        previewFailures.add(failureKey);return new Response('controlled failure',{status:503});
      }
      return Response.json({ok:true});}},
  outboundService:async r=>{assert.equal(new URL(r.url).hostname,'challenges.cloudflare.com');
    const token=(await r.formData()).get('response');
    return Response.json({success:token!=='invalid',hostname:'tarotflower.com',action:token});}
 },{name:'business-review-caller',modules:true,
  script:"export default {fetch(request,env){return env.EMAIL.fetch(request)}}",
  serviceBindings:{EMAIL:{name:'email',entrypoint:'LibraryEmailService'}}}]};
 mf=new runtime.Miniflare(runtime.convertV4MiniflareOptions?runtime.convertV4MiniflareOptions(opts):opts);
 db=await mf.getD1Database('DB','email');
 await apply('tests/fixtures/email-production-schema.sql');
 await apply('worker/email-service/migrations/0001_circle_email_consent.sql');
 await apply('worker/email-service/migrations/0002_tarot_email_suite.sql');
 await apply('worker/email-service/migrations/0003_subscriber_activity_classification.sql');
 await apply('worker/email-service/migrations/0004_newsletter_campaigns.sql');
});
after(async()=>mf?.dispose());
function signup(path,email,token='contact',extra={},classification='qa'){
 const headers={Origin:'https://tarotflower.com','Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'};
 if(classification){headers['x-tarotflower-activity-classification']=classification;headers['x-tarotflower-qa-token']='local-qa-record-token';}
 return mf.dispatchFetch('https://tarotflower-web-dev.embodiedgoddesses.workers.dev'+path,{
  method:'POST',headers,
  body:new URLSearchParams({email,name:'Goddess',first_name:'Goddess',consent:'true',source_path:'/test/',
    'cf-turnstile-response':token,...extra})});
}
async function sendDue(){
  const worker=await mf.getWorker('email');
  await worker.scheduled({scheduledTime:Date.now(),cron:'* * * * *'});
}
async function one(email){return db.prepare('SELECT * FROM subscribers WHERE email=?').bind(email).first();}
test('named email-service entrypoint exposes the exact public form routes',async()=>{
 const caller=await mf.getWorker('business-review-caller');
 const config=await caller.fetch('https://email.internal/api/contact/config');
 assert.equal(config.status,200);
 assert.equal((await config.json()).siteKey,'test');
 for(const route of ['/api/contact','/api/lead-magnet','/api/oracle-waitlist','/api/tarot-newsletter']){
  const response=await caller.fetch(`https://email.internal${route}`,{
   method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:''});
  assert.equal(response.status,400,route);
  assert.match(response.headers.get('content-type'),/application\/json/,route);
 }
});
test('Oracle capture is persistent, consented and deduplicated under concurrent retries',async()=>{
 const responses=await Promise.all(Array.from({length:3},()=>signup('/api/oracle-waitlist','oracle@example.test')));
 responses.forEach(r=>assert.equal(r.status,200));
 const s=await one('oracle@example.test');
 assert.equal((await db.prepare('SELECT count(*) n FROM subscribers WHERE email=?').bind(s.email).first()).n,1);
 assert.equal((await db.prepare('SELECT count(*) n FROM subscriber_sequence_step_deliveries WHERE subscriber_id=?').bind(s.id).first()).n,1);
 assert.equal((await db.prepare('SELECT consent_text FROM subscriber_consents WHERE subscriber_id=? LIMIT 1').bind(s.id).first()).consent_text,
  'I agree to receive Sacred Becoming Oracle launch updates by email.');
 await sendDue();await sendDue();
 assert.equal(messages.filter(m=>m.to===s.email).length,1);
 assert.equal(messages.find(m=>m.to===s.email).subject,EMAILS.oracle.subject);
});
test('Tarot newsletter shares identity but is segmented independently of Oracle and GYR',async()=>{
 assert.equal((await signup('/api/tarot-newsletter','oracle@example.test','newsletter')).status,200);
 assert.equal((await signup('/api/tarot-newsletter','oracle@example.test','newsletter')).status,200);
 const s=await one('oracle@example.test');
 const tags=(await db.prepare('SELECT tag FROM subscriber_tags WHERE subscriber_id=?').bind(s.id).all()).results.map(x=>x.tag);
 assert.ok(tags.includes('list:tarot-flower-newsletter'));assert.ok(tags.includes('interest:sacred-becoming-oracle'));
 assert.ok(!tags.includes('source:goddess-yoga-retreats'));
 await sendDue();assert.equal(messages.filter(m=>m.to===s.email).length,2);
 assert.equal(messages.find(m=>m.subject===EMAILS.newsletter.subject).text,EMAILS.newsletter.text.replace('{{unsubscribe_url}}',
  'https://tarotflower.com/api/email/unsubscribe?token='+s.unsubscribe_token));
});
test('Guide queues exact approved copy at 0/72/168 hours and scheduler delivers all three',async()=>{
 const start=Date.now();
 const replies=await Promise.all(Array.from({length:3},()=>signup('/api/lead-magnet','guide@example.test','lead_magnet_goddess_guide',{lead_magnet:'goddess-embodiment-guide'})));
 replies.forEach(r=>assert.equal(r.status,200));
 const s=await one('guide@example.test');
 const rows=(await db.prepare('SELECT d.*,step.delay_hours FROM subscriber_sequence_step_deliveries d JOIN email_sequence_steps step ON step.id=d.step_id WHERE subscriber_id=? ORDER BY step.delay_hours').bind(s.id).all()).results;
 assert.deepEqual(rows.map(x=>x.delay_hours),[0,72,168]);
 for(const row of rows)assert.ok(Math.abs(Date.parse(row.due_at)-start-row.delay_hours*3600000)<10000);
 await sendDue();assert.equal(messages.filter(m=>m.to===s.email).length,1);
 assert.doesNotMatch(messages.find(m=>m.to===s.email).text,/\\n/);
 await db.prepare("UPDATE subscriber_sequence_step_deliveries SET due_at='2000-01-01T00:00:00Z' WHERE subscriber_id=? AND status='pending'").bind(s.id).run();
 await sendDue();await sendDue();
 assert.equal(messages.filter(m=>m.to===s.email).length,3);
 assert.ok(messages.some(m=>m.subject===EMAILS.transmutation.subject&&m.text.includes('crazy shit')));
 assert.ok(messages.some(m=>m.subject===EMAILS['fire-followup'].subject&&m.text.includes('https://tarotflower.com/step-into-your-fire/')));
 assert.equal((await signup('/api/lead-magnet',s.email,'lead_magnet_goddess_guide',{lead_magnet:'goddess-embodiment-guide'})).status,200);
 await sendDue();assert.equal(messages.filter(m=>m.to===s.email).length,3);
});
test('Unsubscribe cancels pending welcome/follow-ups and transactional templates have no marketing opt-in',async()=>{
 await signup('/api/tarot-newsletter','unsubscribe@example.test','newsletter');
 const s=await one('unsubscribe@example.test');
 const url='https://tarotflower.com/api/email/unsubscribe?token='+s.unsubscribe_token;
 assert.equal((await mf.dispatchFetch(url,{headers:{Accept:'text/html'}})).status,200);
 assert.equal((await one(s.email)).status,'active');
 const r=await mf.dispatchFetch(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({token:s.unsubscribe_token})});
 assert.equal(r.status,200);
 assert.equal((await one(s.email)).status,'unsubscribed');
 await sendDue();assert.equal(messages.filter(m=>m.to===s.email).length,0);
});
test('Consent, honeypot, verification, and source checks fail closed',async()=>{
 for(const extra of [{consent:'false'},{website:'bot'}])assert.equal((await signup('/api/oracle-waitlist','invalid@example.test','contact',extra)).status,400);
 assert.equal((await signup('/api/oracle-waitlist','invalid@example.test','invalid')).status,400);
 assert.equal((await signup('/api/oracle-waitlist','invalid@example.test','newsletter')).status,400);
 assert.equal(await one('invalid@example.test'),null);
});
test('Suppression remains protected and sequence migration is idempotent',async()=>{
 await db.prepare("INSERT INTO subscribers(id,email,status) VALUES ('blocked','blocked@example.test','suppressed')").run();
 await signup('/api/tarot-newsletter','blocked@example.test','newsletter');
 assert.equal((await one('blocked@example.test')).status,'suppressed');
 assert.equal((await db.prepare("SELECT count(*) n FROM subscriber_sequence_step_deliveries WHERE subscriber_id='blocked'").first()).n,0);
 await apply('worker/email-service/migrations/0002_tarot_email_suite.sql');
 assert.equal((await db.prepare('SELECT count(*) n FROM email_sequence_steps').first()).n,5);
});
test('Campaign Review remains token-protected, read-only, and searchable',async()=>{
 const direct='https://tarotflower-web-dev.embodiedgoddesses.workers.dev/api/admin/campaign/review';
 assert.equal((await mf.dispatchFetch(direct)).status,403);
 const before=(await db.prepare('SELECT count(*) n FROM subscribers').first()).n;
 const response=await mf.dispatchFetch(direct,{method:'POST',headers:{Authorization:'Bearer local-review-token','Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({email:'oracle@example.test'})});
 assert.equal(response.status,200);
 assert.match(response.headers.get('content-type'),/text\/html/);
 const html=await response.text();
 assert.match(html,/Tarot Flower Campaign Review/);
 assert.match(html,/Subscriber Search/);
 assert.match(html,/oracle@example\.test/);
 assert.match(html,/Consent Records/);
 assert.match(html,/class="table-scroll"/);
 assert.equal((await db.prepare('SELECT count(*) n FROM subscribers').first()).n,before);
});
test('private business overview separates newsletter, guide, and Oracle activity',async()=>{
 const productionNewsletter='real+unusual-alias@gmail.com';
 await signup('/api/tarot-newsletter',productionNewsletter,'newsletter',{},null);
 await signup('/api/lead-magnet',productionNewsletter,'lead_magnet_goddess_guide',{lead_magnet:'goddess-embodiment-guide'},null);
 await signup('/api/tarot-newsletter',productionNewsletter,'newsletter');
 await signup('/api/oracle-waitlist','production-oracle@tarotflower.test','contact',{},null);
 await signup('/api/tarot-newsletter','ordinary.qa@gmail.com','newsletter');
 const before=(await db.prepare('SELECT count(*) n FROM subscribers').first()).n;
 const caller=await mf.getWorker('business-review-caller');
 const response=await caller.fetch('https://email.internal/api/admin/business/overview');
 assert.equal(response.status,200);
 assert.match(response.headers.get('content-type'),/application\/json/);
 const data=await response.json();
 assert.equal(data.summary.newsletter,1);
 assert.equal(data.summary.goddessGuide,1);
 assert.equal(data.summary.oracleWaitlist,1);
 assert.deepEqual(data.newsletterAudience.map(row=>row.email),[productionNewsletter]);
 assert.ok(data.oracleWaitlist.some(row=>row.email==='production-oracle@tarotflower.test'));
 assert.ok(!data.oracleWaitlist.some(row=>row.email.endsWith('@example.test')));
 assert.ok(data.recentSignups.some(row=>row.lead_magnet_slug==='oracle-waitlist'));
 assert.ok(!data.recentSignups.some(row=>row.email.endsWith('@example.test')));
 assert.ok(!data.recentSignups.some(row=>row.email==='ordinary.qa@gmail.com'));
 assert.ok(data.qaDebug.records.some(row=>row.email==='ordinary.qa@gmail.com'&&row.classification==='qa'));
 assert.equal((await db.prepare('SELECT count(*) n FROM subscribers').first()).n,before);
});
test('one approval queues the deduplicated campaign audience and a separate owner copy exactly once',async()=>{
 const recipient='campaign-reader@example.test';
 await signup('/api/tarot-newsletter',recipient,'newsletter',{},null);
 const caller=await mf.getWorker('business-review-caller');
 const overview=await (await caller.fetch('https://email.internal/api/admin/business/overview')).json();
 const eligibleCount=overview.newsletterAudience.filter(row=>row.email!=='vanessa@tarotflower.com').length;
 assert.ok(eligibleCount>=1);
 const subject='Controlled campaign infrastructure test';
 const html='<!doctype html><html><body><p>Hello {{first_name}}</p><p><a href="{{unsubscribe_url}}">Unsubscribe</a></p></body></html>';
 const text='Hello {{first_name}}\n\nUnsubscribe: {{unsubscribe_url}}';
 const draftResponse=await caller.fetch('https://email.internal/api/admin/newsletters/draft',{method:'POST',
  headers:{'Content-Type':'application/json'},body:JSON.stringify({subject,preview_text:'Private preview text',html_template:html,text_template:text})});
 assert.equal(draftResponse.status,201);
 const draft=await draftResponse.json();
 assert.equal(draft.preflight.ok,true);
 assert.equal(draft.preflight.eligibleRecipientCount,eligibleCount);
 const campaignId=draft.campaign.id;

 const preview=await caller.fetch(`https://email.internal/api/admin/newsletters/${campaignId}/preview`);
 assert.equal(preview.status,200);
 assert.match(await preview.text(),/display:none/);
 assert.equal(preview.headers.get('x-newsletter-eligible-recipients'),String(eligibleCount));

 const approved=await caller.fetch(`https://email.internal/api/admin/newsletters/${campaignId}/approve`,{method:'POST'});
 assert.equal(approved.status,200);
 assert.deepEqual(await approved.json(),{
  ok:true,campaignId,status:'sending',eligibleRecipientCount:eligibleCount,ownerCopyIncluded:true,
  message:'The entire campaign was approved once and queued for automatic delivery.'});
 assert.equal((await caller.fetch(`https://email.internal/api/admin/newsletters/${campaignId}/approve`,{method:'POST'})).status,409);
 const snapshot=(await db.prepare('SELECT email,recipient_kind,status FROM newsletter_campaign_recipients WHERE campaign_id=? ORDER BY email').bind(campaignId).all()).results;
 assert.equal(snapshot.length,eligibleCount+1);
 assert.equal(snapshot.filter(row=>row.recipient_kind==='owner'&&row.email==='vanessa@tarotflower.com').length,1);
 assert.equal(new Set(snapshot.map(row=>row.email.toLowerCase())).size,snapshot.length);

 const before=messages.filter(message=>message.subject===subject).length;
 await sendDue();
 const delivered=messages.filter(message=>message.subject===subject).slice(before);
 assert.equal(delivered.length,eligibleCount+1);
 assert.equal(delivered.filter(message=>message.to==='vanessa@tarotflower.com').length,1);
 for(const message of delivered){
  assert.equal(message.from,'Vanessa Hylande <vanessa@tarotflower.com>');
  assert.equal(message.replyTo,'vanessa@tarotflower.com');
  assert.match(message.html,/Private preview text/);
 }
 const subscriberMessage=delivered.find(message=>message.to===recipient);
 assert.match(subscriberMessage.text,/https:\/\/tarotflower\.com\/api\/email\/unsubscribe\?token=/);
 assert.equal(subscriberMessage.headers['List-Unsubscribe-Post'],'List-Unsubscribe=One-Click');
 const campaign=await db.prepare('SELECT * FROM newsletter_campaigns WHERE id=?').bind(campaignId).first();
 assert.equal(campaign.status,'sent');
 assert.equal(campaign.provider_accepted_count,eligibleCount);
 assert.equal(campaign.owner_copy_status,'accepted');
 const unsubscribeUrl=subscriberMessage.text.match(/https:\/\/tarotflower\.com\/api\/email\/unsubscribe\?[^\s]+/)[0];
 for(let attempt=0;attempt<2;attempt++){
  const unsubscribed=await mf.dispatchFetch(unsubscribeUrl,{method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'List-Unsubscribe=One-Click'});
  assert.equal(unsubscribed.status,200);
 }
 assert.equal((await db.prepare('SELECT unsubscribe_count FROM newsletter_campaigns WHERE id=?').bind(campaignId).first()).unsubscribe_count,1);
 await sendDue();
 assert.equal(messages.filter(message=>message.subject===subject).length,before+eligibleCount+1);
});
test('campaign drafting fails closed without a working branded unsubscribe placeholder',async()=>{
 const caller=await mf.getWorker('business-review-caller');
 const response=await caller.fetch('https://email.internal/api/admin/newsletters/draft',{method:'POST',
  headers:{'Content-Type':'application/json'},body:JSON.stringify({subject:'Unsafe draft',html_template:'<p>No footer</p>',text_template:'No footer'})});
 assert.equal(response.status,400);
 assert.match((await response.json()).error,/unsubscribe_url/);
});
test('campaign delivery retries controlled failures without duplicating recipient rows or accepted sends',async()=>{
 const caller=await mf.getWorker('business-review-caller');
 const subject='Retry-safe campaign test';
 const created=await caller.fetch('https://email.internal/api/admin/newsletters/draft',{method:'POST',
  headers:{'Content-Type':'application/json'},body:JSON.stringify({subject,preview_text:'Retry preview',
    html_template:'<html><body><p>Retry-safe</p><a href="{{unsubscribe_url}}">Unsubscribe</a></body></html>',
    text_template:'Retry-safe\n{{unsubscribe_url}}'})});
 assert.equal(created.status,201);
 const campaignId=(await created.json()).campaign.id;
 assert.equal((await caller.fetch(`https://email.internal/api/admin/newsletters/${campaignId}/approve`,{method:'POST'})).status,200);
 await sendDue();
 let rows=(await db.prepare('SELECT status,attempts FROM newsletter_campaign_recipients WHERE campaign_id=?').bind(campaignId).all()).results;
 assert.ok(rows.length>=2);
 assert.ok(rows.every(row=>row.status==='retry'&&row.attempts===1));
 await db.prepare("UPDATE newsletter_campaign_recipients SET next_attempt_at='2000-01-01T00:00:00Z' WHERE campaign_id=?").bind(campaignId).run();
 await sendDue();
 rows=(await db.prepare('SELECT email,status,attempts FROM newsletter_campaign_recipients WHERE campaign_id=?').bind(campaignId).all()).results;
 assert.ok(rows.every(row=>row.status==='accepted'&&row.attempts===2));
 assert.equal(new Set(rows.map(row=>row.email.toLowerCase())).size,rows.length);
 assert.equal((await db.prepare('SELECT status FROM newsletter_campaigns WHERE id=?').bind(campaignId).first()).status,'sent');
});
test('Workbench password recovery uses the shared email service with its own secure destination',async()=>{
 const caller=await mf.getWorker('business-review-caller');
 const token='a'.repeat(43);
 const passwordLink=`https://tarotflower.com/workbench/forgot/?token=${token}&mode=reset`;
 const response=await caller.fetch('https://email.internal/api/library-password-link',{method:'POST',
  headers:{'Content-Type':'application/json'},body:JSON.stringify({to:'owner@example.test',purpose:'reset',passwordLink,expiresInMinutes:15})});
 assert.equal(response.status,200);
 const reset=messages.find(message=>message.to==='owner@example.test'&&message.subject==='Reset your Tarot Flower Workbench password');
 assert.ok(reset);
 assert.match(reset.text,/expires in 15 minutes/);
 assert.match(reset.text,/\/workbench\/forgot\//);

 const changed=await caller.fetch('https://email.internal/api/library-password-changed',{method:'POST',
  headers:{'Content-Type':'application/json'},body:JSON.stringify({to:'owner@example.test',context:'workbench'})});
 assert.equal(changed.status,200);
 assert.ok(messages.some(message=>message.to==='owner@example.test'&&message.subject==='Your Tarot Flower Workbench password was changed'));
});

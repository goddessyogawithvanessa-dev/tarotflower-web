import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),runtime=createRequire(require.resolve('wrangler/package.json'))('miniflare');
test('Companion-first link establishes owned access, downloads the PDF, and preserves ritual return',async()=>{
 const options={modulesRoot:new URL('../',import.meta.url).pathname,
   modules:['worker/index.js','worker/workbench/access.js','worker/circle/identity.js','worker/circle/passwords.js','worker/circle/consent.js']
     .map(f=>({type:'ESModule',path:new URL('../'+f,import.meta.url).pathname})),
   compatibilityFlags:['nodejs_compat'],compatibilityDate:'2026-07-18',d1Databases:['LIBRARY_DB'],r2Buckets:['LIBRARY_ASSETS'],
   bindings:{APP_ORIGIN:'http://localhost',LIBRARY_TEST_MODE:'true',FIRE_COMPANION_ASSET_ID:'guide',TOKEN_PEPPER:'test-only-32-character-token-pepper'}};
 const mf=new runtime.Miniflare(runtime.convertV4MiniflareOptions?runtime.convertV4MiniflareOptions(options):options);
 try{
  const db=await mf.getD1Database('LIBRARY_DB'),bucket=await mf.getR2Bucket('LIBRARY_ASSETS');
  for(const file of ['worker/schema.sql','worker/seed.sql']){
   const sql=await readFile(new URL('../'+file,import.meta.url),'utf8');
   for(const stmt of sql.replace(/^--.*$/gm,'').split(';').filter(s=>s.trim()))await db.prepare(stmt).run();
  }
  await bucket.put('production/step-into-your-fire/step-into-your-fire-grimoire.pdf','%PDF-local-companion');
  const now=Math.floor(Date.now()/1000),email='companion@example.test',token='local-only-companion-proof';
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  const hash=Buffer.from(bytes).toString('hex');
  await db.prepare('INSERT INTO customers(email,created_at,updated_at) VALUES (?,?,?)').bind(email,now,now).run();
  await db.prepare("INSERT INTO purchases(stripe_checkout_session_id,customer_email,product_id,amount_total,currency,payment_status,purchased_at) VALUES ('local-test',?,'ritual-step-into-the-fire-test',0,'usd','paid',?)").bind(email,now).run();
  await db.prepare('INSERT INTO entitlements(customer_email,product_id,source_checkout_session_id,granted_at) VALUES (?,?,?,?)')
   .bind(email,'ritual-step-into-the-fire-test','local-test',now).run();
  await db.prepare('INSERT INTO magic_links(token_hash,customer_email,product_id,destination_path,requested_ip_hash,created_at,expires_at) VALUES (?,?,?,?,?,?,?)')
   .bind(hash,email,'ritual-step-into-the-fire-test','/library/rituals/step-into-your-fire/','local',now,now+900).run();
  const url='http://localhost/library/auth?token='+token+'&companion=guide';
  const first=await mf.dispatchFetch(url,{redirect:'manual'});
  assert.equal(first.status,302);
  assert.equal(first.headers.get('location'),'http://localhost/api/library/files/step-into-your-fire/guide?download=1');
  const cookie=first.headers.get('set-cookie').split(';')[0];
  const pdf=await mf.dispatchFetch(first.headers.get('location'),{headers:{Cookie:cookie}});
  assert.equal(pdf.status,200);assert.match(await pdf.text(),/%PDF-local-companion/);
  const ritual=await mf.dispatchFetch('http://localhost/library/auth?token='+token,{headers:{Cookie:cookie},redirect:'manual'});
  assert.equal(ritual.headers.get('location'),'http://localhost/library/rituals/step-into-your-fire/');
  const forged=await mf.dispatchFetch('http://localhost/library/auth?token='+token+'&companion=music',{headers:{Cookie:cookie},redirect:'manual'});
  assert.equal(forged.headers.get('location'),'http://localhost/library/rituals/step-into-your-fire/');
 }finally{await mf.dispose();}
});

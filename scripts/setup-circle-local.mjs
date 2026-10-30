import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const circle = process.argv[2];
if (!circle || !path.isAbsolute(circle)) throw new Error('Pass the absolute path of the Moonlight Circle repository.');
const local = path.join(root, '.local/circle');
await fs.mkdir(local, { recursive: true });
const config = { name: 'circle-identity-local', main: '../../worker/index.js', compatibility_date: '2026-07-18', compatibility_flags: ['nodejs_compat'],
  assets: { directory: '../../dist', binding: 'ASSETS', run_worker_first: true },
  d1_databases: [{ binding: 'LIBRARY_DB', database_name: 'circle-identity-local', database_id: '11111111-1111-4111-8111-111111111111' }],
  r2_buckets: [{ binding: 'LIBRARY_ASSETS', bucket_name: 'circle-local-unused' }] };
await fs.writeFile(path.join(local, 'wrangler.json'), JSON.stringify(config, null, 2));
let bridge;
try {
  const vars = await fs.readFile(path.join(local, '.dev.vars'), 'utf8');
  bridge = vars.match(/^CIRCLE_LOCAL_BRIDGE_SECRET=(.+)$/m)?.[1];
} catch {}
bridge ||= randomBytes(32).toString('hex');
const identityVars = { APP_ORIGIN: 'http://127.0.0.1:8787', CIRCLE_ORIGIN: 'http://localhost:3010',
  CIRCLE_DEV_MODE: 'true', CIRCLE_LOCAL_BRIDGE_SECRET: bridge, CIRCLE_OWNER_EMAIL: 'owner@example.test',
  LIBRARY_TEST_MODE: 'true', TOKEN_PEPPER: randomBytes(32).toString('hex') };
await fs.writeFile(path.join(local, '.dev.vars'), Object.entries(identityVars).map(([k,v]) => k+'='+v).join('\n')+'\n', { mode: 0o600 });
const circleVars = { CIRCLE_ORIGIN: 'http://localhost:3010', CIRCLE_DEV_MODE: 'true', CIRCLE_LOCAL_IDENTITY_ORIGIN: 'http://127.0.0.1:8787',
  CIRCLE_LOCAL_BRIDGE_SECRET: bridge, CIRCLE_COOKIE_SECRET: randomBytes(32).toString('hex') };
try { await fs.access(path.join(circle, '.dev.vars')); }
catch { await fs.writeFile(path.join(circle, '.dev.vars'), Object.entries(circleVars).map(([k,v]) => k+'='+v).join('\n')+'\n', { mode: 0o600 }); }
const fixture = `
INSERT OR IGNORE INTO circle_eligibility(id,email,source_id,reason,evidence_reference,granted_by,granted_at) VALUES
 ('local-owner-grant','owner@example.test','personal-invitation','Local owner fixture','local-owner','local-fixture',unixepoch()),
 ('local-retreat-grant','member@example.test','goddess-yoga-retreat','Local retreat fixture','local-retreat','local-fixture',unixepoch()),
 ('local-legacy-grant','legacy@example.test','legacy-moonlight-circle','Local legacy fixture','local-legacy','local-fixture',unixepoch());
INSERT OR IGNORE INTO customers(email,stripe_customer_id,created_at,updated_at) VALUES ('ritual@example.test','cus_local_circle_fixture',unixepoch(),unixepoch());
INSERT OR IGNORE INTO purchases(stripe_checkout_session_id,customer_email,product_id,amount_total,currency,payment_status,purchased_at)
 VALUES ('cs_local_circle_fixture','ritual@example.test','ritual-step-into-the-fire-test',1000,'eur','paid',unixepoch());
INSERT OR IGNORE INTO entitlements(customer_email,product_id,source_checkout_session_id,granted_at)
 VALUES ('ritual@example.test','ritual-step-into-the-fire-test','cs_local_circle_fixture',unixepoch());
`;
await fs.writeFile(path.join(local, 'fixtures.sql'), fixture);
for (const file of ['worker/schema.sql','worker/circle/schema.sql','worker/seed.sql','.local/circle/fixtures.sql']) {
 const result = spawnSync(path.join(root,'node_modules/.bin/wrangler'), ['d1','execute','circle-identity-local','--local','--config','.local/circle/wrangler.json','--persist-to','.wrangler/circle-local','--file',file],
  { cwd: root, env: { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: path.join(local,'wrangler.log') }, encoding: 'utf8' });
 if (result.status !== 0) throw new Error(result.stderr || result.stdout);
}
const dbCommand = args => spawnSync(path.join(root,'node_modules/.bin/wrangler'), ['d1','execute','circle-identity-local','--local','--config','.local/circle/wrangler.json','--persist-to','.wrangler/circle-local',...args],
  { cwd: root, env: { ...process.env, WRANGLER_SEND_METRICS:'false', WRANGLER_LOG_PATH:path.join(local,'wrangler.log') }, encoding:'utf8' });
const columns = dbCommand(['--command','PRAGMA table_info(circle_sessions)','--json']);
if (columns.status !== 0) throw new Error('Could not inspect the isolated local schema.');
if (!JSON.parse(columns.stdout)[0].results.some(column => column.name === 'credential_version')) {
  const upgrade = dbCommand(['--file','worker/migrations/0007_identity_passwords.sql']);
  if (upgrade.status !== 0) throw new Error(upgrade.stderr || upgrade.stdout);
}
console.log('Isolated local Circle database ready. Fixtures: owner@example.test, member@example.test, legacy@example.test, ritual@example.test. Use first-entry password setup. No email was sent.');

import { mkdir, access, copyFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(projectRoot, '.local', 'library-assets', 'test', 'step-into-the-fire');
const wrangler = join(projectRoot, 'node_modules', '.bin', 'wrangler');
const devVarsPath = join(projectRoot, '.dev.vars');

await mkdir(fixtureRoot, { recursive: true });
await ensureDevVars();

const pdfPath = join(fixtureRoot, 'ritual-guide.pdf');
const mp3Path = join(fixtureRoot, 'original-music.mp3');
const videoPath = join(fixtureRoot, 'movement-practice.mp4');

await writeFile(pdfPath, createTestPdf());
await copyFile(
  join(projectRoot, 'public', 'audio', 'digital-rituals', 'warrior-goddess-snippet.mp3'),
  mp3Path,
);
await ensureTestVideo(videoPath);

await runWrangler(['d1', 'execute', 'tarotflower-library', '--local', '--file=worker/schema.sql']);
await runWrangler(['d1', 'execute', 'tarotflower-library', '--local', '--file=worker/seed.sql']);
await upload('test/step-into-the-fire/ritual-guide.pdf', pdfPath, 'application/pdf');
await upload('test/step-into-the-fire/original-music.mp3', mp3Path, 'audio/mpeg');
await upload('test/step-into-the-fire/movement-practice.mp4', videoPath, 'video/mp4');

console.log('Local Digital Ritual library resources are ready.');

async function ensureDevVars() {
  try {
    await access(devVarsPath, constants.F_OK);
    return;
  } catch {
    const pepper = randomBytes(32).toString('hex');
    const content = [
      'APP_ORIGIN=http://127.0.0.1:8787',
      'LIBRARY_TEST_MODE=true',
      'STRIPE_SECRET_KEY=sk_test_local_prototype',
      'STRIPE_WEBHOOK_SECRET=whsec_local_prototype',
      'TURNSTILE_SITE_KEY=1x00000000000000000000AA',
      'TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA',
      'TURNSTILE_EXPECTED_HOSTNAME=127.0.0.1',
      `TOKEN_PEPPER=${pepper}`,
      '',
    ].join('\n');
    await writeFile(devVarsPath, content, { mode: 0o600 });
  }
}

async function ensureTestVideo(destination) {
  try {
    await access(destination, constants.F_OK);
    return;
  } catch {
    const response = await fetch('https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4');
    if (!response.ok) throw new Error(`Unable to obtain the CC0 local video fixture (${response.status})`);
    await writeFile(destination, new Uint8Array(await response.arrayBuffer()));
  }
}

async function upload(key, file, contentType) {
  await runWrangler([
    'r2',
    'object',
    'put',
    `tarotflower-digital-rituals/${key}`,
    '--local',
    `--file=${file}`,
    `--content-type=${contentType}`,
  ]);
}

async function runWrangler(args) {
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(wrangler, args, {
      cwd: projectRoot,
      env: {
        ...process.env,
        XDG_CONFIG_HOME: join(projectRoot, '.local', 'config'),
        WRANGLER_LOG_PATH: join(projectRoot, '.local', 'wrangler.log'),
      },
      stdio: 'inherit',
    });
    child.once('error', rejectPromise);
    child.once('exit', (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`Wrangler exited with code ${code}`));
    });
  });
}

function createTestPdf() {
  const stream = 'BT /F1 24 Tf 72 720 Td (Tarot Flower Digital Ritual Test Guide) Tj 0 -42 Td /F1 13 Tf (Private delivery system prototype - not a finished product.) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let content = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(content));
    content += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(content);
  content += `xref\n0 ${objects.length + 1}\n`;
  content += '0000000000 65535 f \n';
  for (const offset of offsets.slice(1)) content += `${String(offset).padStart(10, '0')} 00000 n \n`;
  content += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(content);
}

import { scryptSync, timingSafeEqual, randomBytes } from 'node:crypto';

// OWASP's 32 MiB scrypt profile. Native crypto keeps memory bounded, without a JS/WASM KDF.
const OPTIONS = { N: 32768, r: 8, p: 3, maxmem: 48 * 1024 * 1024 };
const PREFIX = 'scrypt$32768$8$3';
const DUMMY_SALT = '00000000000000000000000000000000';
const common = new Set(['password12', 'password123', 'passwordpassword', 'passwordpassword1', 'password123456789',
  '1234567890', '123456789012345', '1234567890123456', 'qwerty1234', 'qwertyuiopasdfgh', 'letmein123',
  'letmeinletmeinletmein', 'iloveyou12', 'iloveyouiloveyou', 'moonlightcircle', 'moonlightcircle123',
  'correct horse battery staple']);
export const normalizePassword = value => typeof value === 'string' ? value.normalize('NFC') : '';
export function passwordError(value, email) {
  const password = normalizePassword(value), length = [...password].length;
  if (length < 10 || length > 128) return 'Use 10–128 characters. A few memorable words work well.';
  const lower = password.toLowerCase();
  if (common.has(lower) || /^(.)\1+$/u.test(password) || lower.includes(email.toLowerCase()) ||
    lower.includes('moonlightcircle') || lower.includes('tarotflower')) return 'Please choose a less predictable password.';
  return null;
}
export function hashPassword(value) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(normalizePassword(value), salt, 32, OPTIONS).toString('hex');
  return `${PREFIX}$${salt}$${hash}`;
}
export function verifyPassword(value, encoded) {
  const parts = typeof encoded === 'string' ? encoded.split('$') : [];
  const valid = parts.length === 6 && parts.slice(0,4).join('$') === PREFIX &&
    /^[a-f0-9]{32}$/.test(parts[4]) && /^[a-f0-9]{64}$/.test(parts[5]);
  // The same expensive comparison runs for unknown accounts and accounts without a password.
  const actual = scryptSync(normalizePassword(value), valid ? parts[4] : DUMMY_SALT, 32, OPTIONS);
  const expected = Buffer.from(valid ? parts[5] : '00'.repeat(32), 'hex');
  return timingSafeEqual(actual, expected) && valid;
}

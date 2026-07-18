import crypto from 'node:crypto';

const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function generateAccessCode(): string {
  let value = '';
  for (let index = 0; index < 28; index++) {
    value += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return value.match(/.{1,4}/g)!.join('-');
}

export function normalizeAccessCode(value: string): string {
  return value.toUpperCase().replace(/[^2-9A-HJ-NP-Z]/g, '');
}

export function hashAccessToken(value: string): string {
  return crypto.createHash('sha256').update(normalizeAccessCode(value), 'utf8').digest('hex');
}

export function generateLinkToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashLinkToken(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

export function normalizePhoneNumber(value: string): string | null {
  let phone = value.trim().replace(/[^\d+]/g, '');
  if (phone.startsWith('0') && phone.length === 10) phone = `+61${phone.slice(1)}`;
  else if (phone.startsWith('61') && phone.length === 11) phone = `+${phone}`;
  else if (!phone.startsWith('+') && phone.length === 9) phone = `+61${phone}`;
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}

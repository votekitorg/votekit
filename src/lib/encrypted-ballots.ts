export const ENCRYPTED_BALLOT_PROTOCOL = 'votekit-encrypted-ballot-v1';
export const DEFAULT_ENVELOPE_PLAINTEXT_BYTES = 16_384;
export const DEFAULT_PRIVACY_THRESHOLD = 20;

export interface EncryptedQuestionManifest {
  id: string;
  type: 'yes_no' | 'multiple_choice' | 'ranked_choice' | 'condorcet';
  options: string[];
  preferentialType: 'compulsory' | 'optional';
  continueAfterMajority?: boolean;
}

export interface EncryptedElectionManifest {
  protocol: typeof ENCRYPTED_BALLOT_PROTOCOL;
  electionId: number;
  electionSlug: string;
  closeDate: string;
  envelopePlaintextBytes: number;
  questions: EncryptedQuestionManifest[];
}

export interface EncryptedBallotPackage {
  protocol: typeof ENCRYPTED_BALLOT_PROTOCOL;
  wrappedKey: string;
  iv: string;
  ciphertext: string;
}

export interface PublishedEncryptedBallot {
  receipt: string;
  answers: Record<string, unknown>;
}

export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;

  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonicalStringify(object[key])}`).join(',')}}`;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64url');
  }
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

export async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

export async function hashManifest(manifest: EncryptedElectionManifest): Promise<string> {
  return sha256Base64Url(canonicalStringify(manifest));
}

function base64UrlLength(byteLength: number): number {
  return Math.ceil(byteLength * 8 / 6);
}

export function parseEncryptedPackage(value: unknown, plaintextBytes?: number): EncryptedBallotPackage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.protocol !== ENCRYPTED_BALLOT_PROTOCOL ||
    typeof candidate.wrappedKey !== 'string' ||
    typeof candidate.iv !== 'string' ||
    typeof candidate.ciphertext !== 'string'
  ) return null;

  // RSA-OAEP-3072 is 384 bytes, AES-GCM uses a 96-bit IV, and the ciphertext
  // is the fixed plaintext size plus its 128-bit authentication tag.
  if (candidate.wrappedKey.length !== 512 || candidate.iv.length !== 16) return null;
  if (![candidate.wrappedKey, candidate.iv, candidate.ciphertext].every(part => /^[A-Za-z0-9_-]+$/u.test(part))) return null;
  if (plaintextBytes && candidate.ciphertext.length !== base64UrlLength(plaintextBytes + 16)) return null;
  return candidate as unknown as EncryptedBallotPackage;
}

export function isReceipt(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/u.test(value);
}

export function validatePublishedBallot(manifest: EncryptedElectionManifest, value: unknown): value is PublishedEncryptedBallot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const ballot = value as Record<string, unknown>;
  if (!isReceipt(ballot.receipt) || !ballot.answers || typeof ballot.answers !== 'object' || Array.isArray(ballot.answers)) return false;
  const answers = ballot.answers as Record<string, unknown>;
  if (Object.keys(answers).length !== manifest.questions.length) return false;

  return manifest.questions.every(question => {
    const answer = answers[question.id];
    if (question.type === 'yes_no') return typeof answer === 'string' && question.options.includes(answer);
    if (question.type === 'multiple_choice') {
      return Array.isArray(answer) && answer.length > 0 && new Set(answer).size === answer.length &&
        answer.every(choice => typeof choice === 'string' && question.options.includes(choice));
    }
    if (!Array.isArray(answer) || new Set(answer).size !== answer.length ||
      !answer.every(choice => typeof choice === 'string' && question.options.includes(choice))) return false;
    return question.preferentialType === 'optional'
      ? answer.length > 0 && answer.length <= question.options.length
      : answer.length === question.options.length;
  });
}

'use client';

import {
  canonicalStringify,
  EncryptedBallotPackage,
  EncryptedElectionManifest,
  ENCRYPTED_BALLOT_PROTOCOL,
  hashManifest,
  PublishedEncryptedBallot,
  sha256Base64Url
} from './encrypted-ballots';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

function asBufferSource(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}

function toBase64Url(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function additionalData(manifestHash: string, electionId: number): Uint8Array {
  return encoder.encode(canonicalStringify({
    electionId,
    manifestHash,
    protocol: ENCRYPTED_BALLOT_PROTOCOL
  }));
}

export interface EncryptedKeySetup {
  publicKeyJwk: JsonWebKey;
  encryptedPrivateKey: string;
  keyIv: string;
  closeSecret: string;
}

export async function createElectionKeys(manifestHash: string, electionId: number): Promise<EncryptedKeySetup> {
  const keyPair = await crypto.subtle.generateKey({
    name: 'RSA-OAEP',
    modulusLength: 3072,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256'
  }, true, ['encrypt', 'decrypt']) as CryptoKeyPair;

  const [publicKeyJwk, privateKeyBytes] = await Promise.all([
    crypto.subtle.exportKey('jwk', keyPair.publicKey),
    crypto.subtle.exportKey('pkcs8', keyPair.privateKey)
  ]);
  const closeSecret = randomBytes(32);
  const keyIv = randomBytes(12);
  const wrappingKey = await crypto.subtle.importKey('raw', asBufferSource(closeSecret), 'AES-GCM', false, ['encrypt']);
  const encryptedPrivateKey = await crypto.subtle.encrypt({
    name: 'AES-GCM',
    iv: asBufferSource(keyIv),
    additionalData: asBufferSource(additionalData(manifestHash, electionId)),
    tagLength: 128
  }, wrappingKey, privateKeyBytes);

  return {
    publicKeyJwk,
    encryptedPrivateKey: toBase64Url(encryptedPrivateKey),
    keyIv: toBase64Url(keyIv),
    closeSecret: toBase64Url(closeSecret)
  };
}

function encodeFixedPlaintext(value: unknown, size: number): Uint8Array {
  const json = encoder.encode(canonicalStringify(value));
  if (json.length + 4 > size) throw new Error('Ballot is too large for this election envelope');
  const output = randomBytes(size);
  new DataView(output.buffer).setUint32(0, json.length, false);
  output.set(json, 4);
  return output;
}

function decodeFixedPlaintext(value: ArrayBuffer, size: number): unknown {
  const bytes = new Uint8Array(value);
  if (bytes.length !== size) throw new Error('Invalid ballot envelope size');
  const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, false);
  if (length === 0 || length + 4 > bytes.length) throw new Error('Invalid ballot envelope content');
  return JSON.parse(decoder.decode(bytes.slice(4, 4 + length)));
}

export async function encryptBallot(
  manifest: EncryptedElectionManifest,
  manifestHash: string,
  publicKeyJwk: JsonWebKey,
  answers: Record<string, unknown>
): Promise<{ encryptedPackage: EncryptedBallotPackage; receipt: string; commitment: string }> {
  if (await hashManifest(manifest) !== manifestHash) throw new Error('Election manifest verification failed');
  const receipt = toBase64Url(randomBytes(32));
  const plaintext = encodeFixedPlaintext({
    answers,
    electionId: manifest.electionId,
    manifestHash,
    protocol: ENCRYPTED_BALLOT_PROTOCOL,
    receipt
  }, manifest.envelopePlaintextBytes);
  const ballotKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const ballotKeyBytes = await crypto.subtle.exportKey('raw', ballotKey);
  const publicKey = await crypto.subtle.importKey('jwk', publicKeyJwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
  const iv = randomBytes(12);
  const [wrappedKey, ciphertext] = await Promise.all([
    crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, ballotKeyBytes),
    crypto.subtle.encrypt({
      name: 'AES-GCM',
      iv: asBufferSource(iv),
      additionalData: asBufferSource(additionalData(manifestHash, manifest.electionId)),
      tagLength: 128
    }, ballotKey, asBufferSource(plaintext))
  ]);
  const encryptedPackage: EncryptedBallotPackage = {
    protocol: ENCRYPTED_BALLOT_PROTOCOL,
    wrappedKey: toBase64Url(wrappedKey),
    iv: toBase64Url(iv),
    ciphertext: toBase64Url(ciphertext)
  };
  return {
    encryptedPackage,
    receipt,
    commitment: await sha256Base64Url(canonicalStringify(encryptedPackage))
  };
}

export async function decryptAndShuffleBallots(input: {
  manifest: EncryptedElectionManifest;
  manifestHash: string;
  encryptedPrivateKey: string;
  keyIv: string;
  closeSecret: string;
  packages: EncryptedBallotPackage[];
}): Promise<PublishedEncryptedBallot[]> {
  const { manifest, manifestHash } = input;
  if (await hashManifest(manifest) !== manifestHash) throw new Error('Election manifest verification failed');
  const wrappingKey = await crypto.subtle.importKey('raw', asBufferSource(fromBase64Url(input.closeSecret)), 'AES-GCM', false, ['decrypt']);
  const privateKeyBytes = await crypto.subtle.decrypt({
    name: 'AES-GCM',
    iv: asBufferSource(fromBase64Url(input.keyIv)),
    additionalData: asBufferSource(additionalData(manifestHash, manifest.electionId)),
    tagLength: 128
  }, wrappingKey, asBufferSource(fromBase64Url(input.encryptedPrivateKey)));
  const privateKey = await crypto.subtle.importKey('pkcs8', privateKeyBytes, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']);

  const output: PublishedEncryptedBallot[] = [];
  for (const encryptedPackage of input.packages) {
    const ballotKeyBytes = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, asBufferSource(fromBase64Url(encryptedPackage.wrappedKey)));
    const ballotKey = await crypto.subtle.importKey('raw', ballotKeyBytes, 'AES-GCM', false, ['decrypt']);
    const plaintext = await crypto.subtle.decrypt({
      name: 'AES-GCM',
      iv: asBufferSource(fromBase64Url(encryptedPackage.iv)),
      additionalData: asBufferSource(additionalData(manifestHash, manifest.electionId)),
      tagLength: 128
    }, ballotKey, asBufferSource(fromBase64Url(encryptedPackage.ciphertext)));
    const decoded = decodeFixedPlaintext(plaintext, manifest.envelopePlaintextBytes) as Record<string, unknown>;
    if (
      decoded.protocol !== ENCRYPTED_BALLOT_PROTOCOL ||
      decoded.electionId !== manifest.electionId ||
      decoded.manifestHash !== manifestHash ||
      typeof decoded.receipt !== 'string' ||
      !decoded.answers || typeof decoded.answers !== 'object' || Array.isArray(decoded.answers)
    ) throw new Error('A ballot failed authenticated manifest validation');
    output.push({ receipt: decoded.receipt, answers: decoded.answers as Record<string, unknown> });
  }

  // Unbiased Fisher-Yates using rejection sampling, so modulo bias cannot affect
  // the published order.
  for (let index = output.length - 1; index > 0; index--) {
    const range = index + 1;
    const limit = Math.floor(0x1_0000_0000 / range) * range;
    let sample = 0;
    do sample = new DataView(randomBytes(4).buffer).getUint32(0, false); while (sample >= limit);
    const selected = sample % range;
    [output[index], output[selected]] = [output[selected], output[index]];
  }
  return output.map(ballot => ({ receipt: ballot.receipt, answers: ballot.answers }));
}

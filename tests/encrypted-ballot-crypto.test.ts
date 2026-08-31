import { describe, expect, it } from 'vitest';
import {
  createElectionKeys,
  decryptAndShuffleBallots,
  encryptBallot
} from '@/lib/browser-ballot-crypto';
import {
  canonicalStringify,
  EncryptedElectionManifest,
  ENCRYPTED_BALLOT_PROTOCOL,
  hashManifest,
  parseEncryptedPackage,
  validatePublishedBallot
} from '@/lib/encrypted-ballots';

const manifest: EncryptedElectionManifest = {
  protocol: ENCRYPTED_BALLOT_PROTOCOL,
  electionId: 42,
  electionSlug: 'encrypted-test',
  closeDate: '2030-01-01T17:00',
  envelopePlaintextBytes: 4_096,
  questions: [
    { id: 'approve', type: 'yes_no', options: ['Yes', 'No'], preferentialType: 'compulsory' },
    { id: 'rank', type: 'ranked_choice', options: ['A', 'B', 'C'], preferentialType: 'optional', continueAfterMajority: true }
  ]
};

describe('standalone encrypted ballot protocol', () => {
  it('stores equal-sized opaque envelopes and returns only complete shuffled ballots', async () => {
    const manifestHash = await hashManifest(manifest);
    const keys = await createElectionKeys(manifestHash, manifest.electionId);
    const first = await encryptBallot(manifest, manifestHash, keys.publicKeyJwk, {
      approve: 'Yes', rank: ['A']
    });
    const second = await encryptBallot(manifest, manifestHash, keys.publicKeyJwk, {
      approve: 'No', rank: ['C', 'B', 'A']
    });

    expect(canonicalStringify(first.encryptedPackage)).not.toContain('"approve":"Yes"');
    expect(canonicalStringify(second.encryptedPackage)).not.toContain('"rank":["C","B","A"]');
    expect(first.encryptedPackage.ciphertext).toHaveLength(second.encryptedPackage.ciphertext.length);
    expect(canonicalStringify(first.encryptedPackage)).toHaveLength(canonicalStringify(second.encryptedPackage).length);
    expect(first.encryptedPackage.ciphertext).not.toBe(second.encryptedPackage.ciphertext);
    expect(parseEncryptedPackage(first.encryptedPackage, manifest.envelopePlaintextBytes)).toEqual(first.encryptedPackage);

    const published = await decryptAndShuffleBallots({
      manifest, manifestHash,
      encryptedPrivateKey: keys.encryptedPrivateKey,
      keyIv: keys.keyIv,
      closeSecret: keys.closeSecret,
      packages: [first.encryptedPackage, second.encryptedPackage]
    });
    expect(published).toHaveLength(2);
    expect(new Set(published.map(ballot => ballot.receipt))).toEqual(new Set([first.receipt, second.receipt]));
    expect(published.every(ballot => validatePublishedBallot(manifest, ballot))).toBe(true);
    expect(Object.keys(published[0]).sort()).toEqual(['answers', 'receipt']);
  }, 20_000);

  it('fails closed if ciphertext or the close secret is altered', async () => {
    const manifestHash = await hashManifest(manifest);
    const keys = await createElectionKeys(manifestHash, manifest.electionId);
    const ballot = await encryptBallot(manifest, manifestHash, keys.publicKeyJwk, {
      approve: 'Yes', rank: ['A', 'B']
    });
    const replacement = ballot.encryptedPackage.ciphertext.startsWith('A') ? 'B' : 'A';
    const tampered = {
      ...ballot.encryptedPackage,
      ciphertext: replacement + ballot.encryptedPackage.ciphertext.slice(1)
    };
    await expect(decryptAndShuffleBallots({
      manifest, manifestHash,
      encryptedPrivateKey: keys.encryptedPrivateKey,
      keyIv: keys.keyIv,
      closeSecret: keys.closeSecret,
      packages: [tampered]
    })).rejects.toThrow();
    const wrongSecret = (keys.closeSecret.startsWith('A') ? 'B' : 'A') + keys.closeSecret.slice(1);
    await expect(decryptAndShuffleBallots({
      manifest, manifestHash,
      encryptedPrivateKey: keys.encryptedPrivateKey,
      keyIv: keys.keyIv,
      closeSecret: wrongSecret,
      packages: [ballot.encryptedPackage]
    })).rejects.toThrow();
  }, 20_000);
});

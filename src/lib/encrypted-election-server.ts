import db from './db';
import {
  DEFAULT_ENVELOPE_PLAINTEXT_BYTES,
  EncryptedElectionManifest,
  ENCRYPTED_BALLOT_PROTOCOL,
  hashManifest
} from './encrypted-ballots';

export const encryptedBallotsEnabled = process.env.VOTEKIT_ENCRYPTED_BALLOTS_ENABLED === 'true';

export function buildEncryptedManifest(plebiscite: any): EncryptedElectionManifest {
  const questions = db.prepare(`
    SELECT public_id, type, options, preferential_type
    FROM questions WHERE plebiscite_id = ? ORDER BY display_order, id
  `).all(plebiscite.id) as any[];
  return {
    protocol: ENCRYPTED_BALLOT_PROTOCOL,
    electionId: Number(plebiscite.id),
    electionSlug: plebiscite.slug,
    closeDate: plebiscite.close_date,
    envelopePlaintextBytes: Number(plebiscite.envelope_plaintext_bytes || DEFAULT_ENVELOPE_PLAINTEXT_BYTES),
    questions: questions.map(question => ({
      id: question.public_id,
      type: question.type,
      options: JSON.parse(question.options),
      preferentialType: question.preferential_type || 'compulsory'
    }))
  };
}

export async function buildAndHashEncryptedManifest(plebiscite: any): Promise<{
  manifest: EncryptedElectionManifest;
  manifestHash: string;
}> {
  const manifest = buildEncryptedManifest(plebiscite);
  return { manifest, manifestHash: await hashManifest(manifest) };
}


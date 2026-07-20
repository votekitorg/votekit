import crypto from 'node:crypto';
import { canonicalStringify } from '@/lib/encrypted-ballots';
import type { PlebisciteResultsData } from '@/lib/results';

export function resultsReportFingerprint(data: PlebisciteResultsData): string {
  return crypto.createHash('sha256').update(canonicalStringify(data), 'utf8').digest('hex');
}

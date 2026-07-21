import { describe, expect, it } from 'vitest';
import { resultsReportFingerprint } from '@/lib/results-integrity';
import type { PlebisciteResultsData } from '@/lib/results';

const fixture: PlebisciteResultsData = {
  plebiscite: {
    id: 1, slug: 'test', title: 'Test', description: 'Description', open_date: '2026-01-01T09:00',
    close_date: '2026-01-02T09:00', status: 'closed', accessMode: 'voter_roll', privacyMode: 'legacy', privacyThreshold: 20,
    ballotPublicationMode: 'threshold'
  },
  participation: { totalVotes: 1, eligibleCredentials: 2, participationRate: 50 },
  countRuns: [],
  questions: [{
    id: 1, publicId: 'q1', title: 'Approve?', type: 'yes_no', options: ['Yes', 'No'], totalVotes: 1,
    results: { Yes: 1, No: 0 }, publicBallots: [{ receiptCode: 'receipt', ballot: { choice: 'Yes' } }]
  }]
};

describe('results report fingerprint', () => {
  it('is stable for the same published result and changes when a count changes', () => {
    const first = resultsReportFingerprint(fixture);
    const second = resultsReportFingerprint(JSON.parse(JSON.stringify(fixture)));
    const changed = JSON.parse(JSON.stringify(fixture));
    changed.questions[0].results.Yes = 2;

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toBe(first);
    expect(resultsReportFingerprint(changed)).not.toBe(first);
  });
});

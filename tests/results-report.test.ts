import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { tabulateCondorcet } from '@/lib/condorcet';
import { tabulateIRV } from '@/lib/irv';
import type { PlebisciteResultsData } from '@/lib/results';
import { buildResultsPdf, resultsReportFilename } from '@/lib/results-report';

const irv = tabulateIRV([
  { preferences: ['Community Hall', 'Town Square', 'Sports Pavilion'] },
  { preferences: ['Community Hall', 'Sports Pavilion', 'Town Square'] },
  { preferences: ['Town Square', 'Community Hall', 'Sports Pavilion'] },
  { preferences: ['Town Square', 'Community Hall', 'Sports Pavilion'] },
  { preferences: ['Sports Pavilion', 'Community Hall', 'Town Square'] }
], ['Community Hall', 'Town Square', 'Sports Pavilion']);

const fullDistribution = tabulateIRV([
  { preferences: ['Community Hall', 'Town Square', 'Sports Pavilion'] },
  { preferences: ['Community Hall', 'Town Square', 'Sports Pavilion'] },
  { preferences: ['Community Hall', 'Sports Pavilion', 'Town Square'] },
  { preferences: ['Community Hall', 'Sports Pavilion', 'Town Square'] },
  { preferences: ['Town Square', 'Community Hall', 'Sports Pavilion'] },
  { preferences: ['Town Square', 'Community Hall', 'Sports Pavilion'] },
  { preferences: ['Sports Pavilion', 'Town Square', 'Community Hall'] }
], ['Community Hall', 'Town Square', 'Sports Pavilion'], [], { continueAfterMajority: true });

const condorcet = tabulateCondorcet([
  { preferences: ['Option A', 'Option B', 'Option C'] },
  { preferences: ['Option A', 'Option B', 'Option C'] },
  { preferences: ['Option B', 'Option C', 'Option A'] },
  { preferences: ['Option C', 'Option A', 'Option B'] },
  { preferences: ['Option C', 'Option A', 'Option B'] }
], ['Option A', 'Option B', 'Option C']);

const fixture: PlebisciteResultsData = {
  plebiscite: {
    id: 42,
    slug: 'community-priorities-2026',
    title: 'Community Priorities and Facilities Election 2026',
    description: 'An intentionally detailed election description used to verify that official reports remain clear, balanced and readable across several voting methods.',
    open_date: '2026-07-01T09:00',
    close_date: '2026-07-15T17:00',
    status: 'closed',
    accessMode: 'anonymous_codes',
    privacyMode: 'encrypted',
    privacyThreshold: 20,
    ballotPublicationMode: 'threshold'
  },
  participation: {
    totalVotes: 75,
    eligibleCredentials: 100,
    ballotsDistributed: 90,
    ballotsDistributedSource: 'administrator_reported',
    participationRate: 83.3333333333,
    distributionAdjustments: [{
      id: 1,
      ballotsDistributed: 90,
      previousBallotsDistributed: 100,
      generatedCredentials: 100,
      reason: 'Ten members opted out of email communications.',
      adjustedByName: 'Returning Officer',
      createdAt: '2026-07-16 03:00:00'
    }]
  },
  encryptedAudit: {
    manifest: {
      protocol: 'votekit-encrypted-ballot-v1',
      electionId: 42,
      electionSlug: 'community-priorities-2026',
      closeDate: '2026-07-15T17:00',
      envelopePlaintextBytes: 16_384,
      questions: []
    },
    manifestHash: 'a'.repeat(64),
    inputHash: 'b'.repeat(64),
    outputHash: 'c'.repeat(64)
  },
  countRuns: [{
    id: 7,
    plebisciteId: 42,
    questionId: 3,
    questionTitle: 'Rank the preferred location for the new community venue',
    method: 'irv',
    status: 'complete',
    result: fullDistribution,
    settings: {
      primaryMethod: 'irv',
      algorithm: 'votekit-irv-full-distribution-v1',
      preferentialType: 'compulsory',
      continueAfterMajority: true,
      options: ['Community Hall', 'Town Square', 'Sports Pavilion'],
      tieResolutions: []
    },
    sourceBallotHash: 'd'.repeat(64),
    resultHash: 'e'.repeat(64),
    createdByName: 'Returning Officer',
    createdAt: '2026-07-20 03:00:00'
  }],
  questions: [
    {
      id: 1,
      publicId: 'question-1',
      title: 'Do you approve the proposed community facilities plan?',
      description: 'A straightforward yes or no proposition.',
      type: 'yes_no',
      options: ['Yes', 'No'],
      totalVotes: 75,
      results: { Yes: 51, No: 24 },
      publicBallots: []
    },
    {
      id: 2,
      publicId: 'question-2',
      title: 'Which projects should receive priority funding?',
      description: 'Voters could select more than one project, so selection totals are distinct from ballot totals.',
      type: 'multiple_choice',
      options: [
        'Accessible playground and inclusive recreation equipment for children of all abilities',
        'Expanded library study areas and digital access facilities',
        'Protected walking and cycling connections between neighbourhood centres'
      ],
      totalVotes: 75,
      results: {
        'Accessible playground and inclusive recreation equipment for children of all abilities': 0,
        'Expanded library study areas and digital access facilities': 48,
        'Protected walking and cycling connections between neighbourhood centres': 61
      },
      publicBallots: []
    },
    {
      id: 3,
      publicId: 'question-3',
      title: 'Rank the preferred location for the new community venue',
      type: 'ranked_choice',
      options: ['Community Hall', 'Town Square', 'Sports Pavilion'],
      totalVotes: irv.totalVotes,
      results: {
        winner: irv.winner,
        rounds: irv.rounds,
        totalVotes: irv.totalVotes,
        exhaustedBallots: irv.exhaustedBallots
      },
      publicBallots: []
    },
    {
      id: 4,
      publicId: 'question-4',
      title: 'Rank the long-term strategic options',
      type: 'condorcet',
      options: ['Option A', 'Option B', 'Option C'],
      totalVotes: condorcet.totalVotes,
      results: condorcet,
      publicBallots: []
    }
  ]
};

describe('official results PDF', () => {
  it('uses a safe election-specific filename', () => {
    expect(resultsReportFilename(fixture.plebiscite.slug)).toBe('community-priorities-2026-official-results.pdf');
    expect(resultsReportFilename('../../Untrusted election\r\nname')).toBe('untrusted-election-name-official-results.pdf');
  });

  it('renders every supported method and audit section as a multi-page vector PDF', async () => {
    const pdf = await buildResultsPdf(fixture, new Date('2026-07-20T02:00:00Z'));

    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(12_000);
    expect((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length).toBeGreaterThanOrEqual(7);
    if (process.env.RESULTS_PDF_ALL_METHODS_OUTPUT) {
      fs.writeFileSync(process.env.RESULTS_PDF_ALL_METHODS_OUTPUT, pdf);
    }
  });
});

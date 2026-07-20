import { describe, expect, it } from 'vitest';
import { tabulateIRV, validateIRVVote } from '@/lib/irv';

describe('tabulateIRV', () => {
  it('declares a first-round winner on a majority', () => {
    const result = tabulateIRV(
      [{ preferences: ['A'] }, { preferences: ['A'] }, { preferences: ['B'] }],
      ['A', 'B']
    );
    expect(result.winner).toBe('A');
    expect(result.rounds).toHaveLength(1);
    expect(result.rounds[0].votes).toEqual({ A: 2, B: 1 });
  });

  it('transfers eliminated candidates’ ballots to next preferences', () => {
    const result = tabulateIRV(
      [
        { preferences: ['A'] },
        { preferences: ['A'] },
        { preferences: ['B'] },
        { preferences: ['B'] },
        { preferences: ['C', 'A'] }
      ],
      ['A', 'B', 'C']
    );
    expect(result.rounds[0].eliminated).toEqual(['C']);
    expect(result.winner).toBe('A');
    expect(result.rounds[1].votes).toEqual({ A: 3, B: 2 });
  });

  it('reports a final-two exact tie instead of picking a winner', () => {
    const result = tabulateIRV(
      [{ preferences: ['A'] }, { preferences: ['B'] }],
      ['A', 'B']
    );
    expect(result.winner).toBeNull();
    expect(result.rounds[0].tiedCandidates).toEqual(['A', 'B']);
    expect(result.pendingTie).toEqual({ round: 1, type: 'winner', tiedCandidates: ['A', 'B'] });
  });

  it('reports an all-candidates tie instead of eliminating everyone', () => {
    const result = tabulateIRV(
      [{ preferences: ['A'] }, { preferences: ['B'] }, { preferences: ['C'] }],
      ['A', 'B', 'C']
    );
    expect(result.winner).toBeNull();
    expect(result.rounds[0].tiedCandidates).toEqual(['A', 'B', 'C']);
  });

  it('pauses instead of batch-eliminating tied lowest candidates', () => {
    const result = tabulateIRV(
      [
        { preferences: ['A'] },
        { preferences: ['A'] },
        { preferences: ['A'] },
        { preferences: ['B'] },
        { preferences: ['B'] },
        { preferences: ['C'] },
        { preferences: ['D', 'A'] }
      ],
      ['A', 'B', 'C', 'D']
    );
    expect(result.rounds[0].eliminated).toEqual([]);
    expect(result.pendingTie).toEqual({ round: 1, type: 'exclusion', tiedCandidates: ['C', 'D'] });
    expect(result.winner).toBeNull();
  });

  it('continues after an audited tied-exclusion resolution and elects the sole remaining candidate', () => {
    const votes = [
      { preferences: ['A'] }, { preferences: ['A'] }, { preferences: ['A'] },
      { preferences: ['B'] }, { preferences: ['B'] },
      { preferences: ['C'] }, { preferences: ['D', 'A'] }
    ];
    const result = tabulateIRV(votes, ['A', 'B', 'C', 'D'], [{
      round: 1,
      type: 'exclusion',
      tiedCandidates: ['C', 'D'],
      selectedCandidate: 'D',
      method: 'drawing_lots'
    }]);

    expect(result.rounds[0].eliminated).toEqual(['D']);
    expect(result.rounds[0].tieBreak?.method).toBe('drawing_lots');
    expect(result.winner).toBe('A');
  });

  it('uses the most recent distinguishing count to resolve a later exclusion tie', () => {
    const result = tabulateIRV([
      { preferences: ['A'] }, { preferences: ['A'] }, { preferences: ['A'] }, { preferences: ['A'] },
      { preferences: ['B', 'A'] }, { preferences: ['B', 'A'] },
      { preferences: ['C'] }, { preferences: ['C'] }, { preferences: ['C'] },
      { preferences: ['X', 'B', 'A'] }
    ], ['A', 'B', 'C', 'X']);

    expect(result.rounds[0].eliminated).toEqual(['X']);
    expect(result.rounds[1].votes).toEqual({ A: 4, B: 3, C: 3 });
    expect(result.rounds[1].eliminated).toEqual(['B']);
    expect(result.rounds[1].tieBreak).toMatchObject({ method: 'countback', selectedCandidate: 'B', sourceRound: 1 });
    expect(result.winner).toBe('A');
  });

  it('accepts an audited final-tie winner resolution', () => {
    const result = tabulateIRV(
      [{ preferences: ['A'] }, { preferences: ['B'] }],
      ['A', 'B'],
      [{ round: 1, type: 'winner', tiedCandidates: ['A', 'B'], selectedCandidate: 'B', method: 'governing_rules', note: 'Casting vote under rule 12' }]
    );
    expect(result.winner).toBe('B');
    expect(result.rounds[0].tieBreak).toMatchObject({ method: 'governing_rules', selectedCandidate: 'B' });
  });

  it('counts ballots with no remaining preferences as exhausted', () => {
    const result = tabulateIRV(
      [
        { preferences: ['A'] },
        { preferences: ['A'] },
        { preferences: ['B'] },
        { preferences: ['B'] },
        { preferences: ['C'] }
      ],
      ['A', 'B', 'C']
    );
    // The lone [C] ballot has nowhere to transfer once C is eliminated.
    expect(result.exhaustedBallots).toBe(1);
  });
});

describe('validateIRVVote', () => {
  const candidates = ['A', 'B', 'C'];

  it('accepts a partial unique ranking', () => {
    expect(validateIRVVote(['B', 'A'], candidates)).toBe(true);
  });

  it('rejects duplicate preferences', () => {
    expect(validateIRVVote(['A', 'A'], candidates)).toBe(false);
  });

  it('rejects unknown candidates', () => {
    expect(validateIRVVote(['A', 'Z'], candidates)).toBe(false);
  });
});

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
  });

  it('reports an all-candidates tie instead of eliminating everyone', () => {
    const result = tabulateIRV(
      [{ preferences: ['A'] }, { preferences: ['B'] }, { preferences: ['C'] }],
      ['A', 'B', 'C']
    );
    expect(result.winner).toBeNull();
    expect(result.rounds[0].tiedCandidates).toEqual(['A', 'B', 'C']);
  });

  it('eliminates all tied lowest candidates in one round (documented batch policy)', () => {
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
    // C and D are tied lowest (1 vote each) and are eliminated together.
    expect(result.rounds[0].eliminated).toEqual(expect.arrayContaining(['C', 'D']));
    expect(result.rounds[0].eliminated).toHaveLength(2);
    expect(result.winner).toBe('A');
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

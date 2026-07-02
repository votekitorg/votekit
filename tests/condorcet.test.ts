import { describe, expect, it } from 'vitest';
import { exportCondorcetResultsCSV, tabulateCondorcet, validateCondorcetVote } from '@/lib/condorcet';

describe('tabulateCondorcet', () => {
  it('reports a two-candidate exact tie as a tie, not a candidate-order win', () => {
    const result = tabulateCondorcet(
      [{ preferences: ['A', 'B'] }, { preferences: ['B', 'A'] }],
      ['A', 'B']
    );
    expect(result.winner).toBeNull();
    expect(result.tiedCandidates).toEqual(['A', 'B']);
    expect(result.method).toBe('schulze');
    expect(result.condorcetWinner).toBe(false);
  });

  it('reports a three-candidate symmetric cycle as a three-way tie', () => {
    const result = tabulateCondorcet(
      [
        { preferences: ['A', 'B', 'C'] },
        { preferences: ['B', 'C', 'A'] },
        { preferences: ['C', 'A', 'B'] }
      ],
      ['A', 'B', 'C']
    );
    expect(result.winner).toBeNull();
    expect(result.tiedCandidates).toEqual(['A', 'B', 'C']);
    expect(result.rounds.some(round => (round.tiedCandidates || []).length === 3)).toBe(true);
  });

  it('still reports a strict Condorcet winner', () => {
    const result = tabulateCondorcet(
      [
        { preferences: ['A', 'B', 'C'] },
        { preferences: ['A', 'B', 'C'] },
        { preferences: ['B', 'A', 'C'] }
      ],
      ['A', 'B', 'C']
    );
    expect(result.winner).toBe('A');
    expect(result.condorcetWinner).toBe(true);
    expect(result.method).toBe('condorcet');
    expect(result.tiedCandidates).toBeUndefined();
  });

  it('still resolves an asymmetric cycle to a unique Schulze winner', () => {
    // A beats B 4-1, B beats C 3-2, C beats A 3-2: cycle with A having the
    // strongest paths.
    const result = tabulateCondorcet(
      [
        { preferences: ['A', 'B', 'C'] },
        { preferences: ['A', 'B', 'C'] },
        { preferences: ['B', 'C', 'A'] },
        { preferences: ['C', 'A', 'B'] },
        { preferences: ['C', 'A', 'B'] }
      ],
      ['A', 'B', 'C']
    );
    expect(result.winner).toBe('A');
    expect(result.condorcetWinner).toBe(false);
    expect(result.method).toBe('schulze');
    expect(result.tiedCandidates).toBeUndefined();
  });

  it('treats unranked candidates as less preferred than ranked ones', () => {
    const result = tabulateCondorcet(
      [{ preferences: ['A'] }, { preferences: ['A', 'B'] }],
      ['A', 'B']
    );
    expect(result.winner).toBe('A');
    expect(result.condorcetWinner).toBe(true);
  });
});

describe('exportCondorcetResultsCSV', () => {
  it('reports ties explicitly in the winner cell', () => {
    const result = tabulateCondorcet(
      [{ preferences: ['A', 'B'] }, { preferences: ['B', 'A'] }],
      ['A', 'B']
    );
    const csv = exportCondorcetResultsCSV(result);
    expect(csv).toContain('"Tie: A / B"');
  });

  it('reports a unique winner in the winner cell', () => {
    const result = tabulateCondorcet(
      [{ preferences: ['A', 'B'] }, { preferences: ['A', 'B'] }],
      ['A', 'B']
    );
    const csv = exportCondorcetResultsCSV(result);
    expect(csv).toContain('"condorcet","A"');
  });
});

describe('validateCondorcetVote', () => {
  const candidates = ['A', 'B', 'C'];

  it('accepts a partial unique ranking of at least one candidate', () => {
    expect(validateCondorcetVote(['C'], candidates)).toBe(true);
  });

  it('rejects an empty ranking', () => {
    expect(validateCondorcetVote([], candidates)).toBe(false);
  });

  it('rejects duplicates and unknown candidates', () => {
    expect(validateCondorcetVote(['A', 'A'], candidates)).toBe(false);
    expect(validateCondorcetVote(['A', 'Z'], candidates)).toBe(false);
  });
});

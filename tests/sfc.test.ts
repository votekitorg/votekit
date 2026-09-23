import { describe, expect, it } from 'vitest';
import { tabulateCondorcet, exportCondorcetResultsCSV } from '@/lib/condorcet';
import { validateSfcRule, type SfcRule } from '@/lib/sfc';

const options = ['A', 'B', 'Seek Further Candidates'];
const sfc = options[2];
const rule: SfcRule = { referenceOption: sfc, numerator: 2, denominator: 3, comparison: 'strict' };
const ballot = (...preferences: string[]) => ({ preferences });

describe('SFC qualification before Condorcet/Schulze selection', () => {
  it.each([[1, false], [2, false], [3, true]])('requires strictly more than two-thirds: %i of three', (support, passed) => {
    const votes = [...Array(support).fill(ballot('A', sfc)), ...Array(3 - support).fill(ballot(sfc, 'A'))];
    const result = tabulateCondorcet(votes, options, rule);
    expect(result.qualification?.find(row => row.candidate === 'A')).toMatchObject({ preferred: support, denominator: 3, passed });
  });

  it('supports inclusive exact boundaries and other fractions', () => {
    const votes = [ballot('A'), ballot('A'), ballot(sfc)];
    expect(tabulateCondorcet(votes, options, { ...rule, comparison: 'inclusive' }).winner).toBe('A');
    expect(tabulateCondorcet(votes, options, { ...rule, numerator: 1, denominator: 2 }).winner).toBe('A');
  });

  it('counts ranked over omitted, omits neither-ranked pairings, and fails zero denominators', () => {
    const result = tabulateCondorcet([ballot('A'), ballot(sfc), ballot('B'), ballot('A', sfc), ballot(sfc, 'A')], options, rule);
    expect(result.qualification?.[0]).toEqual({ candidate: 'A', preferred: 2, opposed: 2, denominator: 4, passed: false });
    expect(tabulateCondorcet([ballot('B')], options, rule).qualification?.[0]).toMatchObject({ denominator: 0, passed: false });
    expect(tabulateCondorcet([], options, rule).noQualifiedCandidates).toBe(true);
  });

  it('excludes an otherwise leading candidate and selects among qualifiers using original preferences', () => {
    // A wins A/B 3:2 but fails SFC 3:2. B passes SFC 4:1.
    const votes = [ballot('A', 'B', sfc), ballot('A', 'B', sfc), ballot('A', sfc, 'B'), ballot('B', sfc, 'A'), ballot('B', sfc, 'A')];
    expect(tabulateCondorcet(votes, options).winner).toBe('A');
    const result = tabulateCondorcet(votes, options, rule);
    expect(result.winner).toBe('B');
    expect(result.qualification?.map(row => row.passed)).toEqual([false, true]);
    expect(result.pairwiseMatrix.A.B).toBe(3);
    expect(result.rankings.map(row => row.candidate)).toEqual(['B']);
  });

  it('never elects SFC, reports no qualifiers and preserves genuine ties', () => {
    const none = tabulateCondorcet([ballot(sfc, 'A', 'B')], options, rule);
    expect(none.winner).toBeNull();
    expect(none.noQualifiedCandidates).toBe(true);
    const tie = tabulateCondorcet([ballot('A', 'B', sfc), ballot('B', 'A', sfc)], options, rule);
    expect(tie.winner).toBeNull();
    expect(tie.tiedCandidates).toEqual(['A', 'B']);
  });

  it('rejects invalid rules and discloses exact qualification in CSV', () => {
    expect(validateSfcRule(rule, 'ranked_choice', options)).toBeTruthy();
    expect(validateSfcRule({ ...rule, denominator: 0 }, 'condorcet', options)).toBeTruthy();
    expect(validateSfcRule({ ...rule, numerator: 0.5 }, 'condorcet', options)).toBeTruthy();
    expect(validateSfcRule({ ...rule, referenceOption: 'missing' }, 'condorcet', options)).toBeTruthy();
    const csv = exportCondorcetResultsCSV(tabulateCondorcet([ballot('A'), ballot(sfc)], options, rule));
    expect(csv).toContain('more than 2/3');
    expect(csv).toContain('"A",1,1,2,50.0000,Fail');
    expect(csv).toContain('No candidate qualified');
    expect(tabulateCondorcet([ballot('A')], options)).not.toHaveProperty('sfcRule');
  });
});

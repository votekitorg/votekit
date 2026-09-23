export interface SfcRule {
  referenceOption: string;
  numerator: number;
  denominator: number;
  comparison: 'strict' | 'inclusive';
}

export interface SfcQualification {
  candidate: string;
  preferred: number;
  opposed: number;
  denominator: number;
  passed: boolean;
}

export function validateSfcRule(rule: unknown, type: string, options: string[]): string | null {
  if (rule === undefined || rule === null) return null;
  const r = rule as SfcRule;
  if (typeof rule !== 'object' || Array.isArray(rule) || type !== 'condorcet' ||
      !options.includes(r.referenceOption) || !['strict', 'inclusive'].includes(r.comparison) ||
      !Number.isSafeInteger(r.numerator) || !Number.isSafeInteger(r.denominator) ||
      r.denominator < 1 || r.denominator > 1000000 || r.numerator < 0 || r.numerator > r.denominator) {
    return 'Seek Further Candidates requires a Condorcet question, a reference option and a valid exact threshold between 0 and 1.';
  }
  return null;
}

export function sfcRuleDescription(rule: SfcRule): string {
  return `Candidates must receive ${rule.comparison === 'strict' ? 'more than' : 'at least'} ${rule.numerator}/${rule.denominator} of the expressed pairwise preferences against “${rule.referenceOption}”. Candidates who fail are excluded before selecting the Condorcet/Schulze winner. If none qualify, nobody is elected.`;
}

export function qualifyAgainstSfc(matrix: Record<string, Record<string, number>>, options: string[], rule: SfcRule): SfcQualification[] {
  return options.filter(candidate => candidate !== rule.referenceOption).map(candidate => {
    const preferred = matrix[candidate]?.[rule.referenceOption] || 0;
    const opposed = matrix[rule.referenceOption]?.[candidate] || 0;
    const denominator = preferred + opposed;
    const left = BigInt(preferred) * BigInt(rule.denominator);
    const right = BigInt(denominator) * BigInt(rule.numerator);
    return { candidate, preferred, opposed, denominator,
      passed: denominator > 0 && (rule.comparison === 'strict' ? left > right : left >= right) };
  });
}

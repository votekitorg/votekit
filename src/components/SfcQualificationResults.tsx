import { sfcRuleDescription, type SfcRule, type SfcQualification } from '@/lib/sfc';

export default function SfcQualificationResults({ rule, qualification }: { rule: SfcRule; qualification: SfcQualification[] }) {
  return <section className="space-y-3 rounded-lg border border-blue-200 p-4">
    <h3 className="font-semibold">Candidate qualification against {rule.referenceOption}</h3>
    <p className="text-sm">{sfcRuleDescription(rule)}</p>
    <p className="text-sm">Ranked options beat omitted options. Ballots omitting both are excluded from that pairing. No expressed preference means the candidate does not qualify. The threshold is applied exactly, before percentage rounding.</p>
    {qualification.map(row => <div key={row.candidate} className="border-t pt-2">
      <strong>{row.candidate}: {row.passed ? 'Pass' : 'Fail'}</strong>
      <p>{row.preferred} preferred candidate; {row.opposed} preferred {rule.referenceOption}. Candidate support: {row.preferred}/{row.denominator} ({row.denominator ? `${(100 * row.preferred / row.denominator).toFixed(2)}%` : 'no pairwise votes'}).</p>
    </div>)}
    {!qualification.some(row => row.passed) && <p className="font-semibold">No candidate qualified. Nobody is elected.</p>}
  </section>;
}

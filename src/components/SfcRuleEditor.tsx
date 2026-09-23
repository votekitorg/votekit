'use client';
import { sfcRuleDescription, type SfcRule } from '@/lib/sfc';

export default function SfcRuleEditor({ options, value, onChange }: { options: string[]; value?: SfcRule; onChange: (rule?: SfcRule) => void }) {
  return <fieldset className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
    <legend className="font-semibold">Seek Further Candidates qualification</legend>
    <label className="flex gap-3"><input type="checkbox" checked={Boolean(value)} onChange={event => onChange(event.target.checked ? {
      referenceOption: options.find(option => /seek further/i.test(option)) || '', numerator: 2, denominator: 3, comparison: 'strict'
    } : undefined)} />Require candidates to qualify against a reference option</label>
    {value && <>
      <label className="block">Reference option<select className="input-field" value={value.referenceOption} onChange={event => onChange({ ...value, referenceOption: event.target.value })}>
        <option value="" disabled>Select an option</option>{options.map((option, index) => <option key={index} value={option}>{option}</option>)}
      </select></label>
      <p className="text-sm">Add or rename an answer option to “Seek Further Candidates”, or your preferred label, below. It cannot itself be elected.</p>
      <label className="block">Required candidate support<select className="input-field" value={value.comparison} onChange={event => onChange({ ...value, comparison: event.target.value as SfcRule['comparison'] })}>
        <option value="strict">More than</option><option value="inclusive">At least</option>
      </select></label>
      <div className="flex gap-3">
        <label className="min-w-0">Numerator<input className="input-field" type="number" min={0} max={value.denominator} step={1} value={value.numerator} onChange={event => onChange({ ...value, numerator: Number(event.target.value) })} /></label>
        <label className="min-w-0">Denominator<input className="input-field" type="number" min={1} max={1000000} step={1} value={value.denominator} onChange={event => onChange({ ...value, denominator: Number(event.target.value) })} /></label>
      </div>
      <p className="text-sm">Use 2 / 3 for an exact two-thirds threshold, rather than a rounded percentage.</p>
      <p className="text-sm">{sfcRuleDescription(value)} The rule is locked when published.</p>
    </>}
  </fieldset>;
}

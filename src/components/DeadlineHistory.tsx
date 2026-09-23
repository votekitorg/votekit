import type { DeadlineExtension } from '@/lib/deadline-extensions';
import { parseElectionCloseDate } from '@/lib/election-window';

const date = (value: string) => parseElectionCloseDate(value).toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' });

export default function DeadlineHistory({ extensions }: { extensions: DeadlineExtension[] }) {
  if (!extensions.length) return null;
  return <section className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
    <h3 className="font-semibold">Voting deadline extension history</h3>
    <p className="text-sm">All deadlines are Australia/Brisbane time. The original encrypted ballot manifest, where applicable, is unchanged.</p>
    {extensions.map(extension => <div key={extension.id} className="text-sm">
      <p>{date(extension.previous_deadline)} → {date(extension.new_deadline)}</p>
      <p>{extension.administrator_name} · {date(extension.created_at)}</p>
      <p className="whitespace-pre-wrap break-words">Reason: {extension.reason}</p>
    </div>)}
  </section>;
}

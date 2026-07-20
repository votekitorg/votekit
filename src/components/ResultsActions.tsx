'use client';

export default function ResultsActions({ slug }: { slug: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <a href={`/api/results/${slug}?format=pdf`} className="btn-primary text-sm">
        <svg className="mr-1.5 inline h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0-3-3m3 3 3-3M7 21h10a2 2 0 0 0 2-2V8l-5-5H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2Z" />
        </svg>
        Download PDF
      </a>
      <a href={`/api/results/${slug}?format=csv`} className="btn-secondary text-sm">Export CSV</a>
      <button type="button" onClick={() => window.print()} className="btn-secondary text-sm">Print</button>
    </div>
  );
}

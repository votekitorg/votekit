import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('results page layout', () => {
  const resultsPage = fs.readFileSync(path.join(process.cwd(), 'src/app/results/[slug]/page.tsx'), 'utf8');

  it('keeps each question summary visible by collapsing its ballot receipts by default', () => {
    expect(resultsPage).toContain('<details className="group mt-6');
    expect(resultsPage).toContain('<h4 className="font-semibold text-gray-900">Ballot receipts</h4>');
    expect(resultsPage).toContain('View {ballots.length.toLocaleString()} anonymous ballot receipt');
    expect(resultsPage).not.toContain('<details open');
  });

  it('retains the receipt verification explanation and published ballot table', () => {
    expect(resultsPage).toContain('confirm your ballot was included and recorded correctly');
    expect(resultsPage).toContain('Receipt Code');
    expect(resultsPage).toContain('Published Ballot');
  });
});

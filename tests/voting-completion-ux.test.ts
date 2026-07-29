import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('voter completion guidance', () => {
  const votingPage = fs.readFileSync(path.join(process.cwd(), 'src/app/vote/[slug]/page.tsx'), 'utf8');
  const homePage = fs.readFileSync(path.join(process.cwd(), 'src/app/page.tsx'), 'utf8');
  const aboutPage = fs.readFileSync(path.join(process.cwd(), 'src/app/about/page.tsx'), 'utf8');

  it('makes completion and verification optionality unmistakable', () => {
    expect(votingPage).toContain('You’re done!');
    expect(votingPage).toContain('No further action is required.');
    expect(votingPage).toContain('Optional: save a verification receipt');
    expect(votingPage).toContain('Optional: view the final results');
    expect(votingPage).toContain('Download verification receipt');
  });

  it('shows the anonymous voting code only for eligible-voter results access', () => {
    expect(votingPage).toContain("plebiscite.results_visibility === 'eligible'");
    expect(votingPage).toContain('Your voting code will be shown again after you submit.');
    expect(votingPage.match(/Copy voting code/gu)).toHaveLength(2);
    expect(votingPage).toContain("copyCredential(resultAccessCode, 'voting-code-before')");
    expect(votingPage).toContain("copyCredential(resultAccessCode, 'voting-code-after')");
    expect(votingPage).toContain('You do not need to save a voting code for results access.');
    expect(votingPage).toContain('No voting code or identity check is needed.');
  });

  it('collapses receipt codes into one labelled downloadable file', () => {
    expect(votingPage).toContain('<details className="card text-left mb-8">');
    expect(votingPage).toContain("'VoteKit verification receipt'");
    expect(votingPage).toContain('Results link: ${window.location.origin}/results/${slug}');
    expect(votingPage).toContain('questions[index]?.title');
    expect(votingPage).not.toContain('receiptCodes.map((code, index) => (');
  });

  it('accurately explains recorded-choice verification without an unnecessary receipt warning', () => {
    expect(votingPage).not.toContain('Anyone with a receipt code');
    expect(votingPage).not.toContain('VoteKit does not store your receipt against your identity');
    expect(aboutPage).not.toContain('Anyone with the receipt');
    expect(homePage).not.toContain('without revealing their choices');
    expect(aboutPage).not.toContain('without revealing how you voted');
    expect(aboutPage).not.toContain('without revealing your choices to anyone');
  });
});

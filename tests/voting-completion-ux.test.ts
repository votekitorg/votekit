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
    expect(votingPage).toContain('Optional: verify your recorded ballot later');
    expect(votingPage).toContain('Optional: view the final results');
  });

  it('shows the anonymous voting code before and after submission with copy controls', () => {
    expect(votingPage).toContain('Your voting code will be shown again after you submit.');
    expect(votingPage.match(/Copy voting code/gu)).toHaveLength(2);
    expect(votingPage).toContain("copyCredential(resultAccessCode, 'voting-code-before')");
    expect(votingPage).toContain("copyCredential(resultAccessCode, 'voting-code-after')");
  });

  it('accurately explains recorded-choice verification and reassures voters about identity separation', () => {
    expect(votingPage).toContain('VoteKit does not store your receipt against your identity, so election administrators cannot use VoteKit to determine which receipt belongs to you.');
    expect(votingPage).not.toContain('Anyone with a receipt code');
    expect(aboutPage).not.toContain('Anyone with the receipt');
    expect(homePage).not.toContain('without revealing their choices');
    expect(aboutPage).not.toContain('without revealing how you voted');
    expect(aboutPage).not.toContain('without revealing your choices to anyone');
  });
});

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

describe('GitHub feedback UI guardrails', () => {
  it('keeps form controls readable when the operating system prefers dark mode', () => {
    const css = fs.readFileSync(path.join(root, 'src/app/globals.css'), 'utf8');
    expect(css).toContain('color-scheme: light');
    expect(css).not.toContain('@media (prefers-color-scheme: dark)');
    expect(css).toContain('@apply w-full bg-white text-gray-900');
  });

  it('requires an explicit fixed closing time instead of silently pre-filling seven days', () => {
    const form = fs.readFileSync(path.join(root, 'src/app/admin/plebiscites/new/CreatePlebisciteForm.tsx'), 'utf8');
    expect(form).toContain("close_date: typeof savedForm.close_date === 'string' ? savedForm.close_date : ''");
    expect(form).not.toContain('Defaults to seven days from now');
    expect(form).toContain('Choose this deliberately');
  });

  it('keeps the admin dashboard inside iPad portrait and landscape viewports', () => {
    const layout = fs.readFileSync(path.join(root, 'src/components/AdminLayout.tsx'), 'utf8');
    const dashboard = fs.readFileSync(path.join(root, 'src/app/admin/page.tsx'), 'utf8');

    expect(layout).toContain('hidden w-64 shrink-0');
    expect(layout).toContain('lg:block');
    expect(layout).toContain('min-h-screen min-w-0 flex-1');
    expect(layout).toContain('aria-label="Toggle admin navigation"');
    expect(layout).toContain('lg:hidden');
    expect(layout).toContain('min-w-0 flex-1 p-4 sm:p-6');
    expect(dashboard).toContain('grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4');
    expect(dashboard).toContain('card min-w-0 overflow-hidden');
    expect(dashboard).toContain('w-full max-w-full overflow-x-auto overscroll-x-contain');
  });

  it('shows each ballot-preview rank once and separates it from numbered option text', () => {
    const voteForm = fs.readFileSync(path.join(root, 'src/components/VoteForm.tsx'), 'utf8');

    expect(voteForm).toContain('aria-label={`Rank ${index + 1}`}');
    expect(voteForm).toContain('rounded-full bg-primary');
    expect(voteForm).not.toContain('<span className="font-medium">#{index + 1}:</span>');
    expect(voteForm).not.toContain('list-decimal list-inside');
  });

  it('shows election context and explains codes prefilled by direct personal links', () => {
    const votingPage = fs.readFileSync(path.join(root, 'src/app/vote/[slug]/page.tsx'), 'utf8');

    expect(votingPage).toContain("{plebiscite.title}");
    expect(votingPage).toContain("{plebiscite.description}");
    expect(votingPage).toContain("'Your voting code is ready'");
    expect(votingPage).toContain("'Enter your voting code'");
    expect(votingPage).toContain(
      "'Your voting code has been entered automatically from your personal link. Click “Continue to ballot” below.'"
    );
    expect(votingPage).toContain("setIsPrefilledAccessCode(true)");
  });
});

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
    expect(form).toContain("close_date: ''");
    expect(form).not.toContain('Defaults to seven days from now');
    expect(form).toContain('Choose this deliberately');
  });
});

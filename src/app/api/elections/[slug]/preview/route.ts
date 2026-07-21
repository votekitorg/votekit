import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { validateCSRFRequest } from '@/lib/auth';
import { hashAccessToken, hashLinkToken, normalizeAccessCode } from '@/lib/voter-access';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!validateCSRFRequest(request)) return NextResponse.json({ error: 'Invalid request' }, { status: 403 });

  try {
    const { slug } = await params;
    const body = await request.json();
    if (!['anonymous_code', 'voter_link'].includes(body?.kind) || typeof body?.credential !== 'string' || body.credential.length > 120) {
      return NextResponse.json({ error: 'Election not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }

    const election = db.prepare(`
      SELECT id, slug, title, open_date, opening_mode, access_mode
      FROM plebiscites
      WHERE slug = ? AND status = 'draft' AND archived_at IS NULL
    `).get(slug) as any;
    if (!election) return NextResponse.json({ error: 'Election not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });

    let valid = false;
    if (body.kind === 'anonymous_code' && election.access_mode === 'anonymous_codes') {
      const normalized = normalizeAccessCode(body.credential);
      valid = normalized.length === 28 && Boolean(db.prepare(`
        SELECT 1 FROM anonymous_access_codes WHERE plebiscite_id = ? AND token_hash = ?
      `).get(election.id, hashAccessToken(normalized)));
    } else if (body.kind === 'voter_link' && election.access_mode === 'voter_roll') {
      valid = Boolean(db.prepare(`
        SELECT 1 FROM voter_link_tokens
        WHERE plebiscite_id = ? AND token_hash = ? AND revoked = FALSE
      `).get(election.id, hashLinkToken(body.credential)));
    }

    if (!valid) return NextResponse.json({ error: 'Election not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    return NextResponse.json({
      election: {
        slug: election.slug,
        title: election.title,
        openingMode: election.opening_mode || 'immediate',
        opensAt: election.open_date
      }
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'Election not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
}

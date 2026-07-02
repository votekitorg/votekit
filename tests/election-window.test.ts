import { describe, expect, it } from 'vitest';
import { parseElectionCloseDate, votingClosedError } from '@/lib/election-window';

// close_date "2026-07-12T17:00" in Brisbane (+10:00) is 2026-07-12T07:00:00Z.
const election = { close_date: '2026-07-12T17:00' };
const CLOSE_INSTANT_UTC = '2026-07-12T07:00:00Z';

describe('parseElectionCloseDate', () => {
  it('interprets timezone-naive datetime-local values as Australia/Brisbane (+10:00)', () => {
    expect(parseElectionCloseDate('2026-07-12T17:00').getTime()).toBe(Date.parse(CLOSE_INSTANT_UTC));
  });

  it('handles naive values with seconds', () => {
    expect(parseElectionCloseDate('2026-07-12T17:00:30').getTime()).toBe(Date.parse('2026-07-12T07:00:30Z'));
  });

  it('leaves values with explicit timezone information as-is', () => {
    expect(parseElectionCloseDate('2026-07-12T17:00:00Z').getTime()).toBe(Date.parse('2026-07-12T17:00:00Z'));
    expect(parseElectionCloseDate('2026-07-12T17:00:00+02:00').getTime()).toBe(Date.parse('2026-07-12T15:00:00Z'));
  });
});

describe('votingClosedError', () => {
  it('allows voting before the close instant', () => {
    expect(votingClosedError(election, new Date('2026-07-12T06:59:00Z'))).toBeNull();
  });

  it('allows voting at exactly the close instant (inclusive boundary)', () => {
    expect(votingClosedError(election, new Date(CLOSE_INSTANT_UTC))).toBeNull();
  });

  it('rejects voting after the close instant even if status is still open', () => {
    expect(votingClosedError(election, new Date('2026-07-12T07:00:00.001Z')))
      .toBe('Voting has closed for this election');
  });

  it('does not consider open_date at all: voting long before any scheduled open is allowed', () => {
    // status = 'open' is authoritative for opening; the helper only knows the
    // close deadline, so an early-opened election accepts votes immediately.
    expect(votingClosedError({ close_date: '2030-01-01T00:00' }, new Date('2000-01-01T00:00:00Z'))).toBeNull();
  });

  it('fails closed on an unparseable close date', () => {
    expect(votingClosedError({ close_date: 'garbage' }, new Date('2026-07-12T00:00:00Z')))
      .toBe('Voting has closed for this election');
  });

  it('enforcement is independent of the server timezone (instants, not wall clocks)', () => {
    // One millisecond either side of the same UTC instant flips the outcome,
    // regardless of what timezone this test process runs in.
    const justBefore = new Date(Date.parse(CLOSE_INSTANT_UTC) - 1);
    const justAfter = new Date(Date.parse(CLOSE_INSTANT_UTC) + 1);
    expect(votingClosedError(election, justBefore)).toBeNull();
    expect(votingClosedError(election, justAfter)).toBe('Voting has closed for this election');
  });
});

// Close-deadline check shared by the public voting routes (verify, confirm,
// vote submission).
//
// Product decision: status = 'open' is authoritative for opening an election.
// open_date is scheduled/display metadata and does not block voting once an
// admin has opened the election. close_date is a hard cutoff: after it, the
// voting routes reject requests even if the admin has not clicked Close.
//
// Date/time assumption: close_date is stored exactly as submitted by the
// admin form's datetime-local input — a timezone-naive string like
// "2026-07-12T17:00". Admins enter and voters see these times as
// Australia/Brisbane local time. The production server may run in UTC, so we
// parse timezone-naive values with an explicit +10:00 Brisbane offset instead
// of relying on the server's local timezone.
//
// The boundary is inclusive: voting is still allowed at exactly close_date.

export interface ElectionCloseDeadline {
  close_date: string;
}

export function parseElectionCloseDate(value: string): Date {
  const trimmed = value.trim();

  // datetime-local input values are timezone-naive. Brisbane has no daylight
  // saving time, so +10:00 is stable year-round.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    return new Date(`${trimmed}+10:00`);
  }

  // If future storage includes an explicit offset or Z suffix, respect it.
  return new Date(trimmed);
}

export function votingClosedError(plebiscite: ElectionCloseDeadline, now: Date = new Date()): string | null {
  const closeDate = parseElectionCloseDate(plebiscite.close_date);

  // Fail closed: an election with an unparseable close date cannot accept votes.
  if (isNaN(closeDate.getTime())) {
    return 'Voting has closed for this election';
  }

  if (now > closeDate) {
    return 'Voting has closed for this election';
  }

  return null;
}

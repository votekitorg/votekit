import db from './db';

export interface DeadlineExtension {
  id: number;
  previous_deadline: string;
  new_deadline: string;
  reason: string;
  administrator_name: string;
  created_at: string;
}

export function listDeadlineExtensions(electionId: number): DeadlineExtension[] {
  return db.prepare(`SELECT id, previous_deadline, new_deadline, reason, administrator_name, created_at
    FROM election_deadline_extensions WHERE plebiscite_id = ? ORDER BY id`).all(electionId) as DeadlineExtension[];
}

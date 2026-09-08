import { bindings } from '../learning/storage';
import { chinaDay, type ActivityKind } from '../../activity-model';

export type ActivityEvent = {
  eventId: string;
  kind: ActivityKind;
  itemKey: string;
  label: string;
  correct: boolean;
};
export function activityInsert(
  user: string,
  event: ActivityEvent,
  now: number,
  revision?: number,
) {
  const day = chinaDay(now);
  const guard =
    revision === undefined
      ? '1 = 1'
      : 'EXISTS (SELECT 1 FROM learning_states WHERE user_id = ? AND revision = ?)';
  const values: (string | number)[] = [
    user,
    event.eventId,
    day,
    event.kind,
    event.itemKey,
    event.label,
    +event.correct,
    +event.correct,
    user,
    day,
    event.kind,
    event.itemKey,
    now,
  ];
  if (revision !== undefined) values.push(user, revision);
  return bindings()
    .DB.prepare(`INSERT INTO learning_activity
    (user_id, event_id, day, kind, item_key, label, correct, points, created_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 1 AND NOT EXISTS (
      SELECT 1 FROM learning_activity WHERE user_id = ? AND day = ? AND kind = ? AND item_key = ? AND correct = 1
    ) THEN 1 ELSE 0 END, ? WHERE ${guard}
    ON CONFLICT(user_id, event_id) DO NOTHING RETURNING points, correct, day`)
    .bind(...values);
}
export async function contentKey(text: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest))
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
}

import { chinaDay, TREE_CATALOG, type ActivityReport, type ActivityRow } from './activity-model';

type LocalEvent = { eventId: string; day: string; kind: 'spelling' | 'login'; itemKey: string; correct: boolean; points: number };
const KEY = 'phonics.github.activity';
function read(): LocalEvent[] {
  try { const value = JSON.parse(localStorage.getItem(KEY) ?? '[]'); return Array.isArray(value) ? value : []; } catch { return []; }
}
function write(events: LocalEvent[]) { localStorage.setItem(KEY, JSON.stringify(events)); }
export function localAward(eventId: string, word: string, answer: string, expected: string) {
  const events = read(); const existing = events.find((event) => event.eventId === eventId);
  if (existing) return { points: existing.points, correct: existing.correct, day: existing.day };
  const correct = answer.trim().toLowerCase() === expected.trim().toLowerCase();
  const day = chinaDay();
  const alreadyCorrect = events.some((event) => event.kind === 'spelling' && event.day === day && event.itemKey === word.toLowerCase() && event.correct);
  const item = { eventId, day, kind: 'spelling' as const, itemKey: word.toLowerCase(), correct, points: correct && !alreadyCorrect ? 1 : 0 };
  write([...events, item]); return { points: item.points, correct, day };
}
export function localCheckIn() {
  const events = read(); const day = chinaDay();
  if (!events.some((event) => event.kind === 'login' && event.day === day)) write([...events, { eventId: `login:${day}`, day, kind: 'login', itemKey: 'login', correct: true, points: 1 }]);
}
export function localReport(): ActivityReport {
  const events = read(); const rows = new Map<string, ActivityRow>();
  for (const event of events) { const period = event.day; const key = `${period}:${event.kind}`; const row = rows.get(key) ?? { period, kind: event.kind, studied: 0, firstCorrect: 0, attempts: 0, correct: 0, points: 0 }; row.attempts += 1; row.correct += event.correct ? 1 : 0; row.points += event.points; if (event.kind === 'login' || row.attempts === 1) row.studied += 1; if (event.correct && row.attempts === 1) row.firstCorrect += 1; rows.set(key, row); }
  const today = chinaDay(); const totalPoints = events.reduce((sum, event) => sum + event.points, 0);
  return { rows: [...rows.values()].sort((a, b) => a.period.localeCompare(b.period)), totalPoints, startedOn: events[0]?.day ?? null, todayPoints: events.filter((event) => event.day === today).reduce((sum, event) => sum + event.points, 0), checkedInToday: events.some((event) => event.kind === 'login' && event.day === today) };
}
export function localForest() {
  const events = read(); const earned = events.reduce((sum, event) => sum + event.points, 0); const today = chinaDay();
  return { earned, spent: 0, available: earned, todayPoints: events.filter((event) => event.day === today).reduce((sum, event) => sum + event.points, 0), checkedInToday: events.some((event) => event.kind === 'login' && event.day === today), planted: [], catalog: TREE_CATALOG };
}

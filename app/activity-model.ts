export type ActivityKind = 'recognition' | 'spelling' | 'grammar';
export type ActivityMode = 'day' | 'month' | 'year';
export type Award = { points: number; correct: boolean; day: string };
export type ActivityRow = {
  period: string;
  kind: ActivityKind;
  studied: number;
  firstCorrect: number;
  attempts: number;
  correct: number;
  points: number;
};
export type ActivityReport = {
  rows: ActivityRow[];
  totalPoints: number;
  startedOn: string | null;
  todayPoints: number;
};
export function chinaDay(now = Date.now()) {
  return new Date(now + 8 * 3600000).toISOString().slice(0, 10);
}
export function activityWord(word: string) {
  return word.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
}
export function spellingCorrect(answer: string, expected: string) {
  return (
    answer.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ') ===
    expected.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ')
  );
}
export function treeProgress(points: number) {
  const total = Math.max(0, Math.floor(points));
  const growth = total % 100;
  return {
    trees: Math.floor(total / 100),
    growth,
    stage:
      growth < 10
        ? '种子'
        : growth < 35
          ? '嫩芽'
          : growth < 70
            ? '树苗'
            : '小树',
    remaining: 100 - growth,
  };
}
export function rate(correct: number, total: number) {
  return total ? `${((correct / total) * 100).toFixed(1)}%` : '—';
}
export function reportRange(mode: string, period: string) {
  if (mode === 'year')
    return { start: '0000-01-01', end: '9999-12-31', size: 4 };
  if (
    mode === 'month' &&
    /^\d{4}$/.test(period) &&
    +period >= 2000 &&
    +period <= 9998
  )
    return { start: `${period}-01-01`, end: `${period}-12-31`, size: 7 };
  if (
    mode === 'day' &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(period) &&
    +period.slice(0, 4) >= 2000
  ) {
    const [year, month] = period.split('-').map(Number);
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return { start: `${period}-01`, end: `${period}-${days}`, size: 10 };
  }
  throw new Error('invalid-period');
}
export function reportPeriods(
  mode: ActivityMode,
  period: string,
  rows: ActivityRow[],
) {
  if (mode === 'year')
    return [...new Set(rows.map((row) => row.period))].sort().reverse();
  const range = reportRange(mode, period);
  const count = mode === 'day' ? +range.end.slice(-2) : 12;
  return Array.from(
    { length: count },
    (_, i) => `${period}-${String(i + 1).padStart(2, '0')}`,
  );
}
export function sumRows(rows: ActivityRow[]) {
  return rows.reduce(
    (sum, row) => ({
      studied: sum.studied + row.studied,
      firstCorrect: sum.firstCorrect + row.firstCorrect,
      attempts: sum.attempts + row.attempts,
      correct: sum.correct + row.correct,
      points: sum.points + row.points,
    }),
    { studied: 0, firstCorrect: 0, attempts: 0, correct: 0, points: 0 },
  );
}

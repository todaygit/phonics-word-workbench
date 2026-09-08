export type ActivityKind = 'recognition' | 'spelling' | 'grammar' | 'login';
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
  checkedInToday: boolean;
};
export type TreeSpecies = {
  id: string;
  name: string;
  cost: number;
  symbol: string;
  color: string;
  note: string;
};
export const TREE_CATALOG: TreeSpecies[] = [
  {
    id: 'sprout',
    name: '晨露嫩芽',
    cost: 5,
    symbol: '🌱',
    color: 'mint',
    note: '从一颗小芽开始',
  },
  {
    id: 'apple',
    name: '红苹果树',
    cost: 15,
    symbol: '🍎',
    color: 'apple',
    note: '结满红红的小苹果',
  },
  {
    id: 'pine',
    name: '松果小松',
    cost: 30,
    symbol: '🌲',
    color: 'pine',
    note: '四季常青的松树',
  },
  {
    id: 'cherry',
    name: '樱花树',
    cost: 50,
    symbol: '🌸',
    color: 'cherry',
    note: '开出粉色花朵',
  },
  {
    id: 'palm',
    name: '海风椰树',
    cost: 80,
    symbol: '🌴',
    color: 'palm',
    note: '带来暖暖海风',
  },
  {
    id: 'maple',
    name: '金秋枫树',
    cost: 120,
    symbol: '🍁',
    color: 'maple',
    note: '有金红色的叶子',
  },
  {
    id: 'rainbow',
    name: '彩虹树',
    cost: 180,
    symbol: '🌈',
    color: 'rainbow',
    note: '雨后出现七彩光芒',
  },
  {
    id: 'star',
    name: '星光树',
    cost: 250,
    symbol: '✨',
    color: 'star',
    note: '夜里闪着小星星',
  },
  {
    id: 'moon',
    name: '月亮古树',
    cost: 350,
    symbol: '🌙',
    color: 'moon',
    note: '守护安静的月夜',
  },
  {
    id: 'wonder',
    name: '奇迹生命树',
    cost: 500,
    symbol: '🌳',
    color: 'wonder',
    note: '森林里最珍贵的大树',
  },
];
export function treeSpecies(id: string) {
  return TREE_CATALOG.find((tree) => tree.id === id);
}
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

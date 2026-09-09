export type QuizSelection = 'checked' | 'random';

export type SpellingDayStat = {
  attempts: number;
  correct: number;
  wrong: number;
};

export type SpellingStat = {
  attempts: number;
  correct: number;
  wrong: number;
  lastTested: string;
  lastCorrect: boolean;
  days: Record<string, SpellingDayStat>;
};

export type SpellingStats = Record<string, SpellingStat>;

export type SpellingPlan = {
  mode: 'sequence' | 'chapter' | 'random';
  type: 'missing' | 'full';
  selection: QuizSelection;
  count: number;
  selectedChapters: string[];
  selectedWordIds: string[];
  perChapter: Record<string, number>;
  wrongFirst: boolean;
  missingCount: number;
  missingMode: 'random' | 'phonics' | 'first';
  configuredDate: string;
};

export type SpellingWord = {
  id: string;
  chapterId: string;
  chapterOrder: number;
  wordOrder: number;
};

export const EMPTY_SPELLING_PLAN: SpellingPlan = {
  mode: 'random',
  type: 'missing',
  selection: 'random',
  count: 20,
  selectedChapters: [],
  selectedWordIds: [],
  perChapter: {},
  wrongFirst: true,
  missingCount: 1,
  missingMode: 'random',
  configuredDate: '',
};

export function normaliseSpellingStats(value: unknown): SpellingStats {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: SpellingStats = {};
  for (const [wordId, raw] of Object.entries(value)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const item = raw as Partial<SpellingStat>;
    const days: Record<string, SpellingDayStat> = {};
    if (
      item.days &&
      typeof item.days === 'object' &&
      !Array.isArray(item.days)
    ) {
      for (const [day, dayRaw] of Object.entries(item.days)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
        if (!dayRaw || typeof dayRaw !== 'object') continue;
        const daily = dayRaw as Partial<SpellingDayStat>;
        const attempts = Math.max(0, Math.floor(Number(daily.attempts) || 0));
        const correct = Math.min(
          attempts,
          Math.max(0, Math.floor(Number(daily.correct) || 0)),
        );
        days[day] = { attempts, correct, wrong: attempts - correct };
      }
    }
    const attempts = Math.max(0, Math.floor(Number(item.attempts) || 0));
    const correct = Math.min(
      attempts,
      Math.max(0, Math.floor(Number(item.correct) || 0)),
    );
    const wrong = Math.max(0, attempts - correct);
    if (!attempts && !Object.keys(days).length) continue;
    result[wordId] = {
      attempts,
      correct,
      wrong,
      lastTested: typeof item.lastTested === 'string' ? item.lastTested : '',
      lastCorrect: Boolean(item.lastCorrect),
      days,
    };
  }
  return result;
}

export function updateSpellingStats(
  stats: SpellingStats,
  wordId: string,
  day: string,
  correct: boolean,
  timestamp = new Date().toISOString(),
): SpellingStats {
  const previous = stats[wordId] ?? {
    attempts: 0,
    correct: 0,
    wrong: 0,
    lastTested: '',
    lastCorrect: false,
    days: {},
  };
  const previousDay = previous.days[day] ?? {
    attempts: 0,
    correct: 0,
    wrong: 0,
  };
  const nextDay = {
    attempts: previousDay.attempts + 1,
    correct: previousDay.correct + Number(correct),
    wrong: previousDay.wrong + Number(!correct),
  };
  return {
    ...stats,
    [wordId]: {
      ...previous,
      attempts: previous.attempts + 1,
      correct: previous.correct + Number(correct),
      wrong: previous.wrong + Number(!correct),
      lastTested: timestamp,
      lastCorrect: correct,
      days: { ...previous.days, [day]: nextDay },
    },
  };
}

export function statForDay(stat: SpellingStat | undefined, day: string) {
  return stat?.days[day] ?? { attempts: 0, correct: 0, wrong: 0 };
}

export function sortSpellingWords<T extends SpellingWord>(words: T[]) {
  return [...words].sort(
    (a, b) => a.chapterOrder - b.chapterOrder || a.wordOrder - b.wordOrder,
  );
}

function wrongCount(stats: SpellingStats, wordId: string) {
  return stats[wordId]?.wrong ?? 0;
}

function prioritiseWrong<T extends SpellingWord>(
  words: T[],
  stats: SpellingStats,
  randomise: (items: T[]) => T[],
) {
  const wrong = words
    .filter((word) => wrongCount(stats, word.id) > 0)
    .sort((a, b) => wrongCount(stats, b.id) - wrongCount(stats, a.id));
  const rest = words.filter((word) => wrongCount(stats, word.id) === 0);
  return [...wrong, ...randomise(rest)];
}

export function buildSpellingQueue<T extends SpellingWord>(
  words: T[],
  plan: SpellingPlan,
  stats: SpellingStats,
  testedChapterIds: string[],
  randomise: (items: T[]) => T[],
) {
  const selectedChapterIds =
    plan.mode === 'random'
      ? testedChapterIds
      : plan.selectedChapters.length
        ? plan.selectedChapters
        : testedChapterIds;
  const chapterSet = new Set(selectedChapterIds);
  const range = words.filter((word) => chapterSet.has(word.chapterId));
  const fallbackRange = range.length ? range : words;

  if (plan.mode === 'random') {
    const prioritised = plan.wrongFirst
      ? prioritiseWrong(fallbackRange, stats, randomise)
      : randomise(fallbackRange);
    return prioritised.slice(0, Math.min(plan.count, prioritised.length));
  }

  let queue: T[];
  if (plan.selection === 'checked' && plan.selectedWordIds.length) {
    const selected = new Set(plan.selectedWordIds);
    queue = sortSpellingWords(
      fallbackRange.filter((word) => selected.has(word.id)),
    );
  } else if (plan.selection === 'random' && plan.mode === 'chapter') {
    queue = selectedChapterIds.flatMap((chapterId) => {
      const chapterWords = fallbackRange.filter(
        (word) => word.chapterId === chapterId,
      );
      const quota = Math.max(0, Math.floor(plan.perChapter[chapterId] ?? 0));
      const pool = plan.wrongFirst
        ? prioritiseWrong(chapterWords, stats, randomise)
        : randomise(chapterWords);
      return pool.slice(
        0,
        quota || (selectedChapterIds.length === 1 ? plan.count : 0),
      );
    });
    if (!queue.length && selectedChapterIds.length === 1)
      queue = randomise(fallbackRange).slice(0, plan.count);
    queue = sortSpellingWords(queue);
  } else {
    queue = sortSpellingWords(fallbackRange).slice(0, plan.count);
  }
  const quotaTotal =
    plan.selection === 'random' && plan.mode === 'chapter'
      ? Object.values(plan.perChapter).reduce(
          (sum, count) => sum + Math.max(0, Number(count) || 0),
          0,
        )
      : 0;
  return queue.slice(0, Math.min(quotaTotal || plan.count, queue.length));
}

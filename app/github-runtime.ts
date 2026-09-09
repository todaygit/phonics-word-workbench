'use client';

import {
  answerRecognition,
  emptyLearning,
  gradeGrammar,
  validateLearning,
  type LearningData,
} from './learning-model';
import {
  activityWord,
  chinaDay,
  reportRange,
  spellingCorrect,
  treeSpecies,
  type ActivityKind,
  type ActivityMode,
  type ActivityReport,
} from './activity-model';
import { normalizeWord, parseDictionary } from './word-resources';

const browserOnly = process.env.NEXT_PUBLIC_GITHUB_PAGES === 'true';
const learningKey = 'phonics.github.learning';
const activityKey = 'phonics.github.activity';
const forestKey = 'phonics.github.forest';
const revisionKey = 'phonics.github.revision';

type LocalActivity = {
  eventId: string;
  day: string;
  kind: ActivityKind;
  itemKey: string;
  label: string;
  correct: boolean;
  points: number;
  createdAt: number;
};
type LocalTree = {
  id: string;
  requestId: string;
  treeId: string;
  treeName: string;
  cost: number;
  plantedAt: number;
};

function read<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  window.localStorage.setItem(key, JSON.stringify(value));
}
function learning() {
  try {
    return validateLearning(read<unknown>(learningKey, emptyLearning()));
  } catch {
    return emptyLearning();
  }
}
function revision() {
  return read<number>(revisionKey, 0);
}
function saveLearning(data: LearningData) {
  const nextRevision = revision() + 1;
  write(learningKey, data);
  write(revisionKey, nextRevision);
  return nextRevision;
}
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
function bodyText(input: RequestInfo | URL, init?: RequestInit) {
  if (typeof init?.body === 'string') return Promise.resolve(init.body);
  if (input instanceof Request) return input.clone().text();
  return Promise.resolve('');
}
function activities() {
  return read<LocalActivity[]>(activityKey, []);
}
function addActivity(
  event: Omit<LocalActivity, 'day' | 'points' | 'createdAt'>,
) {
  const rows = activities();
  const existing = rows.find((row) => row.eventId === event.eventId);
  if (existing)
    return {
      points: existing.points,
      correct: existing.correct,
      day: existing.day,
    };
  const day = chinaDay();
  const points =
    event.correct &&
    !rows.some(
      (row) =>
        row.day === day &&
        row.kind === event.kind &&
        row.itemKey === event.itemKey &&
        row.correct,
    )
      ? 1
      : 0;
  const row: LocalActivity = {
    ...event,
    day,
    points,
    createdAt: Date.now(),
  };
  write(activityKey, [...rows, row].slice(-20000));
  return { points, correct: event.correct, day };
}
function forestBalance() {
  const rows = activities();
  const planted = read<LocalTree[]>(forestKey, []);
  const earned = rows.reduce((sum, row) => sum + row.points, 0);
  const spent = planted.reduce((sum, tree) => sum + tree.cost, 0);
  const day = chinaDay();
  return {
    earned,
    spent,
    available: Math.max(0, earned - spent),
    planted,
    todayPoints: rows
      .filter((row) => row.day === day)
      .reduce((sum, row) => sum + row.points, 0),
    checkedInToday: rows.some((row) => row.day === day && row.kind === 'login'),
  };
}
function activityReport(mode: ActivityMode, period: string): ActivityReport {
  const range = reportRange(mode, period);
  const rows = activities().filter(
    (row) => row.day >= range.start && row.day <= range.end,
  );
  const items = new Map<string, LocalActivity[]>();
  for (const row of rows) {
    const bucket = row.day.slice(0, range.size);
    const key = `${bucket}\u0000${row.kind}\u0000${row.day}\u0000${row.itemKey}`;
    items.set(key, [...(items.get(key) ?? []), row]);
  }
  const grouped = new Map<string, ActivityReport['rows'][number]>();
  for (const attempts of items.values()) {
    const first = attempts[0];
    const bucket = first.day.slice(0, range.size);
    const key = `${bucket}\u0000${first.kind}`;
    const current = grouped.get(key) ?? {
      period: bucket,
      kind: first.kind,
      studied: 0,
      firstCorrect: 0,
      attempts: 0,
      correct: 0,
      points: 0,
    };
    current.studied += 1;
    current.firstCorrect += Number(first.correct);
    current.attempts += attempts.length;
    current.correct += attempts.filter((row) => row.correct).length;
    current.points += attempts.reduce((sum, row) => sum + row.points, 0);
    grouped.set(key, current);
  }
  const all = activities();
  const day = chinaDay();
  return {
    rows: [...grouped.values()].sort((a, b) =>
      `${a.period}${a.kind}`.localeCompare(`${b.period}${b.kind}`),
    ),
    totalPoints: all.reduce((sum, row) => sum + row.points, 0),
    startedOn: all.length
      ? all.reduce((min, row) => (row.day < min ? row.day : min), all[0].day)
      : null,
    todayPoints: all
      .filter((row) => row.day === day)
      .reduce((sum, row) => sum + row.points, 0),
    checkedInToday: all.some((row) => row.day === day && row.kind === 'login'),
  };
}

async function handleApi(
  originalFetch: typeof window.fetch,
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  const rawUrl =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  const url = new URL(rawUrl, window.location.href);
  const method = (
    init?.method ?? (input instanceof Request ? input.method : 'GET')
  ).toUpperCase();
  if (!url.pathname.startsWith('/api/')) return originalFetch(input, init);

  if (url.pathname === '/api/learning' && method === 'GET')
    return json({ data: learning(), revision: revision() });
  if (url.pathname === '/api/learning' && method === 'PUT') {
    try {
      const payload = JSON.parse(await bodyText(input, init));
      if (payload.revision !== revision())
        return json({ error: '另一个页面更新了进度，请重新载入。' }, 409);
      const data = validateLearning(payload.data);
      return json({ data, revision: saveLearning(data) });
    } catch {
      return json({ error: '数据格式不正确，请检查词条和复习设置。' }, 400);
    }
  }
  if (url.pathname === '/api/learning/answer' && method === 'POST') {
    try {
      const body = JSON.parse(await bodyText(input, init));
      if (body.revision !== revision())
        return json({ error: '进度已更新，请重新载入后继续。' }, 409);
      const before = learning();
      let next = before;
      let award;
      if (body.kind === 'recognition') {
        const session = before.session;
        const word = before.words.find((item) => item.id === session?.queue[0]);
        if (
          !session ||
          !word ||
          session.id !== body.sessionId ||
          session.step !== body.step
        )
          return json({ error: '这张卡片已更新，请重新载入。' }, 409);
        next = answerRecognition(before, Boolean(body.known), body.step);
        award = addActivity({
          eventId: `recognition:${session.id}:${session.step}`,
          kind: 'recognition',
          itemKey: activityWord(word.word),
          label: word.word,
          correct: Boolean(body.known),
        });
      } else {
        const session = before.grammarSession;
        const question = session?.questions[body.step];
        if (
          !session ||
          !question ||
          session.id !== body.sessionId ||
          session.answers.length !== body.step
        )
          return json({ error: '本轮题目已更新，请重新载入。' }, 409);
        const correct = gradeGrammar(question, String(body.answer ?? ''));
        next = {
          ...before,
          grammarSession: {
            ...session,
            answers: [
              ...session.answers,
              { answer: String(body.answer).trim(), correct },
            ],
          },
        };
        award = addActivity({
          eventId: `grammar:${session.id}:${body.step}`,
          kind: 'grammar',
          itemKey: activityWord(`${question.prompt}|${question.answer}`),
          label: question.prompt.slice(0, 200),
          correct,
        });
      }
      return json({ data: next, revision: saveLearning(next), award });
    } catch {
      return json({ error: '答案没有保存，请重新载入。' }, 400);
    }
  }
  if (url.pathname === '/api/activity/check-in' && method === 'POST') {
    const day = chinaDay();
    const award = addActivity({
      eventId: `login:${day}`,
      kind: 'login',
      itemKey: day,
      label: '每日登录',
      correct: true,
    });
    return json({ ...award, checkedIn: true });
  }
  if (url.pathname === '/api/activity' && method === 'POST') {
    try {
      const body = JSON.parse(await bodyText(input, init));
      const correct = spellingCorrect(
        String(body.answer ?? ''),
        String(body.expected ?? ''),
      );
      return json(
        addActivity({
          eventId: String(body.eventId),
          kind: 'spelling',
          itemKey: activityWord(String(body.word)),
          label: String(body.word),
          correct,
        }),
      );
    } catch {
      return json({ error: '答案格式不正确。' }, 400);
    }
  }
  if (url.pathname === '/api/activity' && method === 'DELETE') {
    try {
      const payload = JSON.parse(await bodyText(input, init));
      if (String(payload.pin ?? '') !== '1111')
        return json({ error: '家长密码不正确。' }, 403);
      const scope = payload.scope === 'all' ? 'all' : 'today';
      const day = chinaDay();
      const rows = activities();
      const kept = rows.filter(
        (row) =>
          row.kind !== 'spelling' || (scope === 'today' && row.day !== day),
      );
      write(activityKey, kept);
      return json({ deleted: rows.length - kept.length });
    } catch {
      return json({ error: '清理记录请求格式不正确。' }, 400);
    }
  }
  if (url.pathname === '/api/activity' && method === 'GET') {
    try {
      const mode = (url.searchParams.get('mode') ?? 'day') as ActivityMode;
      const period = url.searchParams.get('period') ?? chinaDay().slice(0, 7);
      return json(activityReport(mode, period));
    } catch {
      return json({ error: '请选择有效的统计日期。' }, 400);
    }
  }
  if (url.pathname === '/api/forest' && method === 'GET')
    return json(forestBalance());
  if (url.pathname === '/api/forest' && method === 'POST') {
    try {
      const body = JSON.parse(await bodyText(input, init));
      const tree = treeSpecies(String(body.treeId));
      if (!tree) return json({ error: '请选择有效的树种。' }, 400);
      const planted = read<LocalTree[]>(forestKey, []);
      const existing = planted.find(
        (item) => item.requestId === body.requestId,
      );
      if (existing) return json({ ...forestBalance(), plantedId: existing.id });
      if (forestBalance().available < tree.cost)
        return json({ error: `还差积分，暂时不能种下${tree.name}。` }, 409);
      const item: LocalTree = {
        id: crypto.randomUUID(),
        requestId: String(body.requestId),
        treeId: tree.id,
        treeName: tree.name,
        cost: tree.cost,
        plantedAt: Date.now(),
      };
      write(forestKey, [...planted, item]);
      return json({ ...forestBalance(), plantedId: item.id });
    } catch {
      return json({ error: '请选择一棵树。' }, 400);
    }
  }
  if (url.pathname === '/api/word-resources' && method === 'GET') {
    const word = normalizeWord(url.searchParams.get('word') ?? '');
    if (!word) return json({ error: '请先填写英文单词。' }, 400);
    try {
      const response = await originalFetch(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
      );
      const parsed = response.ok
        ? parseDictionary(await response.json(), word)
        : parseDictionary([], word);
      parsed.notices.push('GitHub 版使用公开词典录音；找不到时可用设备朗读。');
      return json(parsed);
    } catch {
      return json({
        word,
        clips: [],
        examples: [],
        images: [],
        notices: ['词典暂时无法连接，请使用设备朗读。'],
        fetchedAt: Date.now(),
      });
    }
  }
  if (url.pathname === '/api/learning/image')
    return json(
      { error: 'GitHub 版请填写网络图片地址；本地图片暂不上传。' },
      400,
    );
  return json({ error: '此功能在 GitHub 版暂不可用。' }, 404);
}

if (browserOnly && typeof window !== 'undefined') {
  const marker = '__phonicsGithubFetch';
  const scope = window as unknown as Window & Record<string, unknown>;
  if (!scope[marker]) {
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => handleApi(originalFetch, input, init);
    scope[marker] = true;
  }
}

export { browserOnly as isGithubPages };

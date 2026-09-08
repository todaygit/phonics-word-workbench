export type RecognitionWord = {
  id: string;
  word: string;
  meaning: string;
  ipa: string;
  phonics: string;
  chapter: string;
  learnedOn: string;
  example: string;
  source: string;
  image: string;
  active: boolean;
  stage: number;
  due: number;
  seen: number;
};
export type GrammarQuestion = {
  id: string;
  chapter: string;
  prompt: string;
  type: 'choice' | 'fill';
  options: string[];
  answer: string;
  explanation: string;
  source: string;
  active: boolean;
};
export type RecognitionSession = {
  id: string;
  queue: string[];
  completed: string[];
  step: number;
};
export type GrammarSession = {
  questions: GrammarQuestion[];
  answers: { answer: string; correct: boolean }[];
};
export type LearningData = {
  version: 1;
  words: RecognitionWord[];
  grammar: GrammarQuestion[];
  plan: {
    newLimit: number;
    reviewLimit: number;
    intervals: number[];
    autoSpeak: boolean;
  };
  days: Record<
    string,
    { newIds: string[]; reviewIds: string[]; knownIds: string[] }
  >;
  session: RecognitionSession | null;
  grammarSession: GrammarSession | null;
  materialLocation: string;
};

export function dateKey(now = Date.now()) {
  // A child's learning day follows the family's China time, including on another device.
  return new Date(now + 8 * 3600000).toISOString().slice(0, 10);
}
export function emptyLearning(): LearningData {
  return {
    version: 1,
    words: [],
    grammar: [],
    plan: {
      newLimit: 6,
      reviewLimit: 12,
      intervals: [10, 1440, 2880, 5760, 10080, 21600, 43200],
      autoSpeak: false,
    },
    days: {},
    session: null,
    grammarSession: null,
    materialLocation: '',
  };
}
export function newRecognition(
  values: Partial<RecognitionWord> = {},
): RecognitionWord {
  return {
    id: crypto.randomUUID(),
    word: '',
    meaning: '',
    ipa: '',
    phonics: '',
    chapter: '每日新词',
    learnedOn: dateKey(),
    example: '',
    source: '',
    image: '',
    active: true,
    stage: 0,
    due: 0,
    seen: 0,
    ...values,
  };
}
export function newGrammar(): GrammarQuestion {
  return {
    id: crypto.randomUUID(),
    chapter: '自定义语法',
    prompt: '',
    type: 'choice',
    options: ['', ''],
    answer: '',
    explanation: '',
    source: '',
    active: true,
  };
}
export const exampleGrammar: GrammarQuestion[] = [
  {
    id: 'demo-a-cat',
    chapter: '自编示例 · a / an',
    prompt: 'This is ___ cat.',
    type: 'choice',
    options: ['a', 'an'],
    answer: 'a',
    explanation: 'cat 以辅音音素 /k/ 开头，用 a。',
    source: '工作台自编示例（非教材原题）',
    active: true,
  },
  {
    id: 'demo-an-apple',
    chapter: '自编示例 · a / an',
    prompt: 'I have ___ apple.',
    type: 'choice',
    options: ['a', 'an'],
    answer: 'an',
    explanation: 'apple 以元音音素 /æ/ 开头，用 an。',
    source: '工作台自编示例（非教材原题）',
    active: true,
  },
  {
    id: 'demo-an-egg',
    chapter: '自编示例 · a / an',
    prompt: 'This is ___ egg.（填写 a 或 an）',
    type: 'fill',
    options: [],
    answer: 'an',
    explanation: 'egg 以元音音素 /e/ 开头，用 an。',
    source: '工作台自编示例（非教材原题）',
    active: true,
  },
  {
    id: 'demo-am',
    chapter: '自编示例 · am / is / are',
    prompt: 'I ___ happy.',
    type: 'choice',
    options: ['am', 'is', 'are'],
    answer: 'am',
    explanation: 'I 搭配 am。',
    source: '工作台自编示例（非教材原题）',
    active: true,
  },
  {
    id: 'demo-is',
    chapter: '自编示例 · am / is / are',
    prompt: 'She ___ my friend.',
    type: 'choice',
    options: ['am', 'is', 'are'],
    answer: 'is',
    explanation: 'She 搭配 is。',
    source: '工作台自编示例（非教材原题）',
    active: true,
  },
  {
    id: 'demo-are',
    chapter: '自编示例 · am / is / are',
    prompt: 'They ___ playing.（填写 am、is 或 are）',
    type: 'fill',
    options: [],
    answer: 'are',
    explanation: 'They 搭配 are。',
    source: '工作台自编示例（非教材原题）',
    active: true,
  },
];
export function learningStats(data: LearningData, now = Date.now()) {
  const day = data.days[dateKey(now)] ?? {
    newIds: [],
    reviewIds: [],
    knownIds: [],
  };
  const valid = data.words.filter(
    (w) => w.active && w.learnedOn <= dateKey(now),
  );
  const enrolled = new Set([...day.newIds, ...day.reviewIds]);
  const fresh = valid.filter((w) => w.seen === 0 && !enrolled.has(w.id));
  const reviews = valid.filter((w) => w.seen > 0 && w.due <= now);
  const allowedReviews = reviews.filter((w) => enrolled.has(w.id));
  const moreReviews = reviews
    .filter((w) => !enrolled.has(w.id))
    .sort((a, b) => a.due - b.due);
  return {
    day,
    fresh: fresh.slice(0, Math.max(0, data.plan.newLimit - day.newIds.length)),
    reviews: [
      ...allowedReviews,
      ...moreReviews.slice(
        0,
        Math.max(0, data.plan.reviewLimit - day.reviewIds.length),
      ),
    ],
    dueCount: reviews.length,
    newCount: fresh.length,
  };
}
export function startRecognition(
  data: LearningData,
  now = Date.now(),
): LearningData {
  const active = new Set(data.words.filter((w) => w.active).map((w) => w.id));
  if (data.session?.queue.some((id) => active.has(id)))
    return {
      ...data,
      session: {
        ...data.session,
        queue: data.session.queue.filter((id) => active.has(id)),
      },
    };
  const { fresh, reviews, day } = learningStats(data, now);
  const queue = [...new Set([...reviews, ...fresh].map((w) => w.id))];
  if (!queue.length) return { ...data, session: null };
  const enrolled = new Set([...day.newIds, ...day.reviewIds]);
  const days = Object.fromEntries(
    Object.entries(data.days)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-60),
  );
  days[dateKey(now)] = {
    ...day,
    newIds: [...day.newIds, ...fresh.map((w) => w.id)],
    reviewIds: [
      ...day.reviewIds,
      ...reviews.filter((w) => !enrolled.has(w.id)).map((w) => w.id),
    ],
  };
  return {
    ...data,
    days,
    session: { id: crypto.randomUUID(), queue, completed: [], step: 0 },
  };
}
export function answerRecognition(
  data: LearningData,
  known: boolean,
  expectedStep: number,
  now = Date.now(),
): LearningData {
  const session = data.session;
  if (!session || session.step !== expectedStep || !session.queue.length)
    return data;
  const id = session.queue[0];
  const word = data.words.find((w) => w.id === id && w.active);
  if (!word)
    return {
      ...data,
      session: {
        ...session,
        queue: session.queue.slice(1),
        step: session.step + 1,
      },
    };
  const rest = session.queue.slice(1).filter((item) => item !== id);
  const queue = known ? rest : [...rest.slice(0, 2), id, ...rest.slice(2)];
  const interval =
    data.plan.intervals[Math.min(word.stage, data.plan.intervals.length - 1)];
  const words = data.words.map((w) =>
    w.id !== id
      ? w
      : {
          ...w,
          seen: w.seen + 1,
          stage: known ? Math.min(w.stage + 1, data.plan.intervals.length) : 0,
          due: known ? now + interval * 60000 : now,
        },
  );
  const day = data.days[dateKey(now)] ?? {
    newIds: [],
    reviewIds: [],
    knownIds: [],
  };
  const retainedDays = Object.fromEntries(
    Object.entries(data.days)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-60),
  );
  return {
    ...data,
    words,
    days: {
      ...retainedDays,
      [dateKey(now)]: {
        ...day,
        knownIds: known
          ? [...new Set([...day.knownIds, id])]
          : day.knownIds.filter((item) => item !== id),
      },
    },
    session: {
      ...session,
      queue,
      step: session.step + 1,
      completed: known
        ? [...new Set([...session.completed, id])]
        : session.completed,
    },
  };
}
export function normalizeGrammar(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}
export function gradeGrammar(question: GrammarQuestion, answer: string) {
  return question.answer
    .split('|')
    .some((item) => normalizeGrammar(item) === normalizeGrammar(answer));
}

// Validate both API writes and imported backups; never silently turn a bad backup into an empty bank.
export function validateLearning(value: unknown): LearningData {
  const fail = (): never => {
    throw new Error('学习数据格式不正确，请检查词条、题目和复习间隔。');
  };
  const obj = (v: unknown): Record<string, unknown> =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : fail();
  const str = (v: unknown, max = 2000, required = false): string =>
    typeof v === 'string' &&
    v.length <= max &&
    (!required || v.trim().length > 0)
      ? v
      : fail();
  const num = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number =>
    typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
      ? v
      : fail();
  const bool = (v: unknown): boolean => (typeof v === 'boolean' ? v : fail());
  const array = (v: unknown, max = 5000): unknown[] =>
    Array.isArray(v) && v.length <= max ? v : fail();
  const strings = (v: unknown, max = 5000) =>
    array(v, max).map((item) => str(item, 100, true));
  const unique = (items: string[]) => {
    if (new Set(items).size !== items.length) fail();
    return items;
  };
  const date = (v: unknown) => {
    const text = str(v, 10, true);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(text) ||
      !Number.isFinite(Date.parse(text)) ||
      new Date(text).toISOString().slice(0, 10) !== text
    )
      fail();
    return text;
  };
  const question = (v: unknown): GrammarQuestion => {
    const q = obj(v);
    const type = q.type === 'choice' || q.type === 'fill' ? q.type : fail();
    const options = array(q.options, 6).map((x) => str(x, 250, true));
    const answer = str(q.answer, 500, true);
    if (
      type === 'choice' &&
      (options.length < 2 ||
        !options.includes(answer) ||
        new Set(options).size !== options.length)
    )
      fail();
    if (!answer.split('|').every((x) => x.trim())) fail();
    return {
      id: str(q.id, 100, true),
      chapter: str(q.chapter, 120, true),
      prompt: str(q.prompt, 2000, true),
      type,
      options,
      answer,
      explanation: str(q.explanation),
      source: str(q.source, 500),
      active: bool(q.active),
    };
  };
  const data = obj(value);
  if (data.version !== 1) fail();
  const plan = obj(data.plan);
  const intervals = array(plan.intervals, 12).map((x) => num(x, 1, 525600));
  if (
    !intervals.length ||
    intervals.some((n, i) => i > 0 && n <= intervals[i - 1])
  )
    fail();
  const words = array(data.words).map((v) => {
    const w = obj(v);
    const image = str(w.image, 200);
    if (image && !/^\/api\/learning\/image\?id=[a-f0-9-]{36}$/.test(image))
      fail();
    return {
      id: str(w.id, 100, true),
      word: str(w.word, 100, true),
      meaning: str(w.meaning, 500, true),
      ipa: str(w.ipa, 200),
      phonics: str(w.phonics, 300),
      chapter: str(w.chapter, 120, true),
      learnedOn: date(w.learnedOn),
      example: str(w.example),
      source: str(w.source, 500),
      image,
      active: bool(w.active),
      stage: num(w.stage, 0, 12),
      due: num(w.due),
      seen: num(w.seen),
    };
  });
  unique(words.map((w) => w.id));
  const grammar = array(data.grammar, 2000).map(question);
  unique(grammar.map((q) => q.id));
  const days: LearningData['days'] = {};
  if (Object.keys(obj(data.days)).length > 62) fail();
  for (const [key, value] of Object.entries(obj(data.days))) {
    date(key);
    const day = obj(value);
    days[key] = {
      newIds: unique(strings(day.newIds)),
      reviewIds: unique(strings(day.reviewIds)),
      knownIds: unique(strings(day.knownIds)),
    };
    if (days[key].newIds.some((id) => days[key].reviewIds.includes(id))) fail();
  }
  let session: RecognitionSession | null = null;
  if (data.session !== null) {
    const s = obj(data.session);
    session = {
      id: str(s.id, 100, true),
      queue: unique(strings(s.queue)),
      completed: unique(strings(s.completed)),
      step: num(s.step),
    };
    if (session.queue.some((id) => !words.some((w) => w.id === id && w.active)))
      fail();
  }
  let grammarSession: GrammarSession | null = null;
  if (data.grammarSession !== null) {
    const g = obj(data.grammarSession);
    const questions = array(g.questions, 50).map(question);
    const answers = array(g.answers, 50).map((x, i) => {
      const a = obj(x);
      const answer = str(a.answer, 500, true);
      if (!questions[i]) fail();
      return { answer, correct: gradeGrammar(questions[i], answer) };
    });
    if (!questions.length) fail();
    grammarSession = { questions, answers };
  }
  return {
    version: 1,
    words,
    grammar,
    plan: {
      newLimit: num(plan.newLimit, 0, 100),
      reviewLimit: num(plan.reviewLimit, 0, 200),
      intervals,
      autoSpeak: bool(plan.autoSpeak),
    },
    days,
    session,
    grammarSession,
    materialLocation: str(data.materialLocation, 1000),
  };
}

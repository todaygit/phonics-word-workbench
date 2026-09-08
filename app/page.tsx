'use client';
/* oxlint-disable react/react-compiler, jsx-a11y/label-has-associated-control */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookMarked,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileJson,
  Flame,
  Headphones,
  Library,
  ListChecks,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Shuffle,
  Sparkles,
  Target,
  Trash2,
  Upload,
  Volume2,
  XCircle,
} from 'lucide-react';
import rawBank from './word-bank-v08.json';
import { useLearning } from './use-learning';
import {
  learningStats,
  validateLearning,
  type LearningData,
} from './learning-model';
import {
  RecognitionView,
  GrammarView,
  RecognitionLibrary,
  GrammarLibrary,
  RecognitionPlan,
  LearningStatus,
} from './learning-views';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Sidebar,
  SidebarProvider,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';

type WordStatus = 'new' | 'learning' | 'mastered';
type QuizMode = 'sequence' | 'chapter' | 'random';
type QuizType = 'missing' | 'full';

type Chapter = {
  id: string;
  order: number;
  title: string;
  rule: string;
  childNote: string;
  wordCount?: number;
};
type Word = {
  id: string;
  chapterId: string;
  chapterOrder: number;
  wordOrder: number;
  level: string;
  word: string;
  ipa: string;
  phonics: string;
  meaning: string;
  example: string;
  status: WordStatus;
  active: boolean;
  interval: number;
  nextReview: string;
  reviews: number;
};
type Settings = {
  newPerDay: number;
  reviewPerDay: number;
  defaultQuizMode: QuizMode;
  defaultQuizType: QuizType;
  quizCount: number;
  autoSpeak: boolean;
};
type QuizSession = {
  queue: Word[];
  mode: QuizMode;
  type: QuizType;
  startCursor: number;
  cursorAdvance: number;
};
type QuizResult = {
  wordId: string;
  word: string;
  answer: string;
  correct: boolean;
};

const BANK_VERSION = 'v0.8';
const OLD_DEMO_IDS = new Set([
  'cat',
  'map',
  'fish',
  'ship',
  'sun',
  'bed',
  'frog',
  'green',
  'rain',
  'chair',
  'moon',
  'star',
]);

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

const DEFAULT_SETTINGS: Settings = {
  newPerDay: 6,
  reviewPerDay: 12,
  defaultQuizMode: 'sequence',
  defaultQuizType: 'missing',
  quizCount: 10,
  autoSpeak: false,
};
const DEFAULT_CHAPTERS = rawBank.chapters as Chapter[];
const DEFAULT_WORDS: Word[] = rawBank.words.map((item) => ({
  ...item,
  status: 'new' as WordStatus,
  active: true,
  interval: 0,
  nextReview: localDateKey(),
  reviews: 0,
}));
const modeInfo: Record<QuizMode, { title: string; description: string }> = {
  sequence: {
    title: '按学习顺序',
    description: '从上次位置继续，严格按 v0.8 章节和词序测试。',
  },
  chapter: {
    title: '选择章节',
    description: '家长或孩子勾选几个章节，章节内仍按学习顺序。',
  },
  random: {
    title: '随机挑战',
    description: '从已启用词库中随机抽词，适合后期综合检查。',
  },
};
const typeInfo: Record<QuizType, { title: string; description: string }> = {
  missing: {
    title: '缺字母测试',
    description: '保留部分字母，只填写空缺位置。适合学习初期。',
  },
  full: {
    title: '全单词测试',
    description: '听发音、看中文，完整拼写整个单词。',
  },
};

function sortWords(words: Word[]) {
  return [...words].sort(
    (a, b) => a.chapterOrder - b.chapterOrder || a.wordOrder - b.wordOrder,
  );
}

function speak(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.76;
  window.speechSynthesis.speak(utterance);
}

function loadStored<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeAnswer(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, ' ');
}

function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function createMissingPrompt(word: string) {
  const letters = word.split('');
  const letterIndexes = letters
    .map((letter, index) => (/[a-z]/i.test(letter) ? index : -1))
    .filter((index) => index >= 0);
  const blankCount =
    letterIndexes.length <= 3 ? 1 : letterIndexes.length <= 6 ? 2 : 3;
  const chosen = new Set<number>();
  for (let slot = 1; slot <= blankCount; slot += 1) {
    chosen.add(
      letterIndexes[
        Math.round(((letterIndexes.length - 1) * slot) / (blankCount + 1))
      ],
    );
  }
  for (const index of letterIndexes) {
    if (chosen.size >= blankCount) break;
    chosen.add(index);
  }
  return {
    mask: letters
      .map((letter, index) => (chosen.has(index) ? '_' : letter))
      .join(''),
    answer: letters.filter((_, index) => chosen.has(index)).join(''),
  };
}

function makeBlankWord(chapter: Chapter): Word {
  return {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    chapterId: chapter.id,
    chapterOrder: chapter.order,
    wordOrder: 1,
    level: '自定义',
    word: '',
    ipa: '',
    phonics: '',
    meaning: '',
    example: '',
    status: 'new',
    active: true,
    interval: 0,
    nextReview: localDateKey(),
    reviews: 0,
  };
}

export default function Home() {
  const learning = useLearning();
  const recognitionStats = learningStats(learning.data);
  const [chapters, setChapters] = useState<Chapter[]>(DEFAULT_CHAPTERS);
  const [words, setWords] = useState<Word[]>(DEFAULT_WORDS);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [tab, setTab] = useState('today');
  const [parentOpen, setParentOpen] = useState(false);
  const [parentTab, setParentTab] = useState('plan');
  const [hydrated, setHydrated] = useState(false);
  const [sequenceCursor, setSequenceCursor] = useState(0);
  const [completedToday, setCompletedToday] = useState(0);
  const [quizMode, setQuizMode] = useState<QuizMode>('sequence');
  const [quizType, setQuizType] = useState<QuizType>('missing');
  const [selectedChapters, setSelectedChapters] = useState<string[]>([
    DEFAULT_CHAPTERS[0]?.id ?? '',
  ]);
  const [session, setSession] = useState<QuizSession | null>(null);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizInput, setQuizInput] = useState('');
  const [checked, setChecked] = useState(false);
  const [quizFinished, setQuizFinished] = useState(false);
  const [results, setResults] = useState<QuizResult[]>([]);
  const [quizMessage, setQuizMessage] = useState('');
  const [query, setQuery] = useState('');
  const [chapterFilter, setChapterFilter] = useState('all');
  const [wordPage, setWordPage] = useState(1);
  const [draftWord, setDraftWord] = useState<Word | null>(null);
  const [isNewWord, setIsNewWord] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [parentChapterId, setParentChapterId] = useState(
    DEFAULT_CHAPTERS[0]?.id ?? '',
  );
  const importRef = useRef<HTMLInputElement>(null);
  const answerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const storedVersion = window.localStorage.getItem('phonics.bankVersion');
    const storedWords = loadStored<Word[]>('phonics.words', []);
    if (storedVersion === BANK_VERSION && storedWords.length) {
      setWords(storedWords);
      setChapters(loadStored<Chapter[]>('phonics.chapters', DEFAULT_CHAPTERS));
    } else {
      const customWords = storedWords.filter(
        (word) => !OLD_DEMO_IDS.has(word.id),
      );
      setWords([...DEFAULT_WORDS, ...customWords]);
      setChapters(DEFAULT_CHAPTERS);
      window.localStorage.setItem('phonics.bankVersion', BANK_VERSION);
    }
    const mergedSettings = {
      ...DEFAULT_SETTINGS,
      ...loadStored<Partial<Settings>>('phonics.settings', {}),
    };
    setSettings(mergedSettings);
    setQuizMode(mergedSettings.defaultQuizMode);
    setQuizType(mergedSettings.defaultQuizType);
    setSequenceCursor(loadStored('phonics.sequenceCursor', 0));
    setCompletedToday(loadStored(`phonics.completed.${localDateKey()}`, 0));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem('phonics.words', JSON.stringify(words));
    window.localStorage.setItem('phonics.chapters', JSON.stringify(chapters));
    window.localStorage.setItem('phonics.settings', JSON.stringify(settings));
    window.localStorage.setItem(
      'phonics.sequenceCursor',
      JSON.stringify(sequenceCursor),
    );
    window.localStorage.setItem(
      `phonics.completed.${localDateKey()}`,
      JSON.stringify(completedToday),
    );
    window.localStorage.setItem('phonics.bankVersion', BANK_VERSION);
  }, [chapters, completedToday, hydrated, sequenceCursor, settings, words]);

  const activeWords = useMemo(
    () => sortWords(words.filter((word) => word.active)),
    [words],
  );
  const orderedChapters = useMemo(
    () => [...chapters].sort((a, b) => a.order - b.order),
    [chapters],
  );
  const currentLearningWord =
    activeWords[sequenceCursor % Math.max(activeWords.length, 1)];
  const currentChapter =
    chapters.find((chapter) => chapter.id === currentLearningWord?.chapterId) ??
    chapters[0];
  const dueWords = useMemo(
    () =>
      activeWords.filter(
        (word) => word.status !== 'new' && word.nextReview <= localDateKey(),
      ),
    [activeWords],
  );
  const filteredWords = useMemo(() => {
    const lower = query.trim().toLowerCase();
    return sortWords(
      words.filter((word) => {
        const matchesChapter =
          chapterFilter === 'all' || word.chapterId === chapterFilter;
        return (
          matchesChapter &&
          (!lower ||
            `${word.word} ${word.meaning} ${word.ipa} ${word.phonics}`
              .toLowerCase()
              .includes(lower))
        );
      }),
    );
  }, [chapterFilter, query, words]);
  const pageSize = 60;
  const totalPages = Math.max(1, Math.ceil(filteredWords.length / pageSize));
  const visibleWords = filteredWords.slice(
    (wordPage - 1) * pageSize,
    wordPage * pageSize,
  );
  const activeParentChapter =
    chapters.find((chapter) => chapter.id === parentChapterId) ?? chapters[0];
  const currentQuizWord = session?.queue[quizIndex] ?? null;
  const missingPrompt = currentQuizWord
    ? createMissingPrompt(currentQuizWord.word)
    : null;
  const expectedAnswer = currentQuizWord
    ? session?.type === 'missing'
      ? (missingPrompt?.answer ?? '')
      : currentQuizWord.word
    : '';
  const latestResult = results[results.length - 1];
  const selectedQuizWordCount = activeWords.filter((word) =>
    selectedChapters.includes(word.chapterId),
  ).length;
  const launchCount =
    quizMode === 'chapter'
      ? selectedQuizWordCount
      : Math.min(settings.quizCount, activeWords.length);

  useEffect(() => {
    setWordPage(1);
  }, [chapterFilter, query]);
  useEffect(() => {
    if (wordPage > totalPages) setWordPage(totalPages);
  }, [totalPages, wordPage]);
  useEffect(() => {
    if (!currentQuizWord || checked || quizFinished) return;
    setTimeout(() => answerRef.current?.focus(), 80);
    if (settings.autoSpeak) speak(currentQuizWord.word);
  }, [checked, currentQuizWord, quizFinished, settings.autoSpeak]);

  useEffect(() => {
    type WebTool = {
      name: string;
      title: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute: (input: unknown) => object | Promise<object>;
    };
    type WebContext = {
      registerTool: (
        tool: WebTool,
        options?: { signal?: AbortSignal },
      ) => void | Promise<void>;
    };
    const context = (document as Document & { modelContext?: WebContext })
      .modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: WebTool) => {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => undefined);
      } catch {
        /* optional host integration */
      }
    };
    register({
      name: 'get_phonics_workbench_summary',
      title: '查看自然拼读工作台概况',
      description: '查看 v0.8 词库、当前学习位置和今日完成量，不修改数据。',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: () => ({
        version: BANK_VERSION,
        chapters: chapters.length,
        words: words.length,
        activeWords: activeWords.length,
        currentChapter: currentChapter?.title,
        completedToday,
      }),
    });
    register({
      name: 'configure_phonics_parent_controls',
      title: '调整家长控制设置',
      description: '调整每日新词、复习量、默认测试方式和每次题数。',
      inputSchema: {
        type: 'object',
        properties: {
          newPerDay: { type: 'integer', minimum: 0, maximum: 30 },
          reviewPerDay: { type: 'integer', minimum: 0, maximum: 50 },
          quizCount: { type: 'integer', minimum: 5, maximum: 50 },
          defaultQuizMode: {
            type: 'string',
            enum: ['sequence', 'chapter', 'random'],
          },
          defaultQuizType: { type: 'string', enum: ['missing', 'full'] },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: (input) => {
        if (!input || typeof input !== 'object' || Array.isArray(input))
          throw new Error('设置参数必须是对象。');
        setSettings((current) => ({
          ...current,
          ...(input as Partial<Settings>),
        }));
        setTab('settings');
        setParentOpen(true);
        setParentTab('plan');
        return { updated: true };
      },
    });
    register({
      name: 'add_phonics_word',
      title: '加入一个拼读单词',
      description: '向家长词库加入英文、中文、音标、拆分和例句。',
      inputSchema: {
        type: 'object',
        properties: {
          word: { type: 'string', minLength: 1 },
          meaning: { type: 'string', minLength: 1 },
          ipa: { type: 'string' },
          phonics: { type: 'string' },
          example: { type: 'string' },
          chapterId: { type: 'string' },
        },
        required: ['word', 'meaning'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: (input) => {
        const value = input as Partial<Word>;
        const chapter =
          chapters.find((item) => item.id === value.chapterId) ?? chapters[0];
        if (
          !chapter ||
          !String(value.word ?? '').trim() ||
          !String(value.meaning ?? '').trim()
        )
          throw new Error('英文和中文词义不能为空。');
        const addition = {
          ...makeBlankWord(chapter),
          word: String(value.word).trim(),
          meaning: String(value.meaning).trim(),
          ipa: String(value.ipa ?? '').trim(),
          phonics: String(value.phonics ?? '').trim(),
          example: String(value.example ?? '').trim(),
        };
        setWords((current) => [
          ...current,
          {
            ...addition,
            wordOrder:
              Math.max(
                0,
                ...current
                  .filter((word) => word.chapterId === chapter.id)
                  .map((word) => word.wordOrder),
              ) + 1,
          },
        ]);
        setTab('settings');
        setParentOpen(true);
        setParentTab('library');
        return { added: addition.word, chapter: chapter.title };
      },
    });
    return () => lifecycle.abort();
  }, [
    activeWords.length,
    chapters,
    completedToday,
    currentChapter?.title,
    words.length,
  ]);

  function buildQuiz(mode = quizMode, type = quizType) {
    if (!activeWords.length) {
      setQuizMessage('当前没有启用的单词，请到家长控制里启用或添加单词。');
      return;
    }
    let queue: Word[] = [];
    let startCursor = 0;
    let cursorAdvance = 0;
    if (mode === 'sequence') {
      startCursor = sequenceCursor % activeWords.length;
      queue = [
        ...activeWords.slice(startCursor),
        ...activeWords.slice(0, startCursor),
      ].slice(0, Math.min(settings.quizCount, activeWords.length));
      cursorAdvance = queue.length;
    } else if (mode === 'chapter') {
      queue = activeWords.filter((word) =>
        selectedChapters.includes(word.chapterId),
      );
    } else {
      queue = shuffle(activeWords).slice(
        0,
        Math.min(settings.quizCount, activeWords.length),
      );
    }
    if (!queue.length) {
      setQuizMessage('请至少选择一个有启用单词的章节。');
      return;
    }
    setQuizMessage('');
    setSession({ queue, mode, type, startCursor, cursorAdvance });
    setQuizIndex(0);
    setQuizInput('');
    setChecked(false);
    setQuizFinished(false);
    setResults([]);
  }

  function buildDailyQuiz() {
    if (!activeWords.length) {
      setQuizMessage('当前没有启用的单词，请到家长控制里启用或添加单词。');
      setTab('test');
      return;
    }
    const startCursor = sequenceCursor % activeWords.length;
    const wrapped = [
      ...activeWords.slice(startCursor),
      ...activeWords.slice(0, startCursor),
    ];
    const fresh = wrapped
      .filter((word) => word.status === 'new')
      .slice(0, settings.newPerDay);
    const reviews = dueWords.slice(0, settings.reviewPerDay);
    const seen = new Set<string>();
    const queue = [...reviews, ...fresh].filter((word) => {
      if (seen.has(word.id)) return false;
      seen.add(word.id);
      return true;
    });
    if (!queue.length) {
      buildQuiz('sequence', settings.defaultQuizType);
      return;
    }
    setSession({
      queue,
      mode: 'sequence',
      type: settings.defaultQuizType,
      startCursor,
      cursorAdvance: fresh.length,
    });
    setQuizIndex(0);
    setQuizInput('');
    setChecked(false);
    setQuizFinished(false);
    setResults([]);
  }

  function checkAnswer() {
    if (!currentQuizWord || !quizInput.trim() || checked) return;
    const isCorrect =
      normalizeAnswer(quizInput) === normalizeAnswer(expectedAnswer);
    setResults((current) => [
      ...current,
      {
        wordId: currentQuizWord.id,
        word: currentQuizWord.word,
        answer: quizInput,
        correct: isCorrect,
      },
    ]);
    setChecked(true);
    setCompletedToday((value) => value + 1);
    setWords((items) =>
      items.map((word) => {
        if (word.id !== currentQuizWord.id) return word;
        const nextReviews = word.reviews + 1;
        const interval = isCorrect
          ? Math.max(1, Math.round(Math.max(word.interval, 1) * 1.8))
          : 1;
        return {
          ...word,
          reviews: nextReviews,
          interval,
          nextReview: isCorrect ? addDays(interval) : localDateKey(),
          status: isCorrect && nextReviews >= 3 ? 'mastered' : 'learning',
        };
      }),
    );
  }

  function nextQuestion() {
    if (!session) return;
    if (quizIndex < session.queue.length - 1) {
      setQuizIndex((value) => value + 1);
      setQuizInput('');
      setChecked(false);
      return;
    }
    if (session.mode === 'sequence' && activeWords.length)
      setSequenceCursor(
        (session.startCursor + session.cursorAdvance) % activeWords.length,
      );
    setQuizFinished(true);
  }

  function closeSession() {
    setSession(null);
    setQuizFinished(false);
    setTab('test');
  }

  function saveDraftWord() {
    if (!draftWord?.word.trim() || !draftWord.meaning.trim()) return;
    const chapter =
      chapters.find((item) => item.id === draftWord.chapterId) ?? chapters[0];
    if (!chapter) return;
    const saved: Word = {
      ...draftWord,
      chapterOrder: chapter.order,
      wordOrder: draftWord.wordOrder,
      word: draftWord.word.trim(),
      meaning: draftWord.meaning.trim(),
      ipa: draftWord.ipa.trim(),
      phonics: draftWord.phonics.trim(),
      example: draftWord.example.trim(),
    };
    setWords((items) =>
      isNewWord
        ? [...items, saved]
        : items.map((word) => (word.id === saved.id ? saved : word)),
    );
    setDraftWord(null);
  }

  function addChapter() {
    const order = Math.max(0, ...chapters.map((chapter) => chapter.order)) + 1;
    const chapter: Chapter = {
      id: `custom-${Date.now()}`,
      order,
      title: `自定义章节 ${order}`,
      rule: '请填写本章规则说明。',
      childNote: '请填写给孩子的讲法。',
      wordCount: 0,
    };
    setChapters((items) => [...items, chapter]);
    setParentChapterId(chapter.id);
  }

  function importBulkWords() {
    if (!activeParentChapter) return;
    const startOrder = Math.max(
      0,
      ...words
        .filter((word) => word.chapterId === activeParentChapter.id)
        .map((word) => word.wordOrder),
    );
    const additions = bulkText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        const [
          word,
          meaning,
          ipa = '',
          phonics = '',
          example = '',
          level = '自定义',
        ] = line.split(/\t|，|,/).map((cell) => cell.trim());
        if (!word || !meaning) return null;
        return {
          ...makeBlankWord(activeParentChapter),
          id: `bulk-${Date.now()}-${index}`,
          word,
          meaning,
          ipa,
          phonics,
          example,
          level,
          wordOrder: startOrder + index + 1,
        };
      })
      .filter((word): word is Word => Boolean(word));
    setWords((items) => [...items, ...additions]);
    setBulkText('');
    setBulkOpen(false);
  }

  function exportBackup() {
    const payload = JSON.stringify(
      {
        version: BANK_VERSION,
        exportedAt: new Date().toISOString(),
        chapters,
        words,
        settings,
        sequenceCursor,
        learning: learning.ready ? learning.data : undefined,
      },
      null,
      2,
    );
    const url = URL.createObjectURL(
      new Blob([payload], { type: 'application/json' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `自然拼读工作台-${localDateKey()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importBackup(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as {
        chapters?: Chapter[];
        words?: Word[];
        settings?: Partial<Settings>;
        sequenceCursor?: number;
        learning?: LearningData;
      };
      if (!Array.isArray(data.chapters) || !Array.isArray(data.words))
        throw new Error('invalid');
      if (
        data.learning &&
        !(await learning.save(() => validateLearning(data.learning)))
      )
        return;
      setChapters(data.chapters);
      setWords(data.words);
      setSettings((current) => ({ ...current, ...data.settings }));
      setSequenceCursor(
        Number.isInteger(data.sequenceCursor) ? Number(data.sequenceCursor) : 0,
      );
      setQuizMessage('备份已恢复。');
    } catch {
      setQuizMessage('这个文件不是有效的工作台备份。');
    } finally {
      event.target.value = '';
    }
  }

  function resetToV08() {
    setChapters(DEFAULT_CHAPTERS);
    setWords(DEFAULT_WORDS);
    setSequenceCursor(0);
    setCompletedToday(0);
    setSettings(DEFAULT_SETTINGS);
    setSelectedChapters([DEFAULT_CHAPTERS[0]?.id ?? '']);
  }

  if (session) {
    if (quizFinished) {
      const correctCount = results.filter((result) => result.correct).length;
      const wrongResults = results.filter((result) => !result.correct);
      return (
        <main className="session-shell">
          <section className="finish-card">
            <div className="finish-burst">
              <Sparkles />
            </div>
            <p className="eyebrow">本轮完成</p>
            <h1>
              {correctCount} / {results.length} 拼对了
            </h1>
            <p>
              {wrongResults.length
                ? '拼错的词已经放回近期复习，下一轮会更有针对性。'
                : '全部拼对，继续保持！'}
            </p>
            {wrongResults.length > 0 && (
              <div className="mistake-list">
                <strong>本轮需要再看一眼</strong>
                <div>
                  {wrongResults.map((result) => (
                    <span key={result.wordId}>{result.word}</span>
                  ))}
                </div>
              </div>
            )}
            <div className="finish-actions">
              <Button variant="outline" onClick={closeSession}>
                返回测试中心
              </Button>
              <Button
                className="primary-action"
                onClick={() => buildQuiz(session.mode, session.type)}
              >
                <RotateCcw /> 再来一轮
              </Button>
            </div>
          </section>
        </main>
      );
    }
    if (!currentQuizWord) return null;
    const chapter = chapters.find(
      (item) => item.id === currentQuizWord.chapterId,
    );
    const isLatestCorrect = latestResult?.correct;
    return (
      <main className="session-shell">
        <div className="session-topbar">
          <Button variant="ghost" onClick={closeSession}>
            <ArrowLeft /> 退出本轮
          </Button>
          <div className="session-progress">
            <Progress
              value={
                ((quizIndex + (checked ? 1 : 0)) / session.queue.length) * 100
              }
            />
            <span>
              {quizIndex + 1} / {session.queue.length}
            </span>
          </div>
        </div>
        <section
          className={`spelling-card ${checked ? (isLatestCorrect ? 'answer-right' : 'answer-wrong') : ''}`}
        >
          <div className="study-meta">
            <Badge variant="secondary">{chapter?.title ?? '自定义章节'}</Badge>
            <span>
              {session.type === 'missing' ? '缺字母测试' : '全单词测试'}
            </span>
          </div>
          <button
            className="sound-button"
            onClick={() => speak(currentQuizWord.word)}
            aria-label="播放单词发音"
          >
            <Volume2 />
          </button>
          <p className="meaning-prompt">{currentQuizWord.meaning}</p>
          {session.type === 'missing' ? (
            <div className="missing-word" aria-label="缺字母单词">
              {missingPrompt?.mask}
            </div>
          ) : (
            <div className="listen-prompt">
              <Headphones />
              <span>听一听，拼出完整单词</span>
            </div>
          )}
          {!checked ? (
            <form
              className="answer-form"
              onSubmit={(event) => {
                event.preventDefault();
                checkAnswer();
              }}
            >
              <label htmlFor="spelling-answer">
                {session.type === 'missing'
                  ? '依次填写缺少的字母（不用空格）'
                  : '输入完整单词'}
              </label>
              <Input
                ref={answerRef}
                id="spelling-answer"
                autoComplete="off"
                spellCheck={false}
                value={quizInput}
                onChange={(event) => setQuizInput(event.target.value)}
                placeholder={
                  session.type === 'missing' ? '填入空缺字母' : '在这里拼写'
                }
              />
              <Button
                type="submit"
                className="primary-action"
                disabled={!quizInput.trim()}
              >
                <Check /> 检查答案
              </Button>
            </form>
          ) : (
            <div className="answer-feedback">
              <div className="feedback-title">
                {isLatestCorrect ? <CheckCircle2 /> : <XCircle />}
                <strong>
                  {isLatestCorrect
                    ? '拼对了！'
                    : `正确答案：${currentQuizWord.word}`}
                </strong>
              </div>
              <div className="word-details">
                <span>
                  <b>音标</b>
                  {currentQuizWord.ipa || '未填写'}
                </span>
                <span>
                  <b>拆分</b>
                  {currentQuizWord.phonics || '未填写'}
                </span>
                <span>
                  <b>例句</b>
                  {currentQuizWord.example || '未填写'}
                </span>
              </div>
              <Button className="primary-action" onClick={nextQuestion}>
                {quizIndex < session.queue.length - 1 ? '下一题' : '查看成绩'}{' '}
                <ChevronRight />
              </Button>
            </div>
          )}
        </section>
      </main>
    );
  }

  return (
    <SidebarProvider className="app-shell">
      <Sidebar collapsible="none" className="app-sidebar">
        <SidebarHeader className="sidebar-brand">
          <div className="brand">
            <div className="brand-mark">
              <span>P</span>
              <span>B</span>
            </div>
            <div>
              <strong>拼读小队</strong>
              <small>英语学习工作台</small>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <nav aria-label="主导航">
            <SidebarMenu className="app-navigation">
              {[
                { value: 'today', label: '今日学习', icon: BookOpen },
                { value: 'recognition', label: '单词背诵', icon: BookMarked },
                { value: 'test', label: '拼写测试', icon: Target },
                { value: 'grammar', label: '语法测试', icon: ListChecks },
                { value: 'settings', label: '设置', icon: Settings2 },
              ].map(({ value, label, icon: Icon }) => (
                <SidebarMenuItem key={value}>
                  <SidebarMenuButton
                    isActive={tab === value}
                    aria-current={tab === value ? 'page' : undefined}
                    onClick={() => {
                      setTab(value);
                      if (value === 'settings') setParentOpen(false);
                    }}
                  >
                    <Icon />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </nav>
        </SidebarContent>
      </Sidebar>
      <div className="app-main">
        <header className="app-header">
          <span className="header-location">
            {
              {
                today: '今日学习',
                recognition: '单词背诵',
                test: '拼写测试',
                grammar: '语法测试',
                settings: '设置',
              }[tab]
            }
          </span>
          <div className="header-status">
            <span className="date-label">
              {new Intl.DateTimeFormat('zh-CN', {
                month: 'long',
                day: 'numeric',
                weekday: 'long',
              }).format(new Date())}
            </span>
            <span className="streak">
              <Flame /> 今天认出 {recognitionStats.day.knownIds.length} 词 ·
              拼写 {completedToday} 题
            </span>
          </div>
        </header>
        <main className="workspace">
          {tab === 'today' && (
            <section className="today-learning">
              <div className="page-title-row">
                <div>
                  <p className="eyebrow">TODAY</p>
                  <h1>今天，从认识开始</h1>
                  <p>认识单词、练习拼写、测试语法，分开进行。</p>
                </div>
              </div>
              <LearningStatus store={learning} />
              <div className="today-recognition panel">
                <BookOpen />
                <div>
                  <h2>单词背诵</h2>
                  <p>
                    新词 {recognitionStats.fresh.length} 个 · 可复习{' '}
                    {recognitionStats.reviews.length} 个
                    {learning.data.session?.queue.length
                      ? ` · 上次待认 ${learning.data.session.queue.length} 个`
                      : ''}
                  </p>
                  <p className="muted">看单词和图片，口头回答，不要求默写。</p>
                </div>
                <Button onClick={() => setTab('recognition')}>
                  去背单词 <ChevronRight />
                </Button>
              </div>
              <div className="today-secondary">
                <div className="panel">
                  <Target />
                  <h2>拼写测试</h2>
                  <p>
                    {currentChapter?.title ?? '自然拼读'} · 今日已答{' '}
                    {completedToday} 题
                  </p>
                  <Button variant="outline" onClick={() => setTab('test')}>
                    去练拼写
                  </Button>
                </div>
                <div className="panel">
                  <ListChecks />
                  <h2>语法测试</h2>
                  <p>
                    {learning.data.grammar.filter((q) => q.active).length}{' '}
                    道已启用题目 · 选择题与填空题
                  </p>
                  <Button variant="outline" onClick={() => setTab('grammar')}>
                    去测语法
                  </Button>
                </div>
              </div>
            </section>
          )}
          {tab === 'recognition' && (
            <RecognitionView
              store={learning}
              manage={() => {
                setTab('settings');
                setParentOpen(true);
                setParentTab('recognition-library');
              }}
            />
          )}
          {tab === 'grammar' && (
            <GrammarView
              store={learning}
              manage={() => {
                setTab('settings');
                setParentOpen(true);
                setParentTab('grammar-library');
              }}
            />
          )}

          {tab === 'test' && (
            <section className="test-center">
              <div className="page-title-row">
                <div>
                  <p className="eyebrow">SPELLING TEST</p>
                  <h1>拼写测试中心</h1>
                  <p>
                    先选测试范围，再选缺字母或完整拼写。初始默认按学习顺序。
                  </p>
                </div>
              </div>
              {quizMessage && (
                <div className="notice-banner">{quizMessage}</div>
              )}
              <div className="panel learning-note">
                <h2>今日拼写计划</h2>
                <p>
                  按家长设置安排新词 {settings.newPerDay} 个、复习最多{' '}
                  {settings.reviewPerDay} 个，只记录拼写结果。
                </p>
                <Button variant="outline" onClick={buildDailyQuiz}>
                  开始今日拼写练习
                </Button>
              </div>
              <div className="test-section">
                <div className="section-number">1</div>
                <div className="section-copy">
                  <h2>测试范围</h2>
                  <p>“按学习顺序”与“选择章节”都不打乱词序。</p>
                </div>
                <div className="choice-grid three">
                  {(Object.keys(modeInfo) as QuizMode[]).map((mode) => (
                    <button
                      key={mode}
                      className={`choice-card ${quizMode === mode ? 'selected' : ''}`}
                      onClick={() => setQuizMode(mode)}
                    >
                      {mode === 'sequence' ? (
                        <ListChecks />
                      ) : mode === 'chapter' ? (
                        <BookMarked />
                      ) : (
                        <Shuffle />
                      )}
                      <strong>{modeInfo[mode].title}</strong>
                      <span>{modeInfo[mode].description}</span>
                      {quizMode === mode && (
                        <CheckCircle2 className="selected-check" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
              {quizMode === 'chapter' && (
                <div className="chapter-picker panel">
                  <div className="panel-heading">
                    <div>
                      <h2>选择测试章节</h2>
                      <p>可同时选择多个章节，测试时按章节原顺序进行。</p>
                    </div>
                    <Badge variant="secondary">
                      已选 {selectedChapters.length} 章
                    </Badge>
                  </div>
                  <div className="chapter-checks">
                    {orderedChapters.map((chapter) => (
                      <label
                        key={chapter.id}
                        className={
                          selectedChapters.includes(chapter.id) ? 'checked' : ''
                        }
                      >
                        <Checkbox
                          checked={selectedChapters.includes(chapter.id)}
                          onCheckedChange={(value) =>
                            setSelectedChapters((current) =>
                              value
                                ? [...new Set([...current, chapter.id])]
                                : current.filter((id) => id !== chapter.id),
                            )
                          }
                        />
                        <span>
                          <strong>{chapter.title}</strong>
                          <small>
                            {
                              words.filter(
                                (word) =>
                                  word.chapterId === chapter.id && word.active,
                              ).length
                            }{' '}
                            个启用词
                          </small>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div className="test-section">
                <div className="section-number">2</div>
                <div className="section-copy">
                  <h2>拼写方式</h2>
                  <p>初期建议缺字母；熟悉后切换到完整单词。</p>
                </div>
                <div className="choice-grid two">
                  {(Object.keys(typeInfo) as QuizType[]).map((type) => (
                    <button
                      key={type}
                      className={`choice-card ${quizType === type ? 'selected' : ''}`}
                      onClick={() => setQuizType(type)}
                    >
                      {type === 'missing' ? <Pencil /> : <Headphones />}
                      <strong>{typeInfo[type].title}</strong>
                      <span>{typeInfo[type].description}</span>
                      {quizType === type && (
                        <CheckCircle2 className="selected-check" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
              <div className="test-launch panel">
                <div>
                  <p className="eyebrow">准备好了</p>
                  <h2>
                    {modeInfo[quizMode].title} · {typeInfo[quizType].title}
                  </h2>
                  <p>
                    本轮 {launchCount} 题
                    {quizMode === 'chapter'
                      ? '，覆盖所选章节中的全部启用词。'
                      : '，可在家长控制中调整。'}
                  </p>
                </div>
                <Button className="primary-action" onClick={() => buildQuiz()}>
                  <Play /> 开始测试
                </Button>
              </div>
            </section>
          )}

          {tab === 'settings' && !parentOpen && (
            <section className="settings-overview">
              <h1>设置</h1>
              <button
                className="settings-entry"
                onClick={() => setParentOpen(true)}
              >
                <ShieldCheck />
                <span>
                  <strong>家长控制</strong>
                  <small>认词词库、拼写词库、语法题库、学习计划与备份</small>
                </span>
                <ChevronRight />
              </button>
            </section>
          )}
          {tab === 'settings' && parentOpen && (
            <section className="parent-view">
              <div className="parent-heading">
                <Button variant="ghost" onClick={() => setParentOpen(false)}>
                  <ArrowLeft /> 返回设置
                </Button>
                <h1>家长控制</h1>
              </div>
              <Tabs value={parentTab} onValueChange={setParentTab}>
                <TabsList className="parent-tabs">
                  <TabsTrigger value="plan">
                    <Settings2 /> 学习计划
                  </TabsTrigger>
                  <TabsTrigger value="recognition-library">
                    <BookOpen /> 认词词库
                  </TabsTrigger>
                  <TabsTrigger value="library">
                    <Library /> 拼写词库
                  </TabsTrigger>
                  <TabsTrigger value="grammar-library">
                    <ListChecks /> 语法题库
                  </TabsTrigger>
                  <TabsTrigger value="backup">
                    <FileJson /> 数据备份
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="plan">
                  <RecognitionPlan store={learning} />
                  <h2 className="spelling-plan-heading">
                    拼写测试设置（不影响认词）
                  </h2>
                  <div className="settings-grid">
                    <div className="settings-card">
                      <div className="setting-icon orange-bg">
                        <BookOpen />
                      </div>
                      <div className="setting-copy">
                        <h2>每日拼写新词</h2>
                        <p>每日拼写练习中引入的新词数量</p>
                      </div>
                      <strong className="setting-value">
                        {settings.newPerDay}
                        <small> 个</small>
                      </strong>
                      <Slider
                        min={0}
                        max={30}
                        step={1}
                        value={settings.newPerDay}
                        onValueChange={(value) =>
                          setSettings((current) => ({
                            ...current,
                            newPerDay: Number(value),
                          }))
                        }
                      />
                      <div className="range-label">
                        <span>0</span>
                        <span>30</span>
                      </div>
                    </div>
                    <div className="settings-card">
                      <div className="setting-icon blue-bg">
                        <RotateCcw />
                      </div>
                      <div className="setting-copy">
                        <h2>每日拼写复习</h2>
                        <p>每日拼写练习最多安排的复习词数量</p>
                      </div>
                      <strong className="setting-value">
                        {settings.reviewPerDay}
                        <small> 个</small>
                      </strong>
                      <Slider
                        min={0}
                        max={50}
                        step={1}
                        value={settings.reviewPerDay}
                        onValueChange={(value) =>
                          setSettings((current) => ({
                            ...current,
                            reviewPerDay: Number(value),
                          }))
                        }
                      />
                      <div className="range-label">
                        <span>0</span>
                        <span>50</span>
                      </div>
                    </div>
                    <div className="settings-card wide default-test-settings">
                      <div className="setting-icon violet-bg">
                        <Target />
                      </div>
                      <div className="setting-copy">
                        <h2>默认拼写测试</h2>
                        <p>孩子打开测试中心时优先使用这里的方式</p>
                      </div>
                      <div className="inline-fields">
                        <label>
                          范围
                          <Select
                            value={settings.defaultQuizMode}
                            onValueChange={(value) => {
                              if (!value) return;
                              const mode = value as QuizMode;
                              setSettings((current) => ({
                                ...current,
                                defaultQuizMode: mode,
                              }));
                              setQuizMode(mode);
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.keys(modeInfo) as QuizMode[]).map(
                                (mode) => (
                                  <SelectItem key={mode} value={mode}>
                                    {modeInfo[mode].title}
                                  </SelectItem>
                                ),
                              )}
                            </SelectContent>
                          </Select>
                        </label>
                        <label>
                          题型
                          <Select
                            value={settings.defaultQuizType}
                            onValueChange={(value) => {
                              if (!value) return;
                              const type = value as QuizType;
                              setSettings((current) => ({
                                ...current,
                                defaultQuizType: type,
                              }));
                              setQuizType(type);
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.keys(typeInfo) as QuizType[]).map(
                                (type) => (
                                  <SelectItem key={type} value={type}>
                                    {typeInfo[type].title}
                                  </SelectItem>
                                ),
                              )}
                            </SelectContent>
                          </Select>
                        </label>
                        <label>
                          每轮题数
                          <Select
                            value={String(settings.quizCount)}
                            onValueChange={(value) => {
                              if (!value) return;
                              setSettings((current) => ({
                                ...current,
                                quizCount: Number(value),
                              }));
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {[5, 10, 15, 20, 30, 50].map((count) => (
                                <SelectItem key={count} value={String(count)}>
                                  {count} 题
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </label>
                      </div>
                    </div>
                    <div className="settings-card wide toggle-card">
                      <div>
                        <h2>进入题目自动读音</h2>
                        <p>也可随时点击扬声器重复播放</p>
                      </div>
                      <Switch
                        checked={settings.autoSpeak}
                        onCheckedChange={(value) =>
                          setSettings((current) => ({
                            ...current,
                            autoSpeak: value,
                          }))
                        }
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="recognition-library">
                  <RecognitionLibrary
                    store={learning}
                    sourceWords={sortWords(words)}
                    sourceChapters={orderedChapters}
                  />
                </TabsContent>
                <TabsContent value="grammar-library">
                  <GrammarLibrary store={learning} />
                </TabsContent>
                <TabsContent value="library">
                  <div className="library-summary">
                    <div>
                      <p className="eyebrow">当前词库</p>
                      <h2>自然拼读背单词小手册 · v0.8</h2>
                      <p>
                        {chapters.length} 个章节 · {words.length} 条词条 ·{' '}
                        {activeWords.length} 条已启用
                      </p>
                    </div>
                    <div className="title-actions">
                      <Button
                        variant="outline"
                        onClick={() => setBulkOpen(true)}
                      >
                        <Upload /> 批量增加
                      </Button>
                      <Button
                        onClick={() => {
                          if (!activeParentChapter) return;
                          setIsNewWord(true);
                          setDraftWord({
                            ...makeBlankWord(activeParentChapter),
                            wordOrder:
                              Math.max(
                                0,
                                ...words
                                  .filter(
                                    (word) =>
                                      word.chapterId === activeParentChapter.id,
                                  )
                                  .map((word) => word.wordOrder),
                              ) + 1,
                          });
                        }}
                      >
                        <Plus /> 新增单词
                      </Button>
                    </div>
                  </div>
                  <section className="chapter-editor panel">
                    <div className="panel-heading">
                      <div>
                        <h2>章节标题与备注</h2>
                        <p>
                          这里可以改 short a
                          等章节标题、规则说明和给孩子的讲法。
                        </p>
                      </div>
                      <Button variant="outline" onClick={addChapter}>
                        <Plus /> 新建章节
                      </Button>
                    </div>
                    {activeParentChapter && (
                      <div className="chapter-editor-grid">
                        <label>
                          选择章节
                          <Select
                            value={activeParentChapter.id}
                            onValueChange={(value) =>
                              value && setParentChapterId(value)
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {orderedChapters.map((chapter) => (
                                <SelectItem key={chapter.id} value={chapter.id}>
                                  {chapter.title}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </label>
                        <label>
                          章节顺序
                          <Input
                            type="number"
                            min={1}
                            value={activeParentChapter.order}
                            onChange={(event) => {
                              const order = Math.max(
                                1,
                                Number(event.target.value) || 1,
                              );
                              setChapters((items) =>
                                items.map((chapter) =>
                                  chapter.id === activeParentChapter.id
                                    ? { ...chapter, order }
                                    : chapter,
                                ),
                              );
                              setWords((items) =>
                                items.map((word) =>
                                  word.chapterId === activeParentChapter.id
                                    ? { ...word, chapterOrder: order }
                                    : word,
                                ),
                              );
                            }}
                          />
                        </label>
                        <label className="full">
                          章节标题
                          <Input
                            value={activeParentChapter.title}
                            onChange={(event) =>
                              setChapters((items) =>
                                items.map((chapter) =>
                                  chapter.id === activeParentChapter.id
                                    ? { ...chapter, title: event.target.value }
                                    : chapter,
                                ),
                              )
                            }
                          />
                        </label>
                        <label className="full">
                          规则说明
                          <Textarea
                            value={activeParentChapter.rule}
                            onChange={(event) =>
                              setChapters((items) =>
                                items.map((chapter) =>
                                  chapter.id === activeParentChapter.id
                                    ? { ...chapter, rule: event.target.value }
                                    : chapter,
                                ),
                              )
                            }
                          />
                        </label>
                        <label className="full">
                          给孩子的讲法
                          <Textarea
                            value={activeParentChapter.childNote}
                            onChange={(event) =>
                              setChapters((items) =>
                                items.map((chapter) =>
                                  chapter.id === activeParentChapter.id
                                    ? {
                                        ...chapter,
                                        childNote: event.target.value,
                                      }
                                    : chapter,
                                ),
                              )
                            }
                          />
                        </label>
                      </div>
                    )}
                  </section>
                  <div className="library-toolbar">
                    <div className="search-box">
                      <Search />
                      <Input
                        placeholder="搜索英文、中文、音标或拆分"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                      />
                    </div>
                    <Select
                      value={chapterFilter}
                      onValueChange={(value) =>
                        value && setChapterFilter(value)
                      }
                    >
                      <SelectTrigger className="chapter-filter">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部章节</SelectItem>
                        {orderedChapters.map((chapter) => (
                          <SelectItem key={chapter.id} value={chapter.id}>
                            {chapter.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Badge variant="secondary">
                      找到 {filteredWords.length} 条
                    </Badge>
                  </div>
                  <div className="word-table">
                    <div className="word-row word-head">
                      <span>单词 / 音标</span>
                      <span>中文 / 例句</span>
                      <span>拆分</span>
                      <span>章节</span>
                      <span>测试</span>
                      <span>操作</span>
                    </div>
                    {visibleWords.map((word) => {
                      const chapter = chapters.find(
                        (item) => item.id === word.chapterId,
                      );
                      return (
                        <div className="word-row" key={word.id}>
                          <span className="word-cell">
                            <strong>{word.word}</strong>
                            <small>{word.ipa || '暂无音标'}</small>
                          </span>
                          <span className="meaning-cell">
                            <strong>{word.meaning}</strong>
                            <small>{word.example || '暂无例句'}</small>
                          </span>
                          <span className="phonics-cell">
                            {word.phonics || '—'}
                            <small>{word.level}</small>
                          </span>
                          <span className="chapter-cell" title={chapter?.title}>
                            {chapter?.title ?? '未分组'}
                          </span>
                          <Switch
                            checked={word.active}
                            onCheckedChange={(value) =>
                              setWords((items) =>
                                items.map((item) =>
                                  item.id === word.id
                                    ? { ...item, active: value }
                                    : item,
                                ),
                              )
                            }
                            aria-label={`在测试中${word.active ? '停用' : '启用'} ${word.word}`}
                          />
                          <span className="row-actions">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setIsNewWord(false);
                                setDraftWord({ ...word });
                              }}
                              aria-label={`编辑 ${word.word}`}
                            >
                              <Pencil />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger
                                render={
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label={`删除 ${word.word}`}
                                  />
                                }
                              >
                                <Trash2 />
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    删除 “{word.word}”？
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    这个词条会从词库和后续测试中移除。
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>取消</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() =>
                                      setWords((items) =>
                                        items.filter(
                                          (item) => item.id !== word.id,
                                        ),
                                      )
                                    }
                                  >
                                    确认删除
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </span>
                        </div>
                      );
                    })}
                    {!visibleWords.length && (
                      <div className="empty-row">没有符合条件的词条。</div>
                    )}
                  </div>
                  <div className="pagination-row">
                    <Button
                      variant="outline"
                      disabled={wordPage <= 1}
                      onClick={() => setWordPage((page) => page - 1)}
                    >
                      <ChevronLeft /> 上一页
                    </Button>
                    <span>
                      第 {wordPage} / {totalPages} 页
                    </span>
                    <Button
                      variant="outline"
                      disabled={wordPage >= totalPages}
                      onClick={() => setWordPage((page) => page + 1)}
                    >
                      下一页 <ChevronRight />
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="backup">
                  <LearningStatus store={learning} />
                  {quizMessage && (
                    <output className="notice-banner">{quizMessage}</output>
                  )}
                  <p className="backup-storage-note">
                    新增的认词词库、语法题库、配图和进度按登录账户保存。原有拼写词库及成绩仍保存在当前浏览器。备份包含两部分数据和图片引用；图片文件保留在本工作台账户中。
                  </p>
                  <div className="backup-grid">
                    <section className="backup-card">
                      <div className="backup-icon blue-bg">
                        <Download />
                      </div>
                      <h2>导出完整备份</h2>
                      <p>
                        保存章节标题、全部词条、中文词义、学习进度和家长设置。换设备前建议先导出。
                      </p>
                      <Button
                        disabled={!learning.ready || learning.busy}
                        onClick={exportBackup}
                      >
                        <Download /> 下载 JSON 备份
                      </Button>
                    </section>
                    <section className="backup-card">
                      <div className="backup-icon violet-bg">
                        <Upload />
                      </div>
                      <h2>恢复已有备份</h2>
                      <p>选择本工作台导出的 JSON 文件，恢复词库和设置。</p>
                      <input
                        ref={importRef}
                        type="file"
                        accept="application/json"
                        hidden
                        onChange={importBackup}
                      />
                      <Button
                        variant="outline"
                        onClick={() => importRef.current?.click()}
                      >
                        <Upload /> 选择备份文件
                      </Button>
                    </section>
                    <section className="backup-card danger-card">
                      <div className="backup-icon orange-bg">
                        <RotateCcw />
                      </div>
                      <h2>恢复 v0.8 原始词库</h2>
                      <p>
                        只重置拼写词库和拼写进度，回到原始的 33 章、1,785
                        条词。不会影响认词和语法。
                      </p>
                      <AlertDialog>
                        <AlertDialogTrigger
                          render={<Button variant="outline" />}
                        >
                          <RotateCcw /> 恢复原始词库
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              确定恢复 v0.8 原始词库？
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              当前词库修改会被覆盖。建议先导出备份。
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction onClick={resetToV08}>
                              确认恢复
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </section>
                  </div>
                </TabsContent>
              </Tabs>
            </section>
          )}
        </main>
      </div>

      <Dialog
        open={Boolean(draftWord)}
        onOpenChange={(open) => !open && setDraftWord(null)}
      >
        <DialogContent className="word-dialog">
          <DialogHeader>
            <DialogTitle>
              {isNewWord ? '新增单词' : `编辑 ${draftWord?.word}`}
            </DialogTitle>
            <DialogDescription>
              英文和中文词义为必填；音标、拆分与例句会在答题后展示。
            </DialogDescription>
          </DialogHeader>
          {draftWord && (
            <div className="word-form">
              <label>
                英文单词
                <Input
                  value={draftWord.word}
                  onChange={(event) =>
                    setDraftWord({ ...draftWord, word: event.target.value })
                  }
                />
              </label>
              <label>
                中文词义
                <Input
                  value={draftWord.meaning}
                  onChange={(event) =>
                    setDraftWord({ ...draftWord, meaning: event.target.value })
                  }
                />
              </label>
              <label>
                音标
                <Input
                  value={draftWord.ipa}
                  onChange={(event) =>
                    setDraftWord({ ...draftWord, ipa: event.target.value })
                  }
                  placeholder="例如 /kæt/"
                />
              </label>
              <label>
                单词拆分
                <Input
                  value={draftWord.phonics}
                  onChange={(event) =>
                    setDraftWord({ ...draftWord, phonics: event.target.value })
                  }
                  placeholder="例如 c + a + t"
                />
              </label>
              <label className="full">
                所属章节
                <Select
                  value={draftWord.chapterId}
                  onValueChange={(value) =>
                    value && setDraftWord({ ...draftWord, chapterId: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {orderedChapters.map((chapter) => (
                      <SelectItem key={chapter.id} value={chapter.id}>
                        {chapter.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="full">
                简短例句
                <Input
                  value={draftWord.example}
                  onChange={(event) =>
                    setDraftWord({ ...draftWord, example: event.target.value })
                  }
                />
              </label>
              <label>
                分层
                <Input
                  value={draftWord.level}
                  onChange={(event) =>
                    setDraftWord({ ...draftWord, level: event.target.value })
                  }
                />
              </label>
              <label>
                章节内顺序
                <Input
                  type="number"
                  min={1}
                  value={draftWord.wordOrder}
                  onChange={(event) =>
                    setDraftWord({
                      ...draftWord,
                      wordOrder: Math.max(1, Number(event.target.value) || 1),
                    })
                  }
                />
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraftWord(null)}>
              取消
            </Button>
            <Button
              onClick={saveDraftWord}
              disabled={!draftWord?.word.trim() || !draftWord?.meaning.trim()}
            >
              保存词条
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="bulk-dialog">
          <DialogHeader>
            <DialogTitle>批量增加到“{activeParentChapter?.title}”</DialogTitle>
            <DialogDescription>
              每行一个词，依次填写：英文，中文，音标，拆分，例句，分层。可用逗号或制表符分隔。
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={bulkText}
            onChange={(event) => setBulkText(event.target.value)}
            placeholder={
              'cat，猫，/kæt/，c + a + t，I see a cat.，简单\ndog，狗，/dɒɡ/，d + o + g，I see a dog.，简单'
            }
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>
              取消
            </Button>
            <Button onClick={importBulkWords} disabled={!bulkText.trim()}>
              确认加入
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}

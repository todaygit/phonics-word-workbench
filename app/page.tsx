'use client';
import './github-runtime';
/* oxlint-disable react/react-compiler, jsx-a11y/label-has-associated-control */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  AlertTriangle,
  BookMarked,
  BookOpen,
  Check,
  CheckCircle2,
  Cloud,
  ChevronLeft,
  ChevronRight,
  Download,
  FileJson,
  Flame,
  Headphones,
  Library,
  ListChecks,
  LockKeyhole,
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
  Sprout,
  BarChart3,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import rawBank from './word-bank-v19.json';
import { localAward } from './github-activity';
import { useLearning } from './use-learning';
import { WordAudio } from './word-audio';
import { RewardsView, StatisticsView } from './activity-views';
import { InstallAppPanel } from './pwa-install';
import {
  CloudSyncPanel,
  CloudSyncProvider,
  recoverLocalSafetyBackup,
  saveLocalSafetyBackup,
} from './cloud-sync';
import type { Award } from './activity-model';
import { validParentPin } from './parent-lock';
import {
  learningStats,
  validateLearning,
  type LearningData,
} from './learning-model';
import {
  EMPTY_SPELLING_PLAN,
  buildSpellingQueue,
  normaliseSpellingStats,
  statForDay,
  updateSpellingStats,
  type SpellingPlan,
  type SpellingStats,
} from './spelling-model';
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
type MissingMode = 'random' | 'phonics' | 'first';

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
  partOfSpeech?: string;
  audioUrl?: string;
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
  id: string;
  queue: Word[];
  mode: QuizMode;
  type: QuizType;
  startCursor: number;
  cursorAdvance: number;
  missingCount: number;
  missingMode: MissingMode;
};
type QuizResult = {
  wordId: string;
  word: string;
  answer: string;
  correct: boolean;
};

const BANK_VERSION = 'v1.9';
// 应用版本与词库版本分开，升级界面不会重置用户数据。
const APP_VERSION = 'v1.9.4';
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

const DAILY_ENCOURAGEMENTS = [
  '今天也向前一步，你的努力正在发芽！',
  '每拼对一个单词，都是给自己点亮一颗小星星。',
  '慢慢来，认真读、认真想，你一定可以！',
  '今天的你比昨天更棒，继续加油！',
  '把声音读出来，单词就会记得更牢。',
  '小小坚持，大大进步，开始挑战吧！',
  '你已经学会很多了，再试一个看看！',
  '认真完成今天的练习，给自己的树浇浇水。',
  '每一次尝试都值得表扬，你真勇敢！',
  '专注一会儿，收获一整天的成就感。',
  '把不会的变成会的，就是最厉害的魔法。',
  '你的进步看得见，今天也要闪闪发光！',
  '读准音、写对词，你就是小小拼写家。',
  '再坚持一下，新的小树和奖励在等你。',
];

function dailyEncouragement() {
  const key = localDateKey();
  const hash = key.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return DAILY_ENCOURAGEMENTS[hash % DAILY_ENCOURAGEMENTS.length];
}

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

const DEFAULT_SETTINGS: Settings = {
  newPerDay: 6,
  reviewPerDay: 12,
  defaultQuizMode: 'random',
  defaultQuizType: 'missing',
  quizCount: 20,
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
    description: '在家长选定范围内按章节和词序测试。',
  },
  chapter: {
    title: '选择章节',
    description: '勾选章节，可指定单词或设置每章随机数量。',
  },
  random: {
    title: '随机挑战',
    description: '只在已测章节中随机抽题，错题优先。',
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

function loadStored<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : fallback;
  } catch {
    return fallback;
  }
}

function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function createMissingPrompt(
  word: string,
  count = 1,
  mode: MissingMode = 'random',
  phonics = '',
  chapterTitle = '',
) {
  const letters = word.split('');
  const letterIndexes = letters
    .map((letter, index) => (/[a-z]/i.test(letter) ? index : -1))
    .filter((index) => index >= 0);
  const blankCount = Math.min(
    Math.max(1, Math.floor(Number(count) || 1)),
    letterIndexes.length,
  );
  const chosen = new Set<number>();
  if (mode === 'first') {
    letterIndexes.slice(0, blankCount).forEach((index) => chosen.add(index));
  } else if (mode === 'phonics') {
    const chunks = phonics.match(/[a-z]+/gi)?.filter(Boolean) ?? [];
    const chapterKey = chapterTitle
      .split('：')[0]
      .replace(/^\s*\d+(?:\.\d+)?\s*/, '')
      .replace(/short\s+/i, '')
      .match(/[a-z]{1,5}/i)?.[0];
    const chunk =
      chunks.find(
        (item) => chapterKey && item.toLowerCase() === chapterKey.toLowerCase(),
      ) ??
      chunks.find((item) => word.toLowerCase().includes(item.toLowerCase()));
    const start = chunk ? word.toLowerCase().indexOf(chunk.toLowerCase()) : -1;
    if (start >= 0) {
      letterIndexes
        .filter(
          (index) => index >= start && index < start + (chunk?.length ?? 1),
        )
        .slice(0, blankCount)
        .forEach((index) => chosen.add(index));
    }
  }
  if (mode === 'random' || chosen.size < blankCount) {
    shuffle(letterIndexes)
      .slice(0, blankCount)
      .forEach((index) => chosen.add(index));
  }
  return {
    mask: letters
      .map((letter, index) => (chosen.has(index) ? '_' : letter))
      .join(''),
    answer: letters.filter((_, index) => chosen.has(index)).join(''),
  };
}

function maskExampleSentence(example: string, word: string) {
  if (!example.trim()) return '暂无例句';
  if (!word.trim()) return example;
  const escaped = word.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return example.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), '____');
}

function partOfSpeechLabel(value?: string) {
  const raw = value?.trim() || '';
  if (!raw) return '未填写';
  const labels: Record<string, string> = {
    n: '名词',
    'n.': '名词',
    v: '动词',
    'v.': '动词',
    adj: '形容词',
    'adj.': '形容词',
    adv: '副词',
    'adv.': '副词',
    pron: '代词',
    'pron.': '代词',
    prep: '介词',
    'prep.': '介词',
    conj: '连词',
    'conj.': '连词',
    aux: '助动词',
    'aux.': '助动词',
    modal: '情态动词',
    func: '功能词',
    'func.': '功能词',
    num: '数词',
    'num.': '数词',
  };
  const lower = raw.toLowerCase();
  const translated = labels[lower];
  return translated ? `${translated}（${raw}）` : raw;
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

function Workbench() {
  const learning = useLearning();
  const recognitionStats = learningStats(learning.data);
  const [chapters, setChapters] = useState<Chapter[]>(DEFAULT_CHAPTERS);
  const [words, setWords] = useState<Word[]>(DEFAULT_WORDS);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [tab, setTab] = useState('today');
  const [parentOpen, setParentOpen] = useState(false);
  const [settingsUnlocked, setSettingsUnlocked] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [requestedParentTab, setRequestedParentTab] = useState<string | null>(
    null,
  );
  const [parentTab, setParentTab] = useState('plan');
  const [hydrated, setHydrated] = useState(false);
  const [sequenceCursor, setSequenceCursor] = useState(0);
  const [completedToday, setCompletedToday] = useState(0);
  const [quizMode, setQuizMode] = useState<QuizMode>('sequence');
  const [quizType, setQuizType] = useState<QuizType>('missing');
  const [missingCount, setMissingCount] = useState(1);
  const [missingMode, setMissingMode] = useState<MissingMode>('random');
  const [quizSelection, setQuizSelection] = useState<'checked' | 'random'>(
    'random',
  );
  const [wrongFirst, setWrongFirst] = useState(true);
  const [testPlan, setTestPlan] = useState<SpellingPlan>(EMPTY_SPELLING_PLAN);
  const [spellingStats, setSpellingStats] = useState<SpellingStats>({});
  const [testSetupUnlocked, setTestSetupUnlocked] = useState(false);
  const [pinPurpose, setPinPurpose] = useState<'settings' | 'test'>('settings');
  const [wordPickerQuery, setWordPickerQuery] = useState('');
  const [directChallengeOpen, setDirectChallengeOpen] = useState(false);
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
  const [scoreBusy, setScoreBusy] = useState(false);
  const [scoreAward, setScoreAward] = useState<Award | null>(null);
  const scoreLocked = useRef(false);
  const pendingScore = useRef<{
    eventId: string;
    word: string;
    answer: string;
    expected: string;
  } | null>(null);
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

  const requestSettings = useCallback(
    (target?: string) => {
      if (settingsUnlocked) {
        setTab('settings');
        setParentOpen(Boolean(target));
        if (target) setParentTab(target);
        return;
      }
      setPinPurpose('settings');
      setRequestedParentTab(target ?? null);
      setPin('');
      setPinError('');
      setPinOpen(true);
    },
    [settingsUnlocked],
  );

  function unlockSettings() {
    if (!validParentPin(pin)) {
      setPinError('密码不正确，请重新输入。');
      setPin('');
      return;
    }
    if (pinPurpose === 'test') {
      setTestSetupUnlocked(true);
      setPinOpen(false);
      setPin('');
      setPinError('');
      return;
    }
    setSettingsUnlocked(true);
    setTab('settings');
    setParentOpen(Boolean(requestedParentTab));
    if (requestedParentTab) setParentTab(requestedParentTab);
    setPinOpen(false);
    setPin('');
    setPinError('');
  }

  function leaveSettings(nextTab: string) {
    if (nextTab !== 'settings') {
      setSettingsUnlocked(false);
      setParentOpen(false);
    }
    if (nextTab !== 'test') setTestSetupUnlocked(false);
    setTab(nextTab);
  }

  function requestTestSetup() {
    if (testSetupUnlocked) return;
    setPinPurpose('test');
    setPin('');
    setPinError('');
    setPinOpen(true);
  }

  useEffect(() => {
    void fetch('/api/activity/check-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
  }, []);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (scoreLocked.current) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  useEffect(() => {
    recoverLocalSafetyBackup();
    // Preserve the current device state before any bank/schema migration runs.
    // This is intentionally kept outside the cloud snapshot namespace.
    saveLocalSafetyBackup('应用更新前');
    const storedVersion = window.localStorage.getItem('phonics.bankVersion');
    const storedWords = loadStored<Word[]>('phonics.words', []);
    if (storedVersion === BANK_VERSION && storedWords.length) {
      setWords(storedWords);
      setChapters(loadStored<Chapter[]>('phonics.chapters', DEFAULT_CHAPTERS));
    } else {
      const customWords = storedWords.filter(
        (word) => !OLD_DEMO_IDS.has(word.id) && !word.id.startsWith('v08-'),
      );
      setWords([...DEFAULT_WORDS, ...customWords]);
      setChapters(DEFAULT_CHAPTERS);
      window.localStorage.setItem('phonics.bankVersion', BANK_VERSION);
    }
    const mergedSettings = {
      ...DEFAULT_SETTINGS,
      ...loadStored<Partial<Settings>>('phonics.settings', {}),
    };
    const safeQuizType: QuizType =
      mergedSettings.defaultQuizType === 'full' ? 'full' : 'missing';
    setSettings({ ...mergedSettings, defaultQuizType: safeQuizType });
    setQuizMode(mergedSettings.defaultQuizMode);
    setQuizType(safeQuizType);
    const storedPlan = loadStored<Partial<SpellingPlan>>(
      'phonics.testPlan',
      {},
    );
    const safePlanType: QuizType =
      storedPlan.type === 'full' ? 'full' : 'missing';
    const initialPlanChapters =
      Array.isArray(storedPlan.selectedChapters) &&
      storedPlan.selectedChapters.length
        ? storedPlan.selectedChapters
        : [DEFAULT_CHAPTERS[0]?.id ?? ''];
    setTestPlan({
      ...EMPTY_SPELLING_PLAN,
      ...storedPlan,
      type: safePlanType,
      selectedChapters: initialPlanChapters,
      selectedWordIds: Array.isArray(storedPlan.selectedWordIds)
        ? storedPlan.selectedWordIds
        : [],
      perChapter:
        storedPlan.perChapter && typeof storedPlan.perChapter === 'object'
          ? storedPlan.perChapter
          : {},
    });
    setSelectedChapters(initialPlanChapters);
    setQuizSelection(storedPlan.selection ?? EMPTY_SPELLING_PLAN.selection);
    setWrongFirst(storedPlan.wrongFirst ?? true);
    setMissingCount(
      Math.max(1, Math.floor(Number(storedPlan.missingCount) || 1)),
    );
    setMissingMode(
      storedPlan.missingMode === 'phonics' || storedPlan.missingMode === 'first'
        ? storedPlan.missingMode
        : 'random',
    );
    const storedStats = normaliseSpellingStats(
      loadStored('phonics.spelling.stats', {}),
    );
    setSpellingStats(
      storedVersion === BANK_VERSION
        ? storedStats
        : Object.fromEntries(
            Object.entries(storedStats).filter(
              ([wordId]) => !wordId.startsWith('v08-'),
            ),
          ),
    );
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
    window.localStorage.setItem(
      'phonics.testPlan',
      JSON.stringify({
        ...testPlan,
        mode: quizMode,
        type: quizType,
        selection: quizSelection,
        wrongFirst,
      }),
    );
    window.localStorage.setItem(
      'phonics.spelling.stats',
      JSON.stringify(spellingStats),
    );
  }, [
    chapters,
    completedToday,
    hydrated,
    quizMode,
    quizSelection,
    quizType,
    sequenceCursor,
    settings,
    spellingStats,
    testPlan,
    words,
    wrongFirst,
  ]);

  const activeWords = useMemo(
    () => sortWords(words.filter((word) => word.active)),
    [words],
  );
  const todayKey = localDateKey();
  const testedChapterIds = useMemo(
    () => [
      ...new Set(
        activeWords
          .filter((word) => (spellingStats[word.id]?.attempts ?? 0) > 0)
          .map((word) => word.chapterId),
      ),
    ],
    [activeWords, spellingStats],
  );
  const learnedWords = useMemo(
    () =>
      activeWords.filter(
        (word) =>
          word.reviews > 0 || (spellingStats[word.id]?.attempts ?? 0) > 0,
      ),
    [activeWords, spellingStats],
  );
  const learnedChapterIds = useMemo(
    () => [...new Set(learnedWords.map((word) => word.chapterId))],
    [learnedWords],
  );
  const yesterdayKey = addDays(-1);
  function chapterProgress(chapterId: string) {
    const chapterWords = activeWords.filter(
      (word) => word.chapterId === chapterId,
    );
    const tested = chapterWords.filter(
      (word) => (spellingStats[word.id]?.attempts ?? 0) > 0,
    ).length;
    const yesterday = chapterWords.filter(
      (word) => statForDay(spellingStats[word.id], yesterdayKey).attempts > 0,
    ).length;
    return {
      total: chapterWords.length,
      tested,
      percent: chapterWords.length
        ? Math.round((tested / chapterWords.length) * 100)
        : 0,
      yesterday,
    };
  }
  const effectiveTestChapters =
    testPlan.configuredDate === todayKey && testPlan.selectedChapters.length
      ? testPlan.selectedChapters
      : testedChapterIds.length
        ? testedChapterIds
        : selectedChapters;
  const mistakeWords = useMemo(
    () =>
      activeWords.filter((word) => (spellingStats[word.id]?.wrong ?? 0) > 0),
    [activeWords, spellingStats],
  );
  const todayMistakeWords = useMemo(
    () =>
      activeWords.filter(
        (word) => statForDay(spellingStats[word.id], todayKey).wrong > 0,
      ),
    [activeWords, spellingStats, todayKey],
  );
  const rangeProgress = effectiveTestChapters.reduce(
    (summary, chapterId) => {
      const progress = chapterProgress(chapterId);
      return {
        total: summary.total + progress.total,
        tested: summary.tested + progress.tested,
        yesterday: summary.yesterday + progress.yesterday,
      };
    },
    { total: 0, tested: 0, yesterday: 0 },
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
    ? createMissingPrompt(
        currentQuizWord.word,
        session?.missingCount ?? missingCount,
        session?.missingMode ?? missingMode,
        currentQuizWord.phonics,
        chapters.find((item) => item.id === currentQuizWord.chapterId)?.title,
      )
    : null;
  const expectedAnswer = currentQuizWord
    ? session?.type === 'missing'
      ? (missingPrompt?.answer ?? '')
      : currentQuizWord.word
    : '';
  const latestResult = results[results.length - 1];
  const launchCount =
    quizMode === 'chapter' && quizSelection === 'checked'
      ? testPlan.selectedWordIds.length
      : Math.min(
          quizMode === 'chapter' && quizSelection === 'random'
            ? Object.values(testPlan.perChapter).reduce(
                (sum, count) => sum + Math.max(0, Number(count) || 0),
                0,
              ) || settings.quizCount
            : testPlan.configuredDate === todayKey
              ? settings.quizCount
              : 20,
          activeWords.length,
        );
  const todayPlanReady =
    testPlan.configuredDate === todayKey &&
    (testPlan.selectedChapters.length > 0 || testPlan.selectedWordIds.length > 0);

  useEffect(() => {
    setWordPage(1);
  }, [chapterFilter, query]);
  useEffect(() => {
    if (wordPage > totalPages) setWordPage(totalPages);
  }, [totalPages, wordPage]);
  useEffect(() => {
    if (!currentQuizWord || checked || quizFinished) return;
    setTimeout(() => answerRef.current?.focus(), 80);
  }, [checked, currentQuizWord, quizFinished]);

  function updateQuizPlan(patch: Partial<SpellingPlan>) {
    setTestPlan((current) => ({ ...current, ...patch }));
  }

  function selectQuizChapters(ids: string[]) {
    setSelectedChapters(ids);
    updateQuizPlan({ selectedChapters: ids, configuredDate: todayKey });
  }

  function toggleSelectedWord(wordId: string, checkedWord: boolean) {
    setTestPlan((current) => ({
      ...current,
      configuredDate: todayKey,
      selectedWordIds: checkedWord
        ? [...new Set([...current.selectedWordIds, wordId])]
        : current.selectedWordIds.filter((id) => id !== wordId),
    }));
  }

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
      description: '查看 v1.9 词库、当前学习位置和今日完成量，不修改数据。',
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
          defaultQuizType: {
            type: 'string',
            enum: ['missing', 'full'],
          },
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
        requestSettings('plan');
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
        requestSettings('library');
        return { added: addition.word, chapter: chapter.title };
      },
    });
    return () => lifecycle.abort();
  }, [
    activeWords.length,
    chapters,
    completedToday,
    currentChapter?.title,
    requestSettings,
    words.length,
  ]);

  function buildQuiz(mode = quizMode, type = quizType, allowSavedPlan = false) {
    // 已保存的今日计划可直接开始，只有尚未配置时才要求家长密码。
    if (!testSetupUnlocked && !todayPlanReady && !allowSavedPlan) {
      requestTestSetup();
      return;
    }
    if (!activeWords.length) {
      setQuizMessage('当前没有启用的单词，请到家长控制里启用或添加单词。');
      return;
    }
    const configuredToday = testPlan.configuredDate === todayKey;
    const effectiveMode = configuredToday ? mode : 'random';
    const effectiveType = configuredToday ? type : settings.defaultQuizType;
    const effectiveSelection = configuredToday ? quizSelection : 'random';
    const effectiveWrongFirst = configuredToday ? wrongFirst : true;
    const selectedChaptersForPlan =
      configuredToday && testPlan.selectedChapters.length
        ? testPlan.selectedChapters
        : effectiveTestChapters;
    const chapterTotal = Object.values(testPlan.perChapter).reduce(
      (sum, count) => sum + Math.max(0, Number(count) || 0),
      0,
    );
    const defaultCount =
      testPlan.configuredDate === todayKey ? settings.quizCount : 20;
    const plan: SpellingPlan = {
      ...testPlan,
      mode: effectiveMode,
      type: effectiveType,
      selection: effectiveSelection,
      count:
        effectiveMode === 'chapter' &&
        effectiveSelection === 'random' &&
        chapterTotal
          ? chapterTotal
          : defaultCount,
      selectedChapters: selectedChaptersForPlan,
      wrongFirst: effectiveWrongFirst,
      missingCount,
      missingMode,
      configuredDate: todayKey,
    };
    const queue = buildSpellingQueue(
      activeWords,
      plan,
      spellingStats,
      effectiveMode === 'random'
        ? testedChapterIds.length
          ? testedChapterIds
          : selectedChaptersForPlan
        : selectedChaptersForPlan,
      shuffle,
    );
    const startCursor = activeWords.length
      ? sequenceCursor % activeWords.length
      : 0;
    const cursorAdvance = effectiveMode === 'sequence' ? queue.length : 0;
    if (!queue.length) {
      setQuizMessage(
        effectiveSelection === 'checked'
          ? '请至少勾选一个启用的单词。'
          : '请至少选择一个有启用单词的章节，或先完成一些测试。',
      );
      return;
    }
    setTestPlan(plan);
    setSelectedChapters(selectedChaptersForPlan);
    setQuizMessage('');
    pendingScore.current = null;
    setScoreAward(null);
    setSession({
      id: crypto.randomUUID(),
      queue,
      mode: effectiveMode,
      type: effectiveType,
      startCursor,
      cursorAdvance,
      missingCount,
      missingMode,
    });
    setQuizIndex(0);
    setQuizInput('');
    setChecked(false);
    setQuizFinished(false);
    setResults([]);
  }

  function buildDirectChallenge(count: number) {
    if (!learnedWords.length) {
      setQuizMessage('还没有学过的单词，先完成一些单词背诵后再来挑战。');
      return;
    }
    const plan: SpellingPlan = {
      ...EMPTY_SPELLING_PLAN,
      mode: 'random',
      type: 'missing',
      selection: 'random',
      count,
      selectedChapters: learnedChapterIds,
      wrongFirst: true,
      missingCount,
      missingMode,
      configuredDate: todayKey,
    };
    const queue = buildSpellingQueue(
      learnedWords,
      plan,
      spellingStats,
      learnedChapterIds,
      shuffle,
    );
    if (!queue.length) {
      setQuizMessage('暂时没有可挑战的已学单词。');
      return;
    }
    setDirectChallengeOpen(false);
    setQuizMessage('');
    pendingScore.current = null;
    setScoreAward(null);
    setSession({
      id: crypto.randomUUID(),
      queue,
      mode: 'random',
      type: 'missing',
      startCursor: 0,
      cursorAdvance: 0,
      missingCount,
      missingMode,
    });
    setQuizIndex(0);
    setQuizInput('');
    setChecked(false);
    setQuizFinished(false);
    setResults([]);
  }

  async function checkAnswer(markForgotten = false) {
    if (
      !session ||
      !currentQuizWord ||
      (!quizInput.trim() && !markForgotten && !pendingScore.current) ||
      checked ||
      scoreLocked.current
    )
      return;
    scoreLocked.current = true;
    setScoreBusy(true);
    setQuizMessage('');
    const submitted = pendingScore.current ?? {
      eventId: `spell:${session.id}:${quizIndex}`,
      word: currentQuizWord.word,
      answer: markForgotten ? '' : quizInput,
      expected: expectedAnswer,
    };
    pendingScore.current = submitted;
    let award: Award;
    try {
      const response = await fetch('/api/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitted),
      });
      const body = (await response.json()) as Award & { error?: string };
      if (!response.ok) throw new Error(body.error || '保存失败，请重试。');
      award = body as Award;
    } catch (error) {
      if (typeof window !== 'undefined' && (error instanceof TypeError || /fetch|网络|404|未找到/i.test(String(error)))) {
        award = localAward(submitted.eventId, submitted.word, submitted.answer, submitted.expected);
      } else {
        setQuizMessage(`${error instanceof Error ? error.message : '保存失败。'} 原答案已保留，请点击重试；不会重复计分。`);
        return;
      }
    } finally {
      scoreLocked.current = false;
      setScoreBusy(false);
    }
    const isCorrect = award.correct;
    setScoreAward(award);
    setResults((current) => [
      ...current,
      {
        wordId: currentQuizWord.id,
        word: currentQuizWord.word,
        answer: submitted.answer,
        correct: isCorrect,
      },
    ]);
    setSpellingStats((current) =>
      updateSpellingStats(current, currentQuizWord.id, todayKey, isCorrect),
    );
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
    pendingScore.current = null;
    setScoreAward(null);
    setQuizMessage('');
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
    if (scoreLocked.current) return;
    pendingScore.current = null;
    setScoreAward(null);
    setQuizMessage('');
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

  function resetToV19() {
    setChapters(DEFAULT_CHAPTERS);
    setWords(DEFAULT_WORDS);
    setSequenceCursor(0);
    setCompletedToday(0);
    setSettings(DEFAULT_SETTINGS);
    setQuizMode(DEFAULT_SETTINGS.defaultQuizMode);
    setQuizType(DEFAULT_SETTINGS.defaultQuizType);
    setQuizSelection('random');
    setWrongFirst(true);
    setSelectedChapters([DEFAULT_CHAPTERS[0]?.id ?? '']);
    setTestPlan({
      ...EMPTY_SPELLING_PLAN,
      selectedChapters: [DEFAULT_CHAPTERS[0]?.id ?? ''],
    });
    setSpellingStats({});
  }

  async function clearSpellingRecords(scope: 'today' | 'all') {
    try {
      const response = await fetch('/api/activity', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, pin: '1111' }),
      });
      const body = (await response.json()) as {
        deleted?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(body.error || '清理失败，请重试。');
      if (scope === 'all') {
        setSpellingStats({});
      } else {
        setSpellingStats((current) => {
          const next: SpellingStats = {};
          for (const [wordId, stat] of Object.entries(current)) {
            const day = stat.days[todayKey];
            if (!day) {
              next[wordId] = stat;
              continue;
            }
            const attempts = Math.max(0, stat.attempts - day.attempts);
            const correct = Math.max(0, stat.correct - day.correct);
            if (attempts > 0) {
              const days = { ...stat.days };
              delete days[todayKey];
              next[wordId] = {
                ...stat,
                attempts,
                correct,
                wrong: attempts - correct,
                days,
              };
            }
          }
          return next;
        });
      }
      setCompletedToday(0);
      setQuizMessage(
        `已清理${scope === 'all' ? '全部' : '今日'}拼写测试记录（${body.deleted ?? 0} 条）。`,
      );
    } catch (reason) {
      setQuizMessage(
        reason instanceof Error ? reason.message : '清理失败，请重试。',
      );
    }
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
          <Button variant="ghost" onClick={closeSession} disabled={scoreBusy}>
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
          <div className="quiz-word-details">
            <p className="meaning-prompt">
              <b>中文</b> {currentQuizWord.meaning || '暂无释义'}
              <WordAudio
                key={currentQuizWord.id}
                word={currentQuizWord.word}
                ipa={currentQuizWord.ipa}
                preferredUrl={currentQuizWord.audioUrl}
                autoPlay={settings.autoSpeak && !checked}
                hideDetails
              />
            </p>
            <p className="ipa-prompt">
              <b>音标</b> {currentQuizWord.ipa || '暂无音标'}
            </p>
            <p className="meaning-prompt">
              <b>词性</b> {partOfSpeechLabel(currentQuizWord.partOfSpeech)}
            </p>
            <p className="meaning-prompt">
              <b>例句</b>{' '}
              {checked
                ? currentQuizWord.example || '暂无例句'
                : maskExampleSentence(currentQuizWord.example, currentQuizWord.word)}
            </p>
            {checked && (
              <>
                <p className="meaning-prompt">
                  <b>拆分</b> {currentQuizWord.phonics || '未填写'}
                </p>
              </>
            )}
          </div>
          {quizMessage && (
            <output className="notice-banner">{quizMessage}</output>
          )}
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
                void checkAnswer();
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
                disabled={scoreBusy || Boolean(pendingScore.current)}
                onChange={(event) => setQuizInput(event.target.value)}
                placeholder={
                  session.type === 'missing' ? '填入空缺字母' : '在这里拼写'
                }
              />
              <div className="letter-keyboard" aria-label="字母键盘">
                {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => (
                  <button
                    key={letter}
                    type="button"
                    onClick={() => setQuizInput((value) => value + letter.toLowerCase())}
                    disabled={scoreBusy || Boolean(pendingScore.current)}
                  >
                    {letter} <small>{letter.toLowerCase()}</small>
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="letter-keyboard-delete"
                onClick={() => setQuizInput((value) => value.slice(0, -1))}
                disabled={scoreBusy || Boolean(pendingScore.current) || !quizInput}
              >
                ⌫ 删除
              </button>
              <div className="answer-actions">
                <Button
                  type="submit"
                  className="primary-action"
                  disabled={!quizInput.trim() || scoreBusy}
                >
                  <Check />{' '}
                  {scoreBusy
                    ? '正在保存…'
                    : pendingScore.current
                      ? '重试保存'
                      : '提交'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={scoreBusy}
                  onClick={() => void checkAnswer(true)}
                >
                  忘记了
                </Button>
              </div>
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
                  <b>中文</b>
                  {currentQuizWord.meaning || '未填写'}
                </span>
                <span>
                  <b>音标</b>
                  {currentQuizWord.ipa || '未填写'}
                </span>
                <span>
                  <b>词性</b>
                  {partOfSpeechLabel(currentQuizWord.partOfSpeech)}
                </span>
                <span>
                  <b>拆分</b>
                  {currentQuizWord.phonics || '未填写'}
                </span>
                <span>
                  <b>例句</b>
                  {currentQuizWord.example || '暂无例句'}
                </span>
              </div>
              {scoreAward?.correct && (
                <p className="reward-feedback">
                  {scoreAward.points
                    ? '+1 积分 · 小树长大一点'
                    : '今天这个词已得分，继续巩固。'}
                </p>
              )}
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
              <small>英语学习工作台 · {APP_VERSION}</small>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <nav aria-label="主导航">
            <SidebarMenu className="app-navigation">
              {[
                { value: 'today', label: '今日学习', icon: BookOpen },
                { value: 'recognition', label: '单词背诵', icon: BookMarked, disabled: true },
                { value: 'test', label: '拼写测试', icon: Target },
                { value: 'mistakes', label: '错题记录', icon: AlertTriangle },
                { value: 'grammar', label: '语法测试', icon: ListChecks, disabled: true },
                { value: 'rewards', label: '积分种树', icon: Sprout },
                { value: 'statistics', label: '学习统计', icon: BarChart3 },
                { value: 'settings', label: '设置', icon: Settings2 },
              ].map(({ value, label, icon: Icon, disabled }) => (
                <SidebarMenuItem key={value}>
                  <SidebarMenuButton
                    isActive={tab === value}
                    disabled={disabled}
                    title={disabled ? `${label}（尚未启用）` : label}
                    aria-current={tab === value ? 'page' : undefined}
                    onClick={() =>
                      value === 'settings'
                        ? requestSettings()
                        : leaveSettings(value)
                    }
                  >
                    <Icon />
                    <span>{label}</span>
                    {disabled && <small className="nav-disabled-note">尚未启用</small>}
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
                mistakes: '错题记录',
                grammar: '语法测试',
                rewards: '积分种树',
                statistics: '学习统计',
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
                <Button disabled title="尚未启用">
                  尚未启用
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
                  <Button variant="outline" disabled title="尚未启用">
                    尚未启用
                  </Button>
                </div>
              </div>
            </section>
          )}
          {tab === 'recognition' && (
            <RecognitionView
              store={learning}
              manage={() => {
                requestSettings('recognition-library');
              }}
            />
          )}
          {tab === 'grammar' && (
            <GrammarView
              store={learning}
              manage={() => {
                requestSettings('grammar-library');
              }}
            />
          )}

          {tab === 'mistakes' && (
            <section className="learning-view mistakes-view">
              <div className="report-heading">
                <div>
                  <p className="eyebrow">SPELLING REVIEW</p>
                  <h1>错题记录</h1>
                  <p>错过的单词会自动提高出现优先级，直到练熟。</p>
                </div>
                <Button variant="outline" onClick={() => setTab('test')}>
                  去做错题挑战 <ChevronRight />
                </Button>
              </div>
              <div className="mistake-stats-cards">
                <article>
                  <span>今日错题</span>
                  <strong>{todayMistakeWords.length}</strong>
                  <small>今天答错过的不同单词</small>
                </article>
                <article>
                  <span>累计错题</span>
                  <strong>{mistakeWords.length}</strong>
                  <small>历史上至少答错一次</small>
                </article>
                <article>
                  <span>累计测试次数</span>
                  <strong>
                    {Object.values(spellingStats).reduce(
                      (sum, stat) => sum + stat.attempts,
                      0,
                    )}
                  </strong>
                  <small>每个单词的总作答次数</small>
                </article>
              </div>
              <div className="mistake-records panel">
                <div className="mistake-record-heading">
                  <h2>今天需要再看</h2>
                  <Badge variant="secondary">
                    {todayMistakeWords.length} 个
                  </Badge>
                </div>
                {(todayMistakeWords.length ? todayMistakeWords : mistakeWords)
                  .length ? (
                  <div className="mistake-record-list">
                    {(todayMistakeWords.length
                      ? todayMistakeWords
                      : mistakeWords
                    ).map((word) => {
                      const stat = spellingStats[word.id];
                      const dayStat = statForDay(stat, todayKey);
                      const chapter = chapters.find(
                        (item) => item.id === word.chapterId,
                      );
                      return (
                        <article key={word.id}>
                          <div>
                            <strong>{word.word}</strong>
                            <small>
                              {word.meaning} · {chapter?.title ?? '自定义章节'}
                            </small>
                          </div>
                          <span>
                            {dayStat.wrong
                              ? `今日错 ${dayStat.wrong} 次 · `
                              : ''}
                            共测 {stat?.attempts ?? 0} 次 · 对{' '}
                            {stat?.correct ?? 0} 次 · 错 {stat?.wrong ?? 0} 次
                          </span>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="empty-state">
                    <CheckCircle2 /> 还没有错题，继续保持！
                  </div>
                )}
              </div>
              <div className="mistake-records panel">
                <div className="mistake-record-heading">
                  <h2>累计错题库</h2>
                  <span>下次随机挑战会优先抽到这里的词</span>
                </div>
                {mistakeWords.length ? (
                  <div className="mistake-record-list">
                    {mistakeWords.map((word) => {
                      const stat = spellingStats[word.id];
                      return (
                        <article key={word.id}>
                          <div>
                            <strong>{word.word}</strong>
                            <small>{word.meaning}</small>
                          </div>
                          <span>
                            测试 {stat?.attempts ?? 0} 次 · 拼对{' '}
                            {stat?.correct ?? 0} 次 · 错 {stat?.wrong ?? 0} 次
                          </span>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="empty-state">累计错题会显示在这里。</div>
                )}
              </div>
            </section>
          )}

          {tab === 'test' && (
            <section className="test-center">
              <div className="page-title-row">
                <div>
                  <p className="eyebrow">SPELLING TEST</p>
                  <h1>拼写测试中心</h1>
                  <p>
                    家长先设置今天的范围和题数，孩子再点击中间的挑战卡开始。
                  </p>
                </div>
              </div>
              {quizMessage && (
                <div className="notice-banner">{quizMessage}</div>
              )}
              <div className="spelling-launch-card panel">
                <div className="spelling-launch-icon">
                  {testSetupUnlocked ? <Play /> : <LockKeyhole />}
                </div>
                <p className="eyebrow">
                  {testSetupUnlocked ? "TODAY'S CHALLENGE" : 'PARENT SETUP'}
                </p>
                <h2>
                  {testSetupUnlocked
                    ? '准备好开始挑战了吗？'
                    : '请先由家长设置今天的测试'}
                </h2>
                <p>
                  {testSetupUnlocked
                    ? `${modeInfo[quizMode].title} · ${typeInfo[quizType].title} · ${launchCount} 题`
                    : dailyEncouragement()}
                </p>
                {testSetupUnlocked ? (
                  <Button className="primary-action" onClick={() => buildQuiz()}>
                    <Play /> 开始挑战
                  </Button>
                ) : (
                  <div className="challenge-choice-row">
                    <Button
                      className="primary-action"
                      disabled={!todayPlanReady}
                      onClick={() => buildQuiz(quizMode, quizType, true)}
                      title={todayPlanReady ? '使用家长保存的今日计划' : '今日计划尚未设置'}
                    >
                      <Play /> 今日计划挑战
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setDirectChallengeOpen((open) => !open)}
                    >
                      <Shuffle /> 随机挑战
                    </Button>
                  </div>
                )}
                {!testSetupUnlocked && (
                  <div className="direct-challenge-block">
                    {directChallengeOpen && (
                      <div className="direct-challenge-options">
                        <span>选择今天挑战数量：</span>
                        {[10, 20, 40].map((count) => (
                          <Button
                            key={count}
                            variant="outline"
                            onClick={() => buildDirectChallenge(count)}
                          >
                            {count} 题
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="test-quick-controls">
                <button type="button" onClick={requestTestSetup}>
                  <BookMarked /> 测试范围
                  <small>
                    {effectiveTestChapters.length
                      ? `${effectiveTestChapters.length} 章 · ${rangeProgress.tested}/${rangeProgress.total} · ${rangeProgress.total ? Math.round((rangeProgress.tested / rangeProgress.total) * 100) : 0}%`
                      : '未选择'}
                  </small>
                </button>
                <button type="button" onClick={requestTestSetup}>
                  <Target /> 数量
                  <small>{launchCount} 题</small>
                </button>
                <button type="button" onClick={requestTestSetup}>
                  <Pencil /> 拼写方式
                  <small>{typeInfo[quizType].title}</small>
                </button>
                <button type="button" onClick={requestTestSetup}>
                  <Shuffle /> 排序与错题
                  <small>{wrongFirst ? '错题优先' : '正常顺序'}</small>
                </button>
              </div>
              {testSetupUnlocked && (
                <div className="test-setup-panel panel">
                  <div className="test-setup-heading">
                    <div>
                      <h2>今天的测试设置</h2>
                      <p>设置完成后再点击上方“开始挑战”。</p>
                    </div>
                    <Badge variant="secondary">家长已解锁</Badge>
                  </div>
                  <div className="range-progress-summary">
                    <strong>当前总章节范围</strong>
                    <span>
                      共 {rangeProgress.total} 个 · 已测 {rangeProgress.tested}{' '}
                      个 ·{' '}
                      {rangeProgress.total
                        ? Math.round(
                            (rangeProgress.tested / rangeProgress.total) * 100,
                          )
                        : 0}
                      %
                    </span>
                    <small>
                      昨日测试 {rangeProgress.yesterday} 个
                      {rangeProgress.yesterday
                        ? ' · 已在记录中标注'
                        : ' · 昨日暂无测试'}
                    </small>
                  </div>
                  <div className="test-setup-grid">
                    <fieldset>
                      <legend>测试范围与顺序</legend>
                      <div className="compact-choice-row">
                        {(Object.keys(modeInfo) as QuizMode[]).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            className={quizMode === mode ? 'selected' : ''}
                            onClick={() => {
                              setQuizMode(mode);
                              updateQuizPlan({
                                mode,
                                configuredDate: todayKey,
                              });
                            }}
                          >
                            {mode === 'sequence' ? (
                              <ListChecks />
                            ) : mode === 'chapter' ? (
                              <BookMarked />
                            ) : (
                              <Shuffle />
                            )}
                            {modeInfo[mode].title}
                          </button>
                        ))}
                      </div>
                      <p className="setup-hint">
                        随机挑战只从已经测过的章节抽题；还没有历史时会使用当前选中的章节。
                      </p>
                    </fieldset>
                    {quizMode !== 'random' && (
                      <fieldset>
                        <legend>章节范围</legend>
                        <div className="chapter-checks compact">
                          {orderedChapters.map((chapter) => (
                            <label
                              key={chapter.id}
                              className={
                                testPlan.selectedChapters.includes(chapter.id)
                                  ? 'checked'
                                  : ''
                              }
                            >
                              <Checkbox
                                checked={testPlan.selectedChapters.includes(
                                  chapter.id,
                                )}
                                onCheckedChange={(value) =>
                                  selectQuizChapters(
                                    value
                                      ? [
                                          ...new Set([
                                            ...testPlan.selectedChapters,
                                            chapter.id,
                                          ]),
                                        ]
                                      : testPlan.selectedChapters.filter(
                                          (id) => id !== chapter.id,
                                        ),
                                  )
                                }
                              />
                              <span>
                                <strong>{chapter.title}</strong>
                                <small>
                                  {(() => {
                                    const progress = chapterProgress(
                                      chapter.id,
                                    );
                                    return `共 ${progress.total} 个 · 已测 ${progress.tested} 个 · ${progress.percent}% · 昨日测 ${progress.yesterday} 个`;
                                  })()}
                                </small>
                              </span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    )}
                    <fieldset>
                      <legend>抽题方式</legend>
                      <div className="compact-choice-row">
                        <button
                          type="button"
                          className={
                            quizSelection === 'checked' ? 'selected' : ''
                          }
                          onClick={() => {
                            setQuizSelection('checked');
                            updateQuizPlan({
                              selection: 'checked',
                              configuredDate: todayKey,
                            });
                          }}
                        >
                          <Check /> 指定勾选单词
                        </button>
                        <button
                          type="button"
                          className={
                            quizSelection === 'random' ? 'selected' : ''
                          }
                          onClick={() => {
                            setQuizSelection('random');
                            updateQuizPlan({
                              selection: 'random',
                              configuredDate: todayKey,
                            });
                          }}
                        >
                          <Shuffle /> 随机抽题
                        </button>
                      </div>
                      <label className="setup-number-field">
                        总题数
                        <Input
                          type="number"
                          min={1}
                          max={100}
                          value={String(testPlan.count || settings.quizCount)}
                          onChange={(event) => {
                            const count = Math.min(
                              100,
                              Math.max(1, Number(event.target.value) || 1),
                            );
                            updateQuizPlan({ count, configuredDate: todayKey });
                            setSettings((current) => ({
                              ...current,
                              quizCount: count,
                            }));
                          }}
                        />
                      </label>
                    </fieldset>
                    {quizSelection === 'random' && quizMode === 'chapter' && (
                      <fieldset>
                        <legend>每章随机抽几个</legend>
                        <div className="chapter-quota-grid">
                          {testPlan.selectedChapters.map((chapterId) => {
                            const chapter = chapters.find(
                              (item) => item.id === chapterId,
                            );
                            if (!chapter) return null;
                            return (
                              <label key={chapterId}>
                                <span>{chapter.title}</span>
                                <Input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={String(
                                    testPlan.perChapter[chapterId] ?? 0,
                                  )}
                                  onChange={(event) =>
                                    updateQuizPlan({
                                      perChapter: {
                                        ...testPlan.perChapter,
                                        [chapterId]: Math.min(
                                          100,
                                          Math.max(
                                            0,
                                            Number(event.target.value) || 0,
                                          ),
                                        ),
                                      },
                                      configuredDate: todayKey,
                                    })
                                  }
                                />
                              </label>
                            );
                          })}
                        </div>
                        <p className="setup-hint">
                          多章节随机抽题时，每章都要填写具体数量；填 0
                          表示该章今天不抽题。单章节可直接使用“总题数”。
                        </p>
                      </fieldset>
                    )}
                    {quizSelection === 'checked' && quizMode !== 'random' && (
                      <fieldset className="word-picker-fieldset">
                        <legend>
                          指定单词（已选 {testPlan.selectedWordIds.length} 个）
                        </legend>
                        <Input
                          value={wordPickerQuery}
                          onChange={(event) =>
                            setWordPickerQuery(event.target.value)
                          }
                          placeholder="搜索英文或中文"
                        />
                        <div className="word-picker-list">
                          {activeWords
                            .filter((word) =>
                              testPlan.selectedChapters.includes(
                                word.chapterId,
                              ),
                            )
                            .filter((word) =>
                              `${word.word} ${word.meaning}`
                                .toLowerCase()
                                .includes(wordPickerQuery.trim().toLowerCase()),
                            )
                            .slice(0, 80)
                            .map((word) => (
                              <label key={word.id}>
                                <Checkbox
                                  checked={testPlan.selectedWordIds.includes(
                                    word.id,
                                  )}
                                  onCheckedChange={(value) =>
                                    toggleSelectedWord(word.id, Boolean(value))
                                  }
                                />
                                <span>
                                  <strong>{word.word}</strong>
                                  <small>{word.meaning}</small>
                                </span>
                                <em>
                                  {spellingStats[word.id]?.attempts ?? 0} 次 ·
                                  对 {spellingStats[word.id]?.correct ?? 0} 次
                                </em>
                              </label>
                            ))}
                        </div>
                      </fieldset>
                    )}
                    <fieldset>
                      <legend>拼写方式</legend>
                      <div className="compact-choice-row">
                        {(Object.keys(typeInfo) as QuizType[]).map((type) => (
                          <button
                            key={type}
                            type="button"
                            className={quizType === type ? 'selected' : ''}
                            onClick={() => {
                              setQuizType(type);
                              updateQuizPlan({
                                type,
                                configuredDate: todayKey,
                              });
                            }}
                          >
                            {type === 'missing' ? <Pencil /> : <Headphones />}
                            {typeInfo[type].title}
                          </button>
                        ))}
                      </div>
                      {quizType === 'missing' && (
                        <div className="missing-settings">
                          <div>
                            <span>缺几个字母</span>
                            <div className="compact-choice-row">
                              {[1, 2, 3, 4].map((count) => (
                                <button
                                  key={count}
                                  type="button"
                                  className={
                                    missingCount === count ? 'selected' : ''
                                  }
                                  onClick={() => {
                                    setMissingCount(count);
                                    updateQuizPlan({
                                      missingCount: count,
                                      configuredDate: todayKey,
                                    });
                                  }}
                                >
                                  {count} 个
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <span>缺字母位置</span>
                            <div className="compact-choice-row">
                              {(
                                [
                                  ['random', '随机缺字母'],
                                  ['phonics', '缺自然拼读字母'],
                                  ['first', '缺首字母'],
                                ] as const
                              ).map(([mode, label]) => (
                                <button
                                  key={mode}
                                  type="button"
                                  className={
                                    missingMode === mode ? 'selected' : ''
                                  }
                                  onClick={() => {
                                    setMissingMode(mode);
                                    updateQuizPlan({
                                      missingMode: mode,
                                      configuredDate: todayKey,
                                    });
                                  }}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </fieldset>
                    <label className="wrong-first-toggle">
                      <Checkbox
                        checked={wrongFirst}
                        onCheckedChange={(value) => {
                          setWrongFirst(Boolean(value));
                          updateQuizPlan({
                            wrongFirst: Boolean(value),
                            configuredDate: todayKey,
                          });
                        }}
                      />
                      <span>
                        <strong>优先安排以往错题</strong>
                        <small>默认开启；错题仍按累计错误次数排序。</small>
                      </span>
                    </label>
                    <div className="plan-save-row">
                      <Button
                        className="primary-action"
                        onClick={() => {
                          updateQuizPlan({ configuredDate: todayKey });
                          setTestSetupUnlocked(false);
                          setQuizMessage('今日计划已保存，可以开始挑战了。');
                        }}
                      >
                        保存今日计划
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              <div className="test-mistake-summary panel">
                <div>
                  <AlertTriangle />
                  <div>
                    <h2>错题会自动回来</h2>
                    <p>
                      今日错题 {todayMistakeWords.length} 个 · 累计错题{' '}
                      {mistakeWords.length} 个 · 已测章节{' '}
                      {testedChapterIds.length} 章
                    </p>
                  </div>
                </div>
                <Button variant="outline" onClick={() => setTab('mistakes')}>
                  查看错题记录
                </Button>
              </div>
              <div className="plan-entry-row">
                <Button className="plan-entry-button" onClick={requestTestSetup}>
                  设置今日计划
                </Button>
              </div>
            </section>
          )}

          {tab === 'rewards' && <RewardsView />}
          {tab === 'statistics' && <StatisticsView />}
          <section
            className="settings-overview"
            hidden={tab !== 'settings' || parentOpen}
          >
            <h1>设置</h1>
            <InstallAppPanel />
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
                  <TabsTrigger value="sync">
                    <Cloud /> 设备同步
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
                      <h2>自然拼读背单词小手册 · v1.9</h2>
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
                          <span className="word-test-cell">
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
                            <small>
                              测 {spellingStats[word.id]?.attempts ?? 0} · 对{' '}
                              {spellingStats[word.id]?.correct ?? 0}
                            </small>
                          </span>
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
                    登录“家庭设备同步”后，认词词库、拼写词库、语法题库、学习进度、积分统计和已种的树都会保存到家庭云端；断网时仍保留在当前设备，联网后自动补同步。JSON
                    备份主要用于手动保存词库和学习设置，不替代家庭云同步。
                  </p>
                  <div className="backup-grid">
                    <section className="backup-card">
                      <div className="backup-icon blue-bg">
                        <Download />
                      </div>
                      <h2>导出词库与学习进度</h2>
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
                      <h2>恢复 v1.9 原始词库</h2>
                      <p>
                        只重置拼写词库和拼写进度，回到原始的 75 章、2,490
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
                              确定恢复 v1.9 原始词库？
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              当前词库修改会被覆盖。建议先导出备份。
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction onClick={resetToV19}>
                              确认恢复
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </section>
                  </div>
                  <section className="record-management panel">
                    <div className="record-management-heading">
                      <div>
                        <h2>测试记录管理</h2>
                        <p>
                          第一次使用前可以清理测试记录，方便家长先完整试用一遍。清理会重置错题次数、测试次数和拼写统计；已经种下的树会保留。
                        </p>
                      </div>
                      <AlertTriangle />
                    </div>
                    <div className="record-management-actions">
                      <AlertDialog>
                        <AlertDialogTrigger
                          render={<Button variant="outline" />}
                        >
                          清理今日拼写记录
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              清理今天的拼写记录？
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              今日错题、测试次数和今日积分统计会被清除，词库本身不会改变。
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => void clearSpellingRecords('today')}
                            >
                              确认清理
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      <AlertDialog>
                        <AlertDialogTrigger
                          render={<Button variant="outline" />}
                        >
                          清理全部拼写记录
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              清理全部拼写记录？
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              累计错题、测试次数、正确次数和拼写统计会全部清零，词库和已种的树会保留。
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => void clearSpellingRecords('all')}
                            >
                              确认全部清理
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </section>
                </TabsContent>
                <TabsContent value="sync">
                  <CloudSyncPanel />
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
              <div className="full">
                <h3>拼写用词典录音</h3>
                <p className="muted">
                  自动按本词音标匹配，同等条件优先美音。多音词可在这里试听并选定。
                </p>
                <WordAudio
                  word={draftWord.word}
                  ipa={draftWord.ipa}
                  preferredUrl={draftWord.audioUrl}
                  onSelect={(audioUrl) =>
                    setDraftWord({ ...draftWord, audioUrl })
                  }
                />
              </div>
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
      <Dialog
        open={pinOpen}
        onOpenChange={(open) => {
          setPinOpen(open);
          if (!open) {
            setPin('');
            setPinError('');
          }
        }}
      >
        <DialogContent className="pin-dialog">
          <DialogHeader>
            <DialogTitle>
              <LockKeyhole />{' '}
              {pinPurpose === 'test' ? '今日测试设置已上锁' : '家长设置已上锁'}
            </DialogTitle>
            <DialogDescription>
              请输入 4 位家长密码后
              {pinPurpose === 'test' ? '开始今日拼写测试' : '进入设置'}。
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              unlockSettings();
            }}
          >
            <label htmlFor="parent-pin">家长密码</label>
            <Input
              id="parent-pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={pin}
              onChange={(event) =>
                setPin(event.target.value.replace(/\D/g, '').slice(0, 4))
              }
            />
            {pinError && <output className="pin-error">{pinError}</output>}
            <DialogFooter>
              <Button type="submit" disabled={pin.length !== 4}>
                {pinPurpose === 'test' ? '解锁今日测试' : '解锁设置'}
              </Button>
            </DialogFooter>
          </form>
          <p className="pin-note">
            这是防止孩子误改设置的家庭密码锁，不用于保护重要账户信息。
          </p>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}

export default function Home() {
  return (
    <CloudSyncProvider>
      <Workbench />
    </CloudSyncProvider>
  );
}

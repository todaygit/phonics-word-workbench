'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Download,
  Flame,
  Library,
  ListRestart,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  Volume2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Progress, ProgressLabel } from '@/components/ui/progress';
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

type WordStatus = 'new' | 'learning' | 'mastered';
type ReviewStrategy = 'spaced' | 'mixed' | 'sound-first';

type Word = {
  id: string;
  word: string;
  phonics: string;
  meaning: string;
  example: string;
  group: string;
  status: WordStatus;
  active: boolean;
  interval: number;
  nextReview: string;
  reviews: number;
};

type Settings = {
  newPerDay: number;
  reviewPerDay: number;
  strategy: ReviewStrategy;
  spellingRound: boolean;
  autoSpeak: boolean;
};

const todayKey = () => new Date().toISOString().slice(0, 10);

const DEFAULT_SETTINGS: Settings = {
  newPerDay: 6,
  reviewPerDay: 12,
  strategy: 'spaced',
  spellingRound: true,
  autoSpeak: false,
};

const seedWords: Word[] = [
  { id: 'cat', word: 'cat', phonics: 'c · a · t', meaning: '猫', example: 'The cat is on the mat.', group: '短元音 a', status: 'learning', active: true, interval: 1, nextReview: todayKey(), reviews: 1 },
  { id: 'map', word: 'map', phonics: 'm · a · p', meaning: '地图', example: 'This is a map.', group: '短元音 a', status: 'learning', active: true, interval: 2, nextReview: todayKey(), reviews: 2 },
  { id: 'fish', word: 'fish', phonics: 'f · i · sh', meaning: '鱼', example: 'I see a red fish.', group: '短元音 i / sh', status: 'learning', active: true, interval: 1, nextReview: todayKey(), reviews: 1 },
  { id: 'ship', word: 'ship', phonics: 'sh · i · p', meaning: '船', example: 'The ship is big.', group: '短元音 i / sh', status: 'learning', active: true, interval: 3, nextReview: todayKey(), reviews: 3 },
  { id: 'sun', word: 'sun', phonics: 's · u · n', meaning: '太阳', example: 'The sun is hot.', group: '短元音 u', status: 'mastered', active: true, interval: 7, nextReview: todayKey(), reviews: 5 },
  { id: 'bed', word: 'bed', phonics: 'b · e · d', meaning: '床', example: 'The bed is soft.', group: '短元音 e', status: 'mastered', active: true, interval: 7, nextReview: todayKey(), reviews: 5 },
  { id: 'frog', word: 'frog', phonics: 'f · r · o · g', meaning: '青蛙', example: 'A frog can jump.', group: '辅音连缀 fr', status: 'new', active: true, interval: 0, nextReview: todayKey(), reviews: 0 },
  { id: 'green', word: 'green', phonics: 'g · r · ee · n', meaning: '绿色', example: 'The frog is green.', group: '长元音 ee', status: 'new', active: true, interval: 0, nextReview: todayKey(), reviews: 0 },
  { id: 'rain', word: 'rain', phonics: 'r · ai · n', meaning: '雨', example: 'I like the rain.', group: '元音组合 ai', status: 'new', active: true, interval: 0, nextReview: todayKey(), reviews: 0 },
  { id: 'chair', word: 'chair', phonics: 'ch · air', meaning: '椅子', example: 'Sit on the chair.', group: '辅音组合 ch', status: 'new', active: true, interval: 0, nextReview: todayKey(), reviews: 0 },
  { id: 'moon', word: 'moon', phonics: 'm · oo · n', meaning: '月亮', example: 'The moon is bright.', group: '元音组合 oo', status: 'new', active: true, interval: 0, nextReview: todayKey(), reviews: 0 },
  { id: 'star', word: 'star', phonics: 's · t · ar', meaning: '星星', example: 'I see a star.', group: 'r 控制元音 ar', status: 'new', active: true, interval: 0, nextReview: todayKey(), reviews: 0 },
];

const strategyLabels: Record<ReviewStrategy, string> = {
  spaced: '间隔复习',
  mixed: '新旧混合',
  'sound-first': '先听后认',
};

const statusLabels: Record<WordStatus, string> = {
  new: '未学',
  learning: '学习中',
  mastered: '已掌握',
};

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function speak(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.78;
  window.speechSynthesis.speak(utterance);
}

function loadStored<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function sliderFirst(value: number | readonly number[]) {
  return typeof value === 'number' ? value : value[0];
}

export default function Home() {
  const [words, setWords] = useState<Word[]>(seedWords);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [tab, setTab] = useState('today');
  const [session, setSession] = useState<Word[] | null>(null);
  const [sessionIndex, setSessionIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [query, setQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');
  const [editingWord, setEditingWord] = useState<Word | null>(null);
  const [bulkText, setBulkText] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setWords(loadStored('phonics.words', seedWords));
    setSettings(loadStored('phonics.settings', DEFAULT_SETTINGS));
    setCompleted(loadStored(`phonics.completed.${todayKey()}`, 0));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem('phonics.words', JSON.stringify(words));
  }, [words, hydrated]);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem('phonics.settings', JSON.stringify(settings));
  }, [settings, hydrated]);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem(`phonics.completed.${todayKey()}`, JSON.stringify(completed));
  }, [completed, hydrated]);

  const dueWords = useMemo(
    () => words.filter((word) => word.active && word.status !== 'new' && word.nextReview <= todayKey()),
    [words],
  );
  const newWords = useMemo(
    () => words.filter((word) => word.active && word.status === 'new'),
    [words],
  );
  const todayTotal = Math.min(dueWords.length, settings.reviewPerDay) + Math.min(newWords.length, settings.newPerDay);
  const focusGroups = useMemo(() => {
    const candidates = [...dueWords, ...newWords].slice(0, 8);
    const counts = new Map<string, number>();
    candidates.forEach((word) => counts.set(word.group, (counts.get(word.group) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [dueWords, newWords]);

  const groups = useMemo(() => [...new Set(words.map((word) => word.group))].sort(), [words]);
  const filteredWords = useMemo(() => {
    const lower = query.trim().toLowerCase();
    return words.filter((word) => {
      const matchText = !lower || `${word.word} ${word.meaning} ${word.phonics}`.toLowerCase().includes(lower);
      const matchGroup = groupFilter === 'all' || word.group === groupFilter;
      return matchText && matchGroup;
    });
  }, [words, query, groupFilter]);

  const masteredCount = words.filter((word) => word.status === 'mastered').length;
  const learningCount = words.filter((word) => word.status === 'learning').length;
  const currentWord = session?.[sessionIndex] ?? null;

  useEffect(() => {
    if (settings.autoSpeak && currentWord) speak(currentWord.word);
  }, [currentWord, settings.autoSpeak]);

  useEffect(() => {
    type WebTool = {
      name: string;
      title: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute: (input: unknown) => unknown | Promise<unknown>;
    };
    type WebContext = {
      registerTool: (tool: WebTool, options?: { signal?: AbortSignal }) => void | Promise<void>;
    };
    const context = (document as Document & { modelContext?: WebContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const afterPaint = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const register = (tool: WebTool) => {
      try {
        void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(console.warn);
      } catch (error) {
        console.warn(error);
      }
    };

    register({
      name: 'get_daily_phonics_plan',
      title: '查看今日拼读计划',
      description: '读取今天到期的复习量、新词量和当前学习设置，不修改数据。',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: () => ({
        dueReviews: Math.min(dueWords.length, settings.reviewPerDay),
        newWords: Math.min(newWords.length, settings.newPerDay),
        completed,
        strategy: settings.strategy,
      }),
    });

    register({
      name: 'configure_phonics_study_plan',
      title: '调整拼读学习计划',
      description: '调整每天的新词数、复习上限或复习方式，并同步更新工作台。',
      inputSchema: {
        type: 'object',
        properties: {
          newPerDay: { type: 'integer', minimum: 0, maximum: 20 },
          reviewPerDay: { type: 'integer', minimum: 5, maximum: 40 },
          strategy: { type: 'string', enum: ['spaced', 'mixed', 'sound-first'] },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input) => {
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('学习计划参数必须是对象。');
        const value = input as Partial<Settings>;
        if (value.newPerDay !== undefined && (!Number.isInteger(value.newPerDay) || value.newPerDay < 0 || value.newPerDay > 20)) throw new Error('newPerDay 必须是 0 到 20 的整数。');
        if (value.reviewPerDay !== undefined && (!Number.isInteger(value.reviewPerDay) || value.reviewPerDay < 5 || value.reviewPerDay > 40)) throw new Error('reviewPerDay 必须是 5 到 40 的整数。');
        if (value.strategy !== undefined && !['spaced', 'mixed', 'sound-first'].includes(value.strategy)) throw new Error('strategy 无效。');
        setSettings((current) => ({ ...current, ...value }));
        setTab('settings');
        await afterPaint();
        return { updated: true, ...value };
      },
    });

    register({
      name: 'add_phonics_words',
      title: '批量加入拼读单词',
      description: '把一个或多个英文单词连同中文、拼读拆分和拼读组加入词库。',
      inputSchema: {
        type: 'object',
        properties: {
          words: {
            type: 'array',
            minItems: 1,
            maxItems: 100,
            items: {
              type: 'object',
              properties: {
                word: { type: 'string', minLength: 1 },
                meaning: { type: 'string', minLength: 1 },
                phonics: { type: 'string' },
                group: { type: 'string' },
                example: { type: 'string' },
              },
              required: ['word', 'meaning'],
              additionalProperties: false,
            },
          },
        },
        required: ['words'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: async (input) => {
        const value = input as { words?: Array<Partial<Word>> };
        if (!Array.isArray(value?.words) || value.words.length < 1 || value.words.length > 100) throw new Error('words 必须包含 1 到 100 个单词。');
        const additions = value.words.map((item, index) => {
          const word = String(item.word ?? '').trim();
          const meaning = String(item.meaning ?? '').trim();
          if (!word || !meaning) throw new Error(`第 ${index + 1} 个单词缺少英文或中文。`);
          return {
            id: `${Date.now()}-agent-${index}`,
            word,
            meaning,
            phonics: String(item.phonics ?? '').trim() || word.split('').join(' · '),
            group: String(item.group ?? '').trim() || '智能导入',
            example: String(item.example ?? '').trim(),
            status: 'new' as WordStatus,
            active: true,
            interval: 0,
            nextReview: todayKey(),
            reviews: 0,
          };
        });
        setWords((current) => [...additions, ...current]);
        setTab('library');
        await afterPaint();
        return { added: additions.length, words: additions.map((item) => item.word) };
      },
    });

    return () => lifecycle.abort();
  }, [completed, dueWords, newWords, settings]);

  const startSession = () => {
    const reviews = dueWords.slice(0, settings.reviewPerDay);
    const fresh = newWords.slice(0, settings.newPerDay);
    const queue = settings.strategy === 'mixed'
      ? reviews.flatMap((word, index) => fresh[index] ? [word, fresh[index]] : [word]).concat(fresh.slice(reviews.length))
      : [...reviews, ...fresh];
    setSession(queue);
    setSessionIndex(0);
    setRevealed(false);
  };

  const gradeWord = (grade: 'again' | 'hard' | 'easy') => {
    if (!currentWord) return;
    const nextInterval = grade === 'again'
      ? 1
      : grade === 'hard'
        ? Math.max(2, Math.round(Math.max(currentWord.interval, 1) * 1.6))
        : Math.max(4, Math.round(Math.max(currentWord.interval, 1) * 2.5));
    setWords((items) => items.map((word) => word.id === currentWord.id ? {
      ...word,
      status: grade === 'easy' && nextInterval >= 7 ? 'mastered' : 'learning',
      interval: nextInterval,
      nextReview: addDays(nextInterval),
      reviews: word.reviews + 1,
    } : word));
    setCompleted((value) => value + 1);
    if (session && sessionIndex < session.length - 1) {
      setSessionIndex((value) => value + 1);
      setRevealed(false);
    } else {
      setSession([]);
    }
  };

  const saveWord = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const base: Word = {
      id: editingWord?.id ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      word: String(data.get('word') ?? '').trim(),
      phonics: String(data.get('phonics') ?? '').trim(),
      meaning: String(data.get('meaning') ?? '').trim(),
      example: String(data.get('example') ?? '').trim(),
      group: String(data.get('group') ?? '自定义').trim() || '自定义',
      status: editingWord?.status ?? 'new',
      active: editingWord?.active ?? true,
      interval: editingWord?.interval ?? 0,
      nextReview: editingWord?.nextReview ?? todayKey(),
      reviews: editingWord?.reviews ?? 0,
    };
    if (!base.word || !base.meaning) return;
    setWords((items) => editingWord ? items.map((word) => word.id === editingWord.id ? base : word) : [base, ...items]);
    setEditingWord(null);
  };

  const importBulk = () => {
    const additions = bulkText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, index) => {
      const [word, meaning, phonics = '', group = '批量导入', example = ''] = line.split(/[,，\t]/).map((cell) => cell.trim());
      if (!word || !meaning) return null;
      return {
        id: `${Date.now()}-${index}`,
        word,
        phonics: phonics || word.split('').join(' · '),
        meaning,
        example,
        group: group || '批量导入',
        status: 'new' as WordStatus,
        active: true,
        interval: 0,
        nextReview: todayKey(),
        reviews: 0,
      };
    }).filter((word): word is Word => Boolean(word));
    if (additions.length) setWords((items) => [...additions, ...items]);
    setBulkText('');
  };

  const exportWords = () => {
    const blob = new Blob([JSON.stringify({ words, settings }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `拼读词库-${todayKey()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importFile = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (Array.isArray(data.words)) setWords(data.words);
        if (data.settings) setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
      } catch {
        window.alert('这个文件无法识别，请选择从本工作台导出的 JSON 文件。');
      }
    };
    reader.readAsText(file);
  };

  const weekday = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date());

  if (session) {
    if (session.length === 0) {
      return (
        <main className="session-shell">
          <section className="finish-card">
            <div className="finish-burst"><Sparkles /></div>
            <p className="eyebrow">今日打卡完成</p>
            <h1>做得很棒，休息一下吧！</h1>
            <p>今天完成了 {completed} 次单词练习。系统已经根据答案安排好下一次复习。</p>
            <Button className="primary-action" onClick={() => setSession(null)}><Check /> 回到工作台</Button>
          </section>
        </main>
      );
    }

    return (
      <main className="session-shell">
        <div className="session-topbar">
          <Button variant="ghost" size="lg" onClick={() => setSession(null)}><ArrowLeft /> 暂停并返回</Button>
          <Progress value={((sessionIndex + 1) / session.length) * 100} className="session-progress">
            <ProgressLabel>第 {sessionIndex + 1} 个</ProgressLabel>
            <span className="progress-value">{session.length} 个</span>
          </Progress>
        </div>
        <section className="study-card">
          <div className="study-meta">
            <Badge variant="secondary">{currentWord?.group}</Badge>
            <span>{currentWord?.status === 'new' ? '新词' : '复习'}</span>
          </div>
          <button className="sound-button" onClick={() => currentWord && speak(currentWord.word)} aria-label="朗读单词">
            <Volume2 />
          </button>
          <h1 className={settings.strategy === 'sound-first' && !revealed ? 'word-hidden' : ''}>{currentWord?.word}</h1>
          <p className="phonics-line">{currentWord?.phonics}</p>
          {!revealed ? (
            <Button className="reveal-button" size="lg" onClick={() => setRevealed(true)}><CircleHelp /> 看意思与例句</Button>
          ) : (
            <div className="answer-panel">
              <strong>{currentWord?.meaning}</strong>
              <p>{currentWord?.example}</p>
            </div>
          )}
        </section>
        {revealed && (
          <div className="grade-row" aria-label="选择掌握程度">
            <button className="grade again" onClick={() => gradeWord('again')}><RotateCcw /><span>没想起</span><small>明天再见</small></button>
            <button className="grade hard" onClick={() => gradeWord('hard')}><Pause /><span>想了一会</span><small>稍后复习</small></button>
            <button className="grade easy" onClick={() => gradeWord('easy')}><Sparkles /><span>马上认出</span><small>拉长间隔</small></button>
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark"><span>p</span><span>h</span></div>
          <div><strong>拼读小队</strong><small>单词工作台</small></div>
        </div>
        <div className="header-status">
          <span className="date-label">{weekday}</span>
          <div className="streak"><Flame /> <strong>7</strong><span>天连续</span></div>
        </div>
      </header>

      <Tabs value={tab} onValueChange={(value) => setTab(String(value))} className="workspace">
        <TabsList className="main-nav" variant="line">
          <TabsTrigger value="today"><CalendarDays />今日学习</TabsTrigger>
          <TabsTrigger value="library"><Library />我的词库</TabsTrigger>
          <TabsTrigger value="settings"><Settings2 />学习计划</TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="dashboard-grid">
          <section className="today-hero">
            <div className="hero-copy">
              <p className="eyebrow">TODAY · {strategyLabels[settings.strategy]}</p>
              <h1>今天先听音，<br /><span>再把词拼出来。</span></h1>
              <p className="hero-note">预计 {Math.max(6, Math.ceil(todayTotal * 0.7))} 分钟 · {Math.min(dueWords.length, settings.reviewPerDay)} 个复习 + {Math.min(newWords.length, settings.newPerDay)} 个新词</p>
              <Button className="primary-action" size="lg" onClick={startSession} disabled={!todayTotal}>
                <Play fill="currentColor" /> {completed ? '继续今天的学习' : '开始今天的学习'}
              </Button>
            </div>
            <div className="progress-orbit" aria-label={`今日完成 ${completed}，计划 ${todayTotal}`}>
              <div className="orbit-ring" style={{ '--progress': `${Math.min(100, todayTotal ? (completed / todayTotal) * 100 : 0) * 3.6}deg` } as React.CSSProperties}>
                <div><strong>{completed}</strong><span>/ {todayTotal}</span><small>今日完成</small></div>
              </div>
              <span className="orbit-dot dot-one">sh</span>
              <span className="orbit-dot dot-two">ee</span>
              <span className="orbit-dot dot-three">a</span>
            </div>
          </section>

          <section className="panel focus-panel">
            <div className="panel-heading">
              <div><p className="eyebrow">PHONICS FOCUS</p><h2>今日拼读重点</h2></div>
              <button onClick={() => setTab('library')}>查看词库 <ChevronRight /></button>
            </div>
            <div className="focus-list">
              {(focusGroups.length ? focusGroups : [['短元音 a', 0], ['辅音组合 sh', 0]]).map(([group, count], index) => (
                <button className="focus-item" key={group} onClick={() => { setGroupFilter(group as string); setTab('library'); }}>
                  <span className={`focus-sound sound-${index + 1}`}>{String(group).match(/[a-z]+/i)?.[0] ?? '音'}</span>
                  <span><strong>{group}</strong><small>{count} 个今日单词</small></span>
                  <ChevronRight />
                </button>
              ))}
            </div>
          </section>

          <section className="panel review-panel">
            <div className="panel-heading"><div><p className="eyebrow">REVIEW RADAR</p><h2>复习雷达</h2></div><Clock3 /></div>
            <div className="radar-count"><strong>{dueWords.length}</strong><span>个词今天到期</span></div>
            <div className="mini-bars" aria-hidden="true">
              {[42, 68, 56, 88, 64, 36, 52].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}
            </div>
            <div className="legend"><span><i className="orange" />待复习</span><span><i className="blue" />已完成</span></div>
          </section>

          <section className="panel stats-panel">
            <div className="stat"><BookOpen /><span><strong>{words.length}</strong><small>词库总量</small></span></div>
            <div className="stat"><ListRestart /><span><strong>{learningCount}</strong><small>正在学习</small></span></div>
            <div className="stat"><Sparkles /><span><strong>{masteredCount}</strong><small>已经掌握</small></span></div>
          </section>
        </TabsContent>

        <TabsContent value="library" className="library-view">
          <div className="page-title-row">
            <div><p className="eyebrow">WORD LIBRARY</p><h1>我的词库</h1><p>词库调整后，明天的学习计划会自动重排。</p></div>
            <div className="title-actions">
              <input ref={importRef} type="file" accept="application/json" hidden onChange={(event) => importFile(event.target.files?.[0])} />
              <Button variant="outline" onClick={() => importRef.current?.click()}><Upload />恢复</Button>
              <Button variant="outline" onClick={exportWords}><Download />备份</Button>
              <WordDialog editingWord={editingWord} setEditingWord={setEditingWord} onSave={saveWord} />
            </div>
          </div>

          <section className="library-toolbar">
            <div className="search-box"><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索单词、中文或拼读拆分" /></div>
            <Select value={groupFilter} onValueChange={(value) => setGroupFilter(String(value))}>
              <SelectTrigger className="group-select"><SelectValue placeholder="全部拼读组" /></SelectTrigger>
              <SelectContent><SelectItem value="all">全部拼读组</SelectItem>{groups.map((group) => <SelectItem value={group} key={group}>{group}</SelectItem>)}</SelectContent>
            </Select>
            <Dialog>
              <DialogTrigger render={<Button variant="outline" />}><Plus />批量粘贴</DialogTrigger>
              <DialogContent className="bulk-dialog">
                <DialogHeader><DialogTitle>批量加入单词</DialogTitle><DialogDescription>每行一个词，按“英文，中文，拼读拆分，拼读组，例句”排列。后面三项可以不填。</DialogDescription></DialogHeader>
                <Textarea value={bulkText} onChange={(event) => setBulkText(event.target.value)} rows={9} placeholder={'ship，船，sh · i · p，短元音 i / sh，The ship is big.\nrain，雨，r · ai · n，元音组合 ai'} />
                <DialogFooter><DialogClose render={<Button variant="outline" />}>取消</DialogClose><DialogClose render={<Button onClick={importBulk} />}>导入词库</DialogClose></DialogFooter>
              </DialogContent>
            </Dialog>
          </section>

          <div className="word-table" role="table" aria-label="单词列表">
            <div className="word-row word-head" role="row"><span>单词 / 拼读</span><span>中文 / 例句</span><span>拼读组</span><span>状态</span><span>启用</span><span></span></div>
            {filteredWords.map((word) => (
              <div className="word-row" role="row" key={word.id}>
                <span className="word-cell"><strong>{word.word}</strong><small>{word.phonics}</small></span>
                <span className="meaning-cell"><strong>{word.meaning}</strong><small>{word.example || '还没有例句'}</small></span>
                <span><Badge variant="secondary">{word.group}</Badge></span>
                <span><i className={`status-dot ${word.status}`} />{statusLabels[word.status]}</span>
                <span><Switch checked={word.active} onCheckedChange={(checked) => setWords((items) => items.map((item) => item.id === word.id ? { ...item, active: Boolean(checked) } : item))} aria-label={`${word.word}是否启用`} /></span>
                <span className="row-actions">
                  <Button size="icon-sm" variant="ghost" aria-label={`编辑${word.word}`} onClick={() => setEditingWord(word)}><Pencil /></Button>
                  <Button size="icon-sm" variant="ghost" aria-label={`删除${word.word}`} onClick={() => setWords((items) => items.filter((item) => item.id !== word.id))}><Trash2 /></Button>
                </span>
              </div>
            ))}
            {!filteredWords.length && <div className="empty-row">没有找到匹配的单词。</div>}
          </div>
          {editingWord && <WordDialog editingWord={editingWord} setEditingWord={setEditingWord} onSave={saveWord} controlled />}
        </TabsContent>

        <TabsContent value="settings" className="settings-view">
          <div className="page-title-row"><div><p className="eyebrow">STUDY PLAN</p><h1>学习计划</h1><p>先把节奏调舒服。设置会保存在这台设备上。</p></div></div>
          <div className="settings-grid">
            <section className="settings-card">
              <div className="setting-icon orange-bg"><Plus /></div>
              <div className="setting-copy"><h2>每天新学</h2><p>从未学词里按词库顺序抽取</p></div>
              <strong className="setting-value">{settings.newPerDay}<small> 个词</small></strong>
              <Slider min={0} max={20} step={1} value={[settings.newPerDay]} onValueChange={(value) => setSettings((item) => ({ ...item, newPerDay: sliderFirst(value) }))} aria-label="每天新学单词数" />
              <div className="range-label"><span>0</span><span>20</span></div>
            </section>
            <section className="settings-card">
              <div className="setting-icon blue-bg"><ListRestart /></div>
              <div className="setting-copy"><h2>每天复习上限</h2><p>到期词太多时分批完成</p></div>
              <strong className="setting-value">{settings.reviewPerDay}<small> 个词</small></strong>
              <Slider min={5} max={40} step={1} value={[settings.reviewPerDay]} onValueChange={(value) => setSettings((item) => ({ ...item, reviewPerDay: sliderFirst(value) }))} aria-label="每天复习单词上限" />
              <div className="range-label"><span>5</span><span>40</span></div>
            </section>
            <section className="settings-card wide">
              <div className="setting-icon violet-bg"><Clock3 /></div>
              <div className="setting-copy"><h2>复习方式</h2><p>回答“没想起 / 想了一会 / 马上认出”后，系统自动调整下次出现时间。</p></div>
              <Select value={settings.strategy} onValueChange={(value) => setSettings((item) => ({ ...item, strategy: value as ReviewStrategy }))}>
                <SelectTrigger className="strategy-select"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="spaced">间隔复习 · 先复习后新词</SelectItem><SelectItem value="mixed">新旧混合 · 交替出现</SelectItem><SelectItem value="sound-first">先听后认 · 先隐藏拼写</SelectItem></SelectContent>
              </Select>
            </section>
            <section className="settings-card toggle-card">
              <div><h2>加入拼写轮次</h2><p>熟悉后增加“听音拼写”提示</p></div>
              <Switch checked={settings.spellingRound} onCheckedChange={(checked) => setSettings((item) => ({ ...item, spellingRound: Boolean(checked) }))} aria-label="加入拼写轮次" />
            </section>
            <section className="settings-card toggle-card">
              <div><h2>自动朗读</h2><p>进入每张单词卡时自动读一遍</p></div>
              <Switch checked={settings.autoSpeak} onCheckedChange={(checked) => setSettings((item) => ({ ...item, autoSpeak: Boolean(checked) }))} aria-label="自动朗读" />
            </section>
          </div>
          <section className="plan-preview">
            <div><p className="eyebrow">NEXT SESSION</p><h2>按当前设置，下一次约 {Math.max(6, Math.ceil((settings.newPerDay + settings.reviewPerDay) * 0.7))} 分钟</h2></div>
            <div className="plan-chips"><span>{settings.reviewPerDay} 个复习</span><i>+</i><span>{settings.newPerDay} 个新词</span><i>·</i><span>{strategyLabels[settings.strategy]}</span></div>
          </section>
        </TabsContent>
      </Tabs>
    </main>
  );
}

function WordDialog({ editingWord, setEditingWord, onSave, controlled = false }: {
  editingWord: Word | null;
  setEditingWord: (word: Word | null) => void;
  onSave: (event: React.FormEvent<HTMLFormElement>) => void;
  controlled?: boolean;
}) {
  const content = (
    <DialogContent className="word-dialog">
      <form onSubmit={onSave}>
        <DialogHeader><DialogTitle>{editingWord ? '编辑单词' : '加入一个单词'}</DialogTitle><DialogDescription>拼读拆分建议按发音单位填写，例如 sh · i · p。</DialogDescription></DialogHeader>
        <div className="form-grid">
          <label>英文<Input name="word" defaultValue={editingWord?.word} placeholder="ship" required autoFocus /></label>
          <label>中文<Input name="meaning" defaultValue={editingWord?.meaning} placeholder="船" required /></label>
          <label className="full">拼读拆分<Input name="phonics" defaultValue={editingWord?.phonics} placeholder="sh · i · p" /></label>
          <label className="full">拼读组<Input name="group" defaultValue={editingWord?.group} placeholder="短元音 i / sh" /></label>
          <label className="full">例句<Input name="example" defaultValue={editingWord?.example} placeholder="The ship is big." /></label>
        </div>
        <DialogFooter><DialogClose render={<Button type="button" variant="outline" onClick={() => setEditingWord(null)} />}>取消</DialogClose><DialogClose render={<Button type="submit" />}>保存到词库</DialogClose></DialogFooter>
      </form>
    </DialogContent>
  );
  if (controlled) return <Dialog open onOpenChange={(open) => !open && setEditingWord(null)}>{content}</Dialog>;
  return <Dialog><DialogTrigger render={<Button />}><Plus />加入单词</DialogTrigger>{content}</Dialog>;
}

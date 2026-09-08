'use client';
/* Native navigation is required for platform sign-in; private uploaded images retain authenticated same-origin requests. */
/* oxlint-disable react/react-compiler, jsx-a11y/label-has-associated-control, next/no-html-link-for-pages, next/no-img-element, jsx-a11y/prefer-tag-over-role */
import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  Pencil,
  Plus,
  Trash2,
  Volume2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import {
  dateKey,
  exampleGrammar,
  learningStats,
  newGrammar,
  newRecognition,
  startRecognition,
  type GrammarQuestion,
  type RecognitionWord,
} from './learning-model';
import type { LearningStore } from './use-learning';
import { WordAudio, stopWordAudio } from './word-audio';
import { ResourcePicker } from './resource-picker';

function speak(value: string) {
  stopWordAudio();
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const speech = new SpeechSynthesisUtterance(value);
  speech.lang = 'en-US';
  speech.rate = 0.76;
  window.speechSynthesis.speak(speech);
}
function duration(minutes: number) {
  return minutes < 1440
    ? `${minutes} 分钟`
    : `${Math.round((minutes / 1440) * 10) / 10} 天`;
}
function dateTime(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp);
}

export function LearningStatus({ store }: { store: LearningStore }) {
  if (!store.error && store.ready) return null;
  return (
    <div className="notice-banner" role="status">
      {store.error || '正在读取学习记录…'}{' '}
      {store.needsLogin ? (
        <a href="/signin-with-chatgpt?return_to=/" target="_top">
          登录工作台
        </a>
      ) : (
        store.error && (
          <Button
            variant="outline"
            disabled={store.busy}
            onClick={() => void store.reload()}
          >
            重新载入
          </Button>
        )
      )}
    </div>
  );
}

export function RecognitionView({
  store,
  manage,
}: {
  store: LearningStore;
  manage: () => void;
}) {
  const { data, busy, ready, save, stale } = store;
  const [playing, setPlaying] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [clock, setClock] = useState(Date.now());
  const [imageFailed, setImageFailed] = useState(false);
  const [teaching, setTeaching] = useState<RecognitionWord | null>(null);
  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  const stats = learningStats(data, clock);
  const session = data.session;
  const current =
    teaching ?? data.words.find((w) => w.id === session?.queue[0]);
  useEffect(() => {
    setImageFailed(false);
  }, [current?.word, session?.step]);
  const disabled = busy || !ready || stale;
  async function begin() {
    setFeedback('');
    setTeaching(null);
    if (await save((current) => startRecognition(current))) setPlaying(true);
  }
  async function answer(known: boolean) {
    if (!session) return;
    const step = session.step;
    const missed = current;
    const award = await store.answer({
      kind: 'recognition',
      sessionId: session.id,
      step,
      known,
    });
    if (award) {
      if (!known && missed) setTeaching(missed);
      setFeedback(
        known
          ? award.points
            ? '认出来了！+1 积分，小树长大一点。'
            : '认出来了！今天这个词已得分，继续巩固。'
          : '没关系，读一读、看一看，等会儿再认一次。',
      );
    }
  }
  return (
    <section className="learning-view">
      <LearningStatus store={store} />
      {playing && session ? (
        <>
          <div className="learning-topbar">
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => setPlaying(false)}
            >
              <ArrowLeft /> 暂停并返回
            </Button>
            <span>
              本轮认出 {session.completed.length} 个 · 待认{' '}
              {session.queue.length} 个
            </span>
          </div>
          {current ? (
            <article
              className="recognition-card"
              key={`${session.id}-${session.step}`}
            >
              <div className="recognition-meta">
                <Badge variant="secondary">{current.chapter}</Badge>
                <span>只要认识，不用默写</span>
              </div>
              <div
                className={`recognition-content ${!current.image || imageFailed ? 'without-image' : ''}`}
              >
                {current.image && !imageFailed && (
                  <img
                    className="recognition-image"
                    src={current.image}
                    alt={`${current.word} 的学习配图`}
                    onError={() => setImageFailed(true)}
                  />
                )}
                <div className="recognition-copy">
                  <div className="recognition-word">
                    <h1>{current.word}</h1>
                  </div>
                  <WordAudio
                    word={current.word}
                    ipa={current.ipa}
                    preferredUrl={current.audioUrl}
                    autoPlay={data.plan.autoSpeak}
                  />
                  {current.imageSource && (
                    <small className="media-attribution">
                      <a
                        href={current.imageSource}
                        target="_blank"
                        rel="noreferrer"
                      >
                        配图出处
                      </a>{' '}
                      · {current.imageAuthor} ·{' '}
                      {current.imageLicenseUrl ? (
                        <a
                          href={current.imageLicenseUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {current.imageLicense}
                        </a>
                      ) : (
                        current.imageLicense
                      )}
                    </small>
                  )}
                  {(!current.image || imageFailed) && (
                    <p className="muted">
                      {imageFailed
                        ? '配图暂时无法加载，可以先认词。'
                        : '此词暂未配图，可由家长补充。'}
                    </p>
                  )}
                  {current.example ? (
                    <div className="recognition-example">
                      <p>{current.example}</p>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => speak(current.example)}
                      >
                        <Volume2 /> 读例句
                      </Button>
                      <small>
                        {current.source || '家长录入例句（未注明教材出处）'}
                      </small>
                    </div>
                  ) : (
                    <p className="muted">例句待补充，RAZ 材料接入后可完善。</p>
                  )}
                  <details
                    className="recognition-details"
                    open={teaching ? true : undefined}
                  >
                    <summary>查看中文、音标与拆分</summary>
                    <p>{current.meaning}</p>
                    <p>{current.ipa || '音标未填写'}</p>
                    <p>{current.phonics || '拆分未填写'}</p>
                  </details>
                </div>
              </div>
              <p className="oral-instruction">
                {teaching
                  ? '和家长一起读一读。这个词已加入重学队列，稍后再认一次。'
                  : '先口头告诉家长，这个单词是什么意思。'}
              </p>
              <div className="recognition-actions">
                {teaching ? (
                  <Button
                    disabled={disabled}
                    onClick={() => {
                      setTeaching(null);
                      setFeedback('');
                    }}
                  >
                    读完了，继续背诵 <ChevronRight />
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      disabled={disabled}
                      onClick={() => void answer(false)}
                    >
                      <CircleHelp /> 不认识，再学一次
                    </Button>
                    <Button
                      disabled={disabled}
                      onClick={() => void answer(true)}
                    >
                      <Check /> 认识
                    </Button>
                  </>
                )}
              </div>
              <p className="learning-feedback" role="status">
                {busy ? '正在保存…' : feedback}
              </p>
            </article>
          ) : (
            <div className="learning-empty">
              <Check />
              <h1>这一轮认完了</h1>
              <p className="reward-feedback">{feedback}</p>
              <p>认出的词已经安排好下次复习。不认识过的词会更早再见面。</p>
              <Button onClick={() => setPlaying(false)}>返回背诵中心</Button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="page-title-row">
            <div>
              <p className="eyebrow">WORD LEARNING</p>
              <h1>单词背诵</h1>
              <p>看单词、看图片、读例句，口头告诉家长。</p>
            </div>
          </div>
          <div className="learning-counts">
            <div>
              <strong>{stats.fresh.length}</strong>
              <span>今天可学新词</span>
            </div>
            <div>
              <strong>{stats.reviews.length}</strong>
              <span>本次可复习</span>
            </div>
            <div>
              <strong>{stats.day.knownIds.length}</strong>
              <span>今天已认出</span>
            </div>
          </div>
          <div className="learning-launch panel">
            <div>
              <h2>
                {session?.queue.length
                  ? `还有 ${session.queue.length} 个词，接着来`
                  : '今天的认词时间'}
              </h2>
              <p>
                先复习到期词，再按录入顺序认识新词。点“不认识”会放回重学队列。
              </p>
              <Button
                disabled={
                  disabled ||
                  (!session?.queue.length &&
                    !stats.fresh.length &&
                    !stats.reviews.length)
                }
                onClick={() => void begin()}
              >
                <BookOpen />{' '}
                {session?.queue.length ? '继续上次背诵' : '开始背诵'}
              </Button>
            </div>
          </div>
          {!data.words.length ? (
            <div className="learning-empty">
              <h2>还没有录入认词单词</h2>
              <p>
                从“设置 → 家长控制 → 认词词库”录入当天新词，也可以复制已有 v0.8
                章节。不会自动加入默写。
              </p>
              <Button variant="outline" onClick={manage}>
                去录入认词单词
              </Button>
            </div>
          ) : (
            <div className="panel learning-note">
              <h2>复习安排</h2>
              <p>{data.plan.intervals.map(duration).join(' → ')}</p>
              <p>
                每次认出后，按当前阶段从答题时间起计算下次间隔；不认识会回到第一阶段。此安排参考遗忘规律，可由家长调整。
              </p>
              {!stats.fresh.length &&
                !stats.reviews.length &&
                !session?.queue.length && (
                  <p>
                    {data.words.some((w) => w.active && w.due > clock)
                      ? `下一次复习：${dateTime(Math.min(...data.words.filter((w) => w.active && w.due > clock).map((w) => w.due)))}`
                      : '今天没有待安排的词，可休息或由家长调整计划。'}
                  </p>
                )}
              <p className="muted">
                当天重学和已安排词的再次复习不重复占用额度；未完成的词可跨日继续。
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function GrammarView({
  store,
  manage,
}: {
  store: LearningStore;
  manage: () => void;
}) {
  const { data, save, busy, ready, stale } = store;
  const [chapters, setChapters] = useState<string[]>([]);
  const [count, setCount] = useState('10');
  const [answer, setAnswer] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);
  const session = data.grammarSession;
  const completed = Boolean(
    session && session.answers.length === session.questions.length,
  );
  const index = session
    ? Math.max(0, session.answers.length - (showFeedback ? 1 : 0))
    : 0;
  const question = session?.questions[index];
  const options = [
    ...new Set(data.grammar.filter((q) => q.active).map((q) => q.chapter)),
  ];
  const selected = data.grammar.filter(
    (q) => q.active && (!chapters.length || chapters.includes(q.chapter)),
  );
  const disabled = busy || !ready || stale;
  async function check() {
    if (!question || !answer.trim() || !session || showFeedback) return;
    const expectedIndex = index;
    const ok = await store.answer({
      kind: 'grammar',
      sessionId: session.id,
      step: expectedIndex,
      answer,
    });
    if (ok) setShowFeedback(true);
  }
  return (
    <section className="learning-view">
      <LearningStatus store={store} />
      {session && (!completed || showFeedback) && question ? (
        <>
          <div className="learning-topbar">
            <Button
              variant="ghost"
              disabled={disabled}
              onClick={async () => {
                if (await save((d) => ({ ...d, grammarSession: null }))) {
                  setShowFeedback(false);
                  setAnswer('');
                }
              }}
            >
              <ArrowLeft /> 结束本轮
            </Button>
            <span>
              语法测试 · {index + 1} / {session.questions.length}
            </span>
          </div>
          <article className="grammar-card">
            <Badge variant="secondary">{question.chapter}</Badge>
            <h1>{question.prompt}</h1>
            <p className="muted">{question.source || '家长录入题目'}</p>
            {question.type === 'choice' ? (
              <div className="grammar-options">
                {question.options.map((option) => (
                  <Button
                    key={option}
                    variant={answer === option ? 'default' : 'outline'}
                    disabled={disabled || showFeedback}
                    onClick={() => setAnswer(option)}
                  >
                    {option}
                  </Button>
                ))}
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void check();
                }}
              >
                <label>
                  填写答案
                  <Input
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    disabled={disabled || showFeedback}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
              </form>
            )}
            {showFeedback ? (
              <div className="grammar-feedback" role="status">
                <h2>
                  {session.answers[index]?.correct
                    ? '答对了！'
                    : `正确答案：${question.answer.split('|').join(' / ')}`}
                </h2>
                {store.lastAward?.correct && (
                  <p className="reward-feedback">
                    {store.lastAward.points
                      ? '+1 积分 · 小树长大一点'
                      : '今天这道题已得分，继续巩固。'}
                  </p>
                )}
                <p>
                  {question.explanation || '这道题暂未填写解析，可请家长讲解。'}
                </p>
                <Button
                  onClick={() => {
                    setShowFeedback(false);
                    setAnswer('');
                  }}
                >
                  {completed ? '查看本轮结果' : '下一题'} <ChevronRight />
                </Button>
              </div>
            ) : (
              <Button
                disabled={disabled || !answer.trim()}
                onClick={() => void check()}
              >
                检查答案
              </Button>
            )}
          </article>
        </>
      ) : session && completed ? (
        <div className="learning-empty">
          <h1>
            {session.answers.filter((a) => a.correct).length} /{' '}
            {session.questions.length} 答对
          </h1>
          <p>语法成绩独立记录，不影响认词或默写进度。</p>
          {session.questions.map(
            (q, i) =>
              !session.answers[i].correct && (
                <div className="grammar-review" key={q.id}>
                  <strong>{q.prompt}</strong>
                  <p>
                    你的答案：{session.answers[i].answer} · 正确答案：
                    {q.answer.split('|').join(' / ')}
                  </p>
                  <p>{q.explanation}</p>
                </div>
              ),
          )}
          <Button
            disabled={disabled}
            onClick={() => void save((d) => ({ ...d, grammarSession: null }))}
          >
            返回语法测试
          </Button>
        </div>
      ) : (
        <>
          <div className="page-title-row">
            <div>
              <p className="eyebrow">GRAMMAR TEST</p>
              <h1>语法测试</h1>
              <p>选择题或填空题，答完查看讲解。按题库顺序出题。</p>
            </div>
          </div>
          {options.length ? (
            <div className="panel grammar-setup">
              <h2>选择章节</h2>
              <p className="muted">不勾选时使用全部已启用章节。</p>
              <div className="chapter-checks">
                {options.map((chapter) => (
                  <label key={chapter}>
                    <Checkbox
                      checked={chapters.includes(chapter)}
                      onCheckedChange={(checked) =>
                        setChapters((list) =>
                          checked
                            ? [...list, chapter]
                            : list.filter((c) => c !== chapter),
                        )
                      }
                    />
                    {chapter}
                  </label>
                ))}
              </div>
              <label className="compact-field">
                每轮题数
                <Select value={count} onValueChange={(v) => v && setCount(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[5, 10, 20, 30, 50].map((n) => (
                      <SelectItem value={String(n)} key={n}>
                        {n} 题
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <Button
                disabled={disabled || !selected.length}
                onClick={async () => {
                  setAnswer('');
                  setShowFeedback(false);
                  await save((d) => ({
                    ...d,
                    grammarSession: {
                      id: crypto.randomUUID(),
                      questions: selected.slice(0, Number(count)),
                      answers: [],
                    },
                  }));
                }}
              >
                开始测试 · {Math.min(selected.length, Number(count))} 题
              </Button>
            </div>
          ) : (
            <div className="learning-empty">
              <h2>语法题库准备好了，等你加入题目</h2>
              <p>
                家长可以录入选择题、填空题和解析，也可以先加入 6
                道自编示例体验。
              </p>
              <Button variant="outline" onClick={manage}>
                去管理语法题库
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function DeleteButton({
  title,
  onDelete,
  disabled,
}: {
  title: string;
  onDelete: () => void;
  disabled: boolean;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            disabled={disabled}
            aria-label={`删除 ${title}`}
          />
        }
      >
        <Trash2 />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除“{title}”？</AlertDialogTitle>
          <AlertDialogDescription>
            将从此词库或题库移除。删除前可在数据备份中导出一份副本。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={onDelete}>确认删除</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type SourceChapter = { id: string; title: string };
type SourceWord = {
  word: string;
  meaning: string;
  ipa: string;
  phonics: string;
  example: string;
  chapterId: string;
};

export function RecognitionLibrary({
  store,
  sourceWords,
  sourceChapters,
}: {
  store: LearningStore;
  sourceWords: SourceWord[];
  sourceChapters: SourceChapter[];
}) {
  const { data, save, busy, ready, stale } = store;
  const [draft, setDraft] = useState<RecognitionWord | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [bulk, setBulk] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkDate, setBulkDate] = useState(dateKey());
  const [bulkChapter, setBulkChapter] = useState('每日新词');
  const [copyChapter, setCopyChapter] = useState(sourceChapters[0]?.id ?? '');
  const [message, setMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const disabled = busy || !ready || stale || uploading;
  const filtered = data.words.filter(
    (w) =>
      (filter === 'all' || w.chapter === filter) &&
      `${w.word} ${w.meaning}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 30));
  useEffect(() => {
    setPage(1);
  }, [query, filter]);
  useEffect(() => {
    setPage((p) => Math.min(p, pages));
  }, [pages]);
  const existing = (word: string, chapter: string) =>
    data.words.some(
      (w) =>
        w.word.toLowerCase() === word.toLowerCase() && w.chapter === chapter,
    );
  async function importBulk() {
    const lines = bulkText.split(/\r?\n/).filter((line) => line.trim());
    const additions: RecognitionWord[] = [];
    for (const [index, line] of lines.entries()) {
      const [
        word = '',
        meaning = '',
        ipa = '',
        phonics = '',
        example = '',
        source = '',
      ] = line.split(/\t|\|/).map((s) => s.trim());
      if (!word || !meaning) {
        setMessage(`第 ${index + 1} 行缺少英文或中文，尚未导入任何词。`);
        return;
      }
      if (
        !existing(word, bulkChapter) &&
        !additions.some((w) => w.word.toLowerCase() === word.toLowerCase())
      )
        additions.push(
          newRecognition({
            word,
            meaning,
            ipa,
            phonics,
            example,
            source,
            chapter: bulkChapter.trim() || '每日新词',
            learnedOn: bulkDate,
          }),
        );
    }
    if (!additions.length) {
      setMessage('没有可新增的单词，空行和同章节已有词不会重复加入。');
      return;
    }
    if (await save((d) => ({ ...d, words: [...d.words, ...additions] }))) {
      setMessage(`已增加 ${additions.length} 个认词单词，未加入默写。`);
      setBulk(false);
      setBulkText('');
    }
  }
  async function upload(file?: File) {
    if (!file || !draft) return;
    if (file.size > 1024 * 1024) {
      setMessage('图片需小于 1 MB，请先缩小图片。');
      return;
    }
    setUploading(true);
    setMessage('');
    try {
      const response = await fetch('/api/learning/image', {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      const body = (await response.json()) as { error?: string; image: string };
      if (!response.ok) throw new Error(body.error);
      setDraft((current) =>
        current
          ? {
              ...current,
              image: body.image,
              imageSource: '',
              imageAuthor: '',
              imageLicense: '',
              imageLicenseUrl: '',
            }
          : current,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '图片上传失败。');
    } finally {
      setUploading(false);
    }
  }
  return (
    <div>
      <LearningStatus store={store} />
      <div className="library-summary">
        <div>
          <h2>认词词库</h2>
          <p>{data.words.length} 个词 · 只用于认识和口头回答，与拼写词库分开</p>
        </div>
        <div className="title-actions">
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => {
              setMessage('');
              setBulk(true);
            }}
          >
            批量录入
          </Button>
          <Button
            disabled={disabled}
            onClick={() => {
              setMessage('');
              setDraft(newRecognition());
            }}
          >
            <Plus /> 新增认词单词
          </Button>
        </div>
      </div>
      {message && (
        <p className="notice-banner" role="status">
          {message}
        </p>
      )}
      <div className="panel copy-bank">
        <label>
          从现有拼写词库复制一个章节
          <Select
            value={copyChapter}
            onValueChange={(v) => v && setCopyChapter(v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sourceChapters.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <Button
          variant="outline"
          disabled={disabled || !copyChapter}
          onClick={async () => {
            const chapter =
              sourceChapters.find((c) => c.id === copyChapter)?.title ?? 'v0.8';
            const additions = sourceWords
              .filter(
                (w) =>
                  w.chapterId === copyChapter && !existing(w.word, chapter),
              )
              .map((w) =>
                newRecognition({
                  word: w.word,
                  meaning: w.meaning,
                  ipa: w.ipa,
                  phonics: w.phonics,
                  example: w.example,
                  chapter,
                  source: 'v0.8 工作台词库例句（非 RAZ）',
                }),
              );
            if (
              await save((d) => ({ ...d, words: [...d.words, ...additions] }))
            )
              setMessage(
                `已复制 ${additions.length} 个词。原拼写词库和成绩不变。图片可逐词补充。`,
              );
          }}
        >
          复制到认词词库
        </Button>
      </div>
      <div className="library-toolbar">
        <Input
          aria-label="搜索认词单词"
          placeholder="搜索英文或中文"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Select value={filter} onValueChange={(v) => v && setFilter(v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部分组</SelectItem>
            {[...new Set(data.words.map((w) => w.chapter))].map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="learning-library">
        {filtered.slice((page - 1) * 30, page * 30).map((w) => (
          <div className="learning-row" key={w.id}>
            <div>
              <strong>{w.word}</strong>
              <span>{w.meaning}</span>
              <small>
                {w.chapter} · {w.learnedOn}
              </small>
            </div>
            <div className="learning-row-meta">
              <span>{w.seen ? `下次 ${dateTime(w.due)}` : '还没开始'}</span>
              <small>
                {w.image ? '已配图' : '待配图'} ·{' '}
                {w.example ? '已有例句' : '待补例句'}
              </small>
            </div>
            <div className="learning-row-actions">
              <Switch
                aria-label={`启用认词 ${w.word}`}
                checked={w.active}
                disabled={disabled}
                onCheckedChange={(active) =>
                  void save((d) => ({
                    ...d,
                    words: d.words.map((item) =>
                      item.id === w.id ? { ...item, active } : item,
                    ),
                    session: d.session
                      ? {
                          ...d.session,
                          queue: d.session.queue.filter(
                            (id) => active || id !== w.id,
                          ),
                        }
                      : null,
                  }))
                }
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={`编辑认词 ${w.word}`}
                disabled={disabled}
                onClick={() => {
                  setMessage('');
                  setDraft({ ...w });
                }}
              >
                <Pencil />
              </Button>
              <DeleteButton
                title={w.word}
                disabled={disabled}
                onDelete={() =>
                  void save((d) => ({
                    ...d,
                    words: d.words.filter((item) => item.id !== w.id),
                    session: d.session
                      ? {
                          ...d.session,
                          queue: d.session.queue.filter((id) => id !== w.id),
                        }
                      : null,
                  }))
                }
              />
            </div>
          </div>
        ))}
        {!filtered.length && (
          <div className="learning-empty">
            还没有符合条件的词。可以新增或复制上方章节。
          </div>
        )}
      </div>
      <div className="pagination-row">
        <Button
          variant="outline"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          上一页
        </Button>
        <span>
          {page} / {pages}
        </span>
        <Button
          variant="outline"
          disabled={page >= pages}
          onClick={() => setPage((p) => p + 1)}
        >
          下一页
        </Button>
      </div>
      <Dialog
        open={Boolean(draft)}
        onOpenChange={(open) => !open && !uploading && setDraft(null)}
      >
        <DialogContent className="word-dialog">
          <DialogHeader>
            <DialogTitle>
              {data.words.some((w) => w.id === draft?.id)
                ? '编辑认词单词'
                : '新增认词单词'}
            </DialogTitle>
            <DialogDescription>
              只加入认词学习。请填写图片对应的词义，并注明例句出处；RAZ
              材料稍后接入。
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="word-form">
              {(
                [
                  ['word', '英文单词 *'],
                  ['meaning', '中文词义 *'],
                  ['chapter', '学习分组 *'],
                  ['learnedOn', '学习日期 *'],
                  ['ipa', '音标'],
                  ['phonics', '单词拆分'],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <Input
                    type={key === 'learnedOn' ? 'date' : 'text'}
                    value={draft[key]}
                    onChange={(e) =>
                      setDraft({ ...draft, [key]: e.target.value })
                    }
                  />
                </label>
              ))}
              <label className="full">
                例句
                <Textarea
                  value={draft.example}
                  onChange={(e) =>
                    setDraft({ ...draft, example: e.target.value })
                  }
                />
              </label>
              <label className="full">
                例句出处（书名、级别、页码；自编请注明）
                <Input
                  value={draft.source}
                  onChange={(e) =>
                    setDraft({ ...draft, source: e.target.value })
                  }
                  placeholder="例如：家长自编；或 RAZ 书名 / 级别 / 页码"
                />
              </label>
              <label className="full">
                学习配图（PNG / JPEG / WebP，最多 1 MB）
                <Input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={uploading}
                  onChange={(e) => void upload(e.target.files?.[0])}
                />
              </label>
              {draft.image && (
                <div className="full image-editor">
                  <img src={draft.image} alt="待保存的学习配图" />
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        image: '',
                        imageSource: '',
                        imageAuthor: '',
                        imageLicense: '',
                        imageLicenseUrl: '',
                      })
                    }
                  >
                    移除这张配图
                  </Button>
                </div>
              )}
              <ResourcePicker
                key={`${draft.id}-${draft.word}`}
                word={draft}
                onApply={(change) =>
                  setDraft((current) =>
                    current ? { ...current, ...change } : current,
                  )
                }
              />
              {message && <p className="full notice-banner">{message}</p>}
              {store.error && (
                <p className="full notice-banner">{store.error}</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={uploading}
              onClick={() => setDraft(null)}
            >
              取消
            </Button>
            <Button
              disabled={
                disabled ||
                !draft?.word.trim() ||
                !draft.meaning.trim() ||
                !draft.chapter.trim() ||
                !draft.learnedOn
              }
              onClick={async () => {
                if (!draft) return;
                const word = {
                  ...draft,
                  word: draft.word.trim(),
                  meaning: draft.meaning.trim(),
                  chapter: draft.chapter.trim(),
                };
                if (
                  data.words.some(
                    (w) =>
                      w.id !== word.id &&
                      w.word.toLowerCase() === word.word.toLowerCase() &&
                      w.chapter === word.chapter,
                  )
                ) {
                  setMessage('同分组已有这个单词，请编辑原词条。');
                  return;
                }
                if (
                  await save((d) => ({
                    ...d,
                    words: d.words.some((w) => w.id === word.id)
                      ? d.words.map((w) => (w.id === word.id ? word : w))
                      : [...d.words, word],
                  }))
                )
                  setDraft(null);
              }}
            >
              {uploading ? '上传图片中…' : busy ? '保存中…' : '保存认词单词'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={bulk} onOpenChange={setBulk}>
        <DialogContent className="word-dialog">
          <DialogHeader>
            <DialogTitle>批量录入认词单词</DialogTitle>
            <DialogDescription>
              每行一个词，用竖线 |
              或制表符分隔；英文和中文必填。整批检查通过后才会导入。
            </DialogDescription>
          </DialogHeader>
          <div className="word-form">
            <label>
              学习日期
              <Input
                type="date"
                value={bulkDate}
                onChange={(e) => setBulkDate(e.target.value)}
              />
            </label>
            <label>
              学习分组
              <Input
                value={bulkChapter}
                onChange={(e) => setBulkChapter(e.target.value)}
              />
            </label>
            <label className="full">
              英文 | 中文 | 音标 | 拆分 | 例句 | 出处
              <Textarea
                rows={8}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={
                  'cat | 猫 | /kæt/ | c + a + t | The cat is on the mat. | 家长自编\ndog | 狗'
                }
              />
            </label>
            {message && <p className="full notice-banner">{message}</p>}
            {store.error && <p className="full notice-banner">{store.error}</p>}
          </div>
          <DialogFooter>
            <Button
              disabled={
                disabled || !bulkText.trim() || !bulkDate || !bulkChapter.trim()
              }
              onClick={() => void importBulk()}
            >
              导入认词词库
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function RecognitionPlan({ store }: { store: LearningStore }) {
  const { data, save, busy, ready, stale } = store;
  const [plan, setPlan] = useState(data.plan);
  const [intervals, setIntervals] = useState(data.plan.intervals.join(', '));
  const [location, setLocation] = useState(data.materialLocation);
  const [message, setMessage] = useState('');
  useEffect(() => {
    setPlan(data.plan);
    setIntervals(data.plan.intervals.join(', '));
    setLocation(data.materialLocation);
  }, [data.plan, data.materialLocation]);
  return (
    <div className="panel recognition-plan">
      <LearningStatus store={store} />
      <h2>认词学习与间隔复习</h2>
      <p>这组设置只影响“单词背诵”，与拼写测试分开。</p>
      <div className="word-form">
        <label>
          每天安排新词（0–100）
          <Input
            type="number"
            min={0}
            max={100}
            value={plan.newLimit}
            onChange={(e) =>
              setPlan({ ...plan, newLimit: Number(e.target.value) })
            }
          />
        </label>
        <label>
          每天安排复习词（0–200）
          <Input
            type="number"
            min={0}
            max={200}
            value={plan.reviewLimit}
            onChange={(e) =>
              setPlan({ ...plan, reviewLimit: Number(e.target.value) })
            }
          />
        </label>
        <label className="full">
          各阶段复习间隔（分钟，英文逗号分隔）
          <Input
            value={intervals}
            onChange={(e) => setIntervals(e.target.value)}
          />
          <small>
            默认：10 分钟、1 天、2 天、4 天、7 天、15 天、30
            天。每次认出后从当前时间计算；不认识重新从第一个间隔开始。
          </small>
        </label>
        <label className="full switch-field">
          <Switch
            checked={plan.autoSpeak}
            onCheckedChange={(autoSpeak) => setPlan({ ...plan, autoSpeak })}
          />
          打开学习卡自动读单词
        </label>
        <label className="full">
          RAZ 材料位置备注（可稍后填写）
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="把材料所在文件夹位置记在这里"
          />
          <small>
            目前未接入
            RAZ。填路径不会让网站直接读取电脑文件；请在对话中把位置告诉我，再整理到词卡。
          </small>
        </label>
      </div>
      <p className="muted">
        限额按每天安排的不同单词计算。重复背诵不重复计数；已有队列不因调低限额被删除。调整间隔后，从下一次答题起采用新设置。
      </p>
      {message && <p role="status">{message}</p>}
      <Button
        disabled={busy || !ready || stale}
        onClick={async () => {
          const values = intervals.split(/[,，]/).map((s) => Number(s.trim()));
          if (
            await save((d) => ({
              ...d,
              plan: { ...plan, intervals: values },
              materialLocation: location,
            }))
          )
            setMessage('认词计划已保存。');
        }}
      >
        保存认词计划
      </Button>
    </div>
  );
}

export function GrammarLibrary({ store }: { store: LearningStore }) {
  const { data, save, busy, ready, stale } = store;
  const [draft, setDraft] = useState<GrammarQuestion | null>(null);
  const [options, setOptions] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [importText, setImportText] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const disabled = busy || !ready || stale;
  function edit(q: GrammarQuestion) {
    setDraft({ ...q });
    setOptions(q.options.join('\n'));
    setMessage('');
  }
  const filtered = data.grammar.filter((q) =>
    `${q.chapter} ${q.prompt}`.toLowerCase().includes(query.toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 30));
  useEffect(() => {
    setPage(1);
  }, [query]);
  useEffect(() => {
    setPage((p) => Math.min(p, pages));
  }, [pages]);
  return (
    <div>
      <LearningStatus store={store} />
      <div className="library-summary">
        <div>
          <h2>语法题库</h2>
          <p>{data.grammar.length} 道题 · 支持选择题、填空题和答案解析</p>
        </div>
        <div className="title-actions">
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => setImportOpen(true)}
          >
            批量导入
          </Button>
          <Button disabled={disabled} onClick={() => edit(newGrammar())}>
            <Plus /> 新增题目
          </Button>
        </div>
      </div>
      <div className="panel learning-note">
        <p>
          尚未接入你的语法教材。可以先体验 6
          道自编示例；它们不是教材原题，随时可编辑或删除。
        </p>
        <Button
          variant="outline"
          disabled={
            disabled ||
            exampleGrammar.every((q) =>
              data.grammar.some((item) => item.id === q.id),
            )
          }
          onClick={() =>
            void save((d) => ({
              ...d,
              grammar: [
                ...d.grammar,
                ...exampleGrammar.filter(
                  (q) => !d.grammar.some((item) => item.id === q.id),
                ),
              ],
            }))
          }
        >
          加入自编示例题
        </Button>
      </div>
      <Input
        aria-label="搜索语法题"
        placeholder="搜索章节或题干"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="learning-library">
        {filtered.slice((page - 1) * 30, page * 30).map((q) => (
          <div className="learning-row grammar-row" key={q.id}>
            <div>
              <strong>{q.prompt}</strong>
              <span>
                {q.chapter} · {q.type === 'choice' ? '选择题' : '填空题'}
              </span>
              <small>{q.source || '未注明出处'}</small>
            </div>
            <div className="learning-row-actions">
              <Switch
                checked={q.active}
                disabled={disabled}
                aria-label={`启用题目 ${q.prompt}`}
                onCheckedChange={(active) =>
                  void save((d) => ({
                    ...d,
                    grammar: d.grammar.map((item) =>
                      item.id === q.id ? { ...item, active } : item,
                    ),
                  }))
                }
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={`编辑 ${q.prompt}`}
                disabled={disabled}
                onClick={() => edit(q)}
              >
                <Pencil />
              </Button>
              <DeleteButton
                title={q.prompt}
                disabled={disabled}
                onDelete={() =>
                  void save((d) => ({
                    ...d,
                    grammar: d.grammar.filter((item) => item.id !== q.id),
                  }))
                }
              />
            </div>
          </div>
        ))}
      </div>
      <div className="pagination-row">
        <Button
          variant="outline"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          上一页
        </Button>
        <span>
          {page} / {pages}
        </span>
        <Button
          variant="outline"
          disabled={page >= pages}
          onClick={() => setPage((p) => p + 1)}
        >
          下一页
        </Button>
      </div>
      <Dialog
        open={Boolean(draft)}
        onOpenChange={(open) => !open && setDraft(null)}
      >
        <DialogContent className="word-dialog">
          <DialogHeader>
            <DialogTitle>编辑语法题目</DialogTitle>
            <DialogDescription>
              填空题可用竖线 | 分隔多个可接受答案，自动忽略大小写与首尾空格。
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="word-form">
              <label>
                章节
                <Input
                  value={draft.chapter}
                  onChange={(e) =>
                    setDraft({ ...draft, chapter: e.target.value })
                  }
                />
              </label>
              <label>
                题型
                <Select
                  value={draft.type}
                  onValueChange={(type) =>
                    setDraft({ ...draft, type: type as 'choice' | 'fill' })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="choice">选择题</SelectItem>
                    <SelectItem value="fill">填空题</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="full">
                题干
                <Textarea
                  value={draft.prompt}
                  onChange={(e) =>
                    setDraft({ ...draft, prompt: e.target.value })
                  }
                />
              </label>
              {draft.type === 'choice' && (
                <label className="full">
                  选项（每行一个，2–6 个）
                  <Textarea
                    value={options}
                    onChange={(e) => setOptions(e.target.value)}
                  />
                </label>
              )}
              <label className="full">
                正确答案（选择题须与选项一致）
                <Input
                  value={draft.answer}
                  onChange={(e) =>
                    setDraft({ ...draft, answer: e.target.value })
                  }
                />
              </label>
              <label className="full">
                解析
                <Textarea
                  value={draft.explanation}
                  onChange={(e) =>
                    setDraft({ ...draft, explanation: e.target.value })
                  }
                />
              </label>
              <label className="full">
                教材出处或“自编”
                <Input
                  value={draft.source}
                  onChange={(e) =>
                    setDraft({ ...draft, source: e.target.value })
                  }
                />
              </label>
              {message && <p className="full notice-banner">{message}</p>}
              {store.error && (
                <p className="full notice-banner">{store.error}</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              disabled={
                disabled ||
                !draft?.prompt.trim() ||
                !draft.answer.trim() ||
                !draft.chapter.trim()
              }
              onClick={async () => {
                if (!draft) return;
                const q = {
                  ...draft,
                  options:
                    draft.type === 'choice'
                      ? options
                          .split('\n')
                          .map((s) => s.trim())
                          .filter(Boolean)
                      : [],
                  answer: draft.answer.trim(),
                  prompt: draft.prompt.trim(),
                  chapter: draft.chapter.trim(),
                };
                if (
                  await save((d) => ({
                    ...d,
                    grammar: d.grammar.some((item) => item.id === q.id)
                      ? d.grammar.map((item) => (item.id === q.id ? q : item))
                      : [...d.grammar, q],
                  }))
                )
                  setDraft(null);
              }}
            >
              保存题目
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="word-dialog">
          <DialogHeader>
            <DialogTitle>批量导入语法题</DialogTitle>
            <DialogDescription>
              每行：章节 | 题干 | 答案 |
              解析。导入为填空题，之后可逐题改为选择题。
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={8}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="自编练习 | I ___ happy. | am | I 搭配 am。"
          />
          {message && <p className="notice-banner">{message}</p>}
          {store.error && <p className="notice-banner">{store.error}</p>}
          <DialogFooter>
            <Button
              disabled={disabled || !importText.trim()}
              onClick={async () => {
                const rows = importText
                  .split(/\r?\n/)
                  .filter((s) => s.trim())
                  .map((line) => line.split(/\t|\|/).map((s) => s.trim()));
                if (rows.some((r) => !r[0] || !r[1] || !r[2])) {
                  setMessage('每行必须填写章节、题干和答案，未导入任何题目。');
                  return;
                }
                const questions = rows.map(
                  ([chapter, prompt, answer, explanation = '']) => ({
                    ...newGrammar(),
                    chapter,
                    prompt,
                    answer,
                    explanation,
                    type: 'fill' as const,
                    options: [],
                    source: '家长批量录入',
                  }),
                );
                if (
                  await save((d) => ({
                    ...d,
                    grammar: [...d.grammar, ...questions],
                  }))
                ) {
                  setImportOpen(false);
                  setImportText('');
                  setMessage('');
                }
              }}
            >
              导入题目
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

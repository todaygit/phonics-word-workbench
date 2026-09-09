'use client';
/* oxlint-disable react/react-compiler, jsx-a11y/label-has-associated-control */
import { useEffect, useState } from 'react';
import { Sprout, TreeDeciduous, Coins, RefreshCw, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import {
  chinaDay,
  rate,
  sumRows,
  reportPeriods,
  type ActivityMode,
  type ActivityReport,
  TREE_CATALOG,
  TOY_CATALOG,
} from './activity-model';
import { localCheckIn, localForest, localPlant, localReport } from './github-activity';

function useReport(mode: ActivityMode, period: string) {
  const [report, setReport] = useState<ActivityReport | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setReport(null);
    setError('');
    void fetch(
      `/api/activity?mode=${mode}&period=${encodeURIComponent(period)}`,
      { cache: 'no-store', signal: controller.signal },
    )
      .then(async (response) => {
        const data = (await response.json()) as ActivityReport & {
          error?: string;
        };
        if (!response.ok) throw new Error(data.error || '暂时无法读取学习记录。');
        if (!controller.signal.aborted) setReport(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setReport(localReport());
      });
    return () => controller.abort();
  }, [mode, period, retry]);
  return { report, error, reload: () => setRetry((n) => n + 1) };
}
function ReportStatus({
  error,
  reload,
}: {
  error: string;
  reload: () => void;
}) {
  return (
    <output className="notice-banner">
      {error || '正在读取学习记录…'}{' '}
      {error && (
        <Button variant="outline" onClick={reload}>
          重新读取
        </Button>
      )}
    </output>
  );
}

type Forest = {
  earned: number;
  spent: number;
  available: number;
  todayPoints: number;
  checkedInToday: boolean;
  planted: {
    id: string;
    treeId: string;
    treeName: string;
    cost: number;
    plantedAt: number;
  }[];
};
function useForest() {
  const [forest, setForest] = useState<Forest | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setForest(null);
    setError('');
    void (async () => {
      const checkIn = await fetch('/api/activity/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!checkIn.ok && checkIn.status !== 401) localCheckIn();
      const response = await fetch('/api/forest', { cache: 'no-store' });
      const data = (await response.json()) as Forest & { error?: string };
      if (!response.ok) { localCheckIn(); if (active) setForest(localForest()); return; }
      if (active) setForest(data);
    })().catch(() => {
      localCheckIn(); if (active) setForest(localForest());
    });
    return () => {
      active = false;
    };
  }, [retry]);
  return { forest, error, reload: () => setRetry((n) => n + 1) };
}

export function RewardsView() {
  const { forest, error, reload } = useForest();
  const [selected, setSelected] = useState(TREE_CATALOG[0].id);
  const [planting, setPlanting] = useState(false);
  const [message, setMessage] = useState('');
  const [requestId, setRequestId] = useState('');
  if (!forest)
    return (
      <section className="learning-view">
        <h1>积分种树</h1>
        <ReportStatus error={error} reload={reload} />
      </section>
    );
  const target =
    TREE_CATALOG.find((tree) => tree.id === selected) ?? TREE_CATALOG[0];
  const progress = Math.min(100, (forest.available / target.cost) * 100);
  async function plant() {
    if (planting || progress < 100) return;
    setPlanting(true);
    setMessage('');
    const receipt = requestId || crypto.randomUUID();
    setRequestId(receipt);
    try {
      const response = await fetch('/api/forest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ treeId: target.id, requestId: receipt }),
      });
      const body = (await response.json()) as Forest & { error?: string };
      if (!response.ok)
        throw new Error(body.error || '这棵树暂时没有种下，请重试。');
      setRequestId('');
      setMessage(`${target.name}种好啦！它已经住进你的小树林。`);
      reload();
    } catch (reason) {
      try {
        localPlant(target.id);
        setRequestId(''); setMessage(`${target.name}种好啦！它已经住进你的小树林。`); reload();
      } catch (localReason) {
        setMessage(localReason instanceof Error ? localReason.message : reason instanceof Error ? reason.message : '种树失败，请重试。');
      }
    } finally {
      setPlanting(false);
    }
  }
  return (
    <section className="learning-view reward-view">
      <div className="report-heading">
        <div>
          <p className="eyebrow">我的成长花园</p>
          <h1>积分种树</h1>
        </div>
        <Button variant="ghost" onClick={reload}>
          <RefreshCw /> 刷新
        </Button>
      </div>
      <div className="reward-totals reward-wallet">
        <div>
          <Coins />
          <strong>{forest.available}</strong>
          <span>可用积分</span>
        </div>
        <div>
          <Sprout />
          <strong>+{forest.todayPoints}</strong>
          <span>今日获得</span>
        </div>
        <div>
          <TreeDeciduous />
          <strong>{forest.planted.length}</strong>
          <span>已种树木</span>
        </div>
        <div>
          <Check />
          <strong>{forest.checkedInToday ? '+1' : '—'}</strong>
          <span>今日登录</span>
        </div>
      </div>
      <div className="tree-shop-heading">
        <div>
          <h2>选择下一棵树</h2>
          <p>积分越多，可以选择的树越特别。点选一棵作为目标。</p>
        </div>
        <span>
          累计获得 {forest.earned} 分 · 已用于种树 {forest.spent} 分
        </span>
      </div>
      <div className="tree-catalog">
        {TREE_CATALOG.map((tree) => (
          <button
            key={tree.id}
            type="button"
            onClick={() => {
              setSelected(tree.id);
              setRequestId('');
              setMessage('');
            }}
            className={`tree-choice tree-${tree.color} ${selected === tree.id ? 'selected' : ''}`}
            aria-pressed={selected === tree.id}
          >
            <span className="tree-symbol" aria-hidden="true">
              {tree.symbol}
            </span>
            <strong>{tree.name}</strong>
            <small>{tree.note}</small>
            <b>{tree.cost} 积分</b>
            {selected === tree.id && (
              <Check className="tree-selected" aria-label="已选择" />
            )}
          </button>
        ))}
      </div>
      <div className="reward-layout">
        <article className={`growth-panel tree-${target.color}`}>
          <span className="growth-stage">我的目标 · {target.cost} 积分</span>
          <div className="target-tree-symbol" aria-hidden="true">
            {target.symbol}
          </div>
          <h2>{target.name}</h2>
          <p>{target.note}</p>
          <Progress value={progress} aria-label={`${target.name}积分进度`} />
          <div className="growth-progress-label">
            <span>
              {forest.available} / {target.cost} 分
            </span>
            <span>
              {forest.available >= target.cost
                ? '积分够啦，可以兑换'
                : `还差 ${target.cost - forest.available} 分`}
            </span>
          </div>
          <Button
            className="plant-button"
            disabled={planting || forest.available < target.cost}
            onClick={() => void plant()}
          >
            {planting ? '正在兑换…' : `兑换${target.name}`}
          </Button>
          {message && <output className="plant-message">{message}</output>}
        </article>
        <div className="reward-details">
          <div className="reward-totals">
            <div>
              <Coins />
              <strong>+1</strong>
              <span>每天首次登录</span>
            </div>
            <div>
              <Sprout />
              <strong>+1</strong>
              <span>每个学会的词</span>
            </div>
            <div>
              <TreeDeciduous />
              <strong>+1</strong>
              <span>每道答对的题</span>
            </div>
          </div>
          <article className="panel reward-rules">
            <h2>小树怎么长大？</h2>
            <p>
              每天第一次打开工作台自动领取 1
              分；认识一个词、拼对一个词，或答对一道语法题，也可以获得 1 分。
            </p>
            <p>
              同一天，同一个词或题在同一模块里最多得 1
              分。第一次不会，练习后答对也能得分。
            </p>
            <p>
              答错不扣分。选择喜欢的树，积分达到要求后再种下；种树会使用对应积分，已经种好的树永远留在小树林。
            </p>
            <small>这是工作台里的虚拟种树，不涉及真实植树或付费奖励。</small>
          </article>
        </div>
      </div>
      <article className="panel toy-panel">
        <div className="tree-shop-heading">
          <div>
            <h2>积分盲盒玩具</h2>
            <p>累计每满 100 分解锁一个小玩具，未解锁时先猜猜它会是什么。</p>
          </div>
          <span>
            当前已解锁{' '}
            {
              TOY_CATALOG.filter((toy) => forest.earned >= toy.unlockPoints)
                .length
            }{' '}
            / {TOY_CATALOG.length}
          </span>
        </div>
        <div className="toy-catalog">
          {TOY_CATALOG.map((toy, index) => {
            const unlocked = forest.earned >= toy.unlockPoints;
            return (
              <div
                className={`toy-card ${unlocked ? 'unlocked' : 'locked'}`}
                key={toy.id}
              >
                <span className="toy-symbol" aria-hidden="true">
                  {unlocked ? toy.symbol : '🎁'}
                </span>
                <strong>{unlocked ? toy.name : `盲盒 #${index + 1}`}</strong>
                <small>{unlocked ? toy.hint : `猜想：${toy.hint}`}</small>
                <b>{unlocked ? '已解锁' : `${toy.unlockPoints} 分解锁`}</b>
              </div>
            );
          })}
        </div>
      </article>
      <article className="panel forest-panel">
        <div>
          <h2>我的小树林</h2>
          <p>
            {forest.planted.length
              ? `已经种成 ${forest.planted.length} 棵树，继续选择下一棵吧。`
              : '第一棵树长成后，会留在这里。'}
          </p>
        </div>
        <div
          className="forest-icons"
          aria-label={`已种成 ${forest.planted.length} 棵树`}
        >
          {forest.planted.map((planted) => {
            const species = TREE_CATALOG.find(
              (tree) => tree.id === planted.treeId,
            );
            return (
              <div
                className={`forest-tree tree-${species?.color ?? 'mint'}`}
                key={planted.id}
              >
                <span aria-hidden="true">{species?.symbol ?? '🌳'}</span>
                <small>{planted.treeName}</small>
              </div>
            );
          })}
        </div>
      </article>
    </section>
  );
}

export function StatisticsView() {
  const [mode, setMode] = useState<ActivityMode>('day');
  const [month, setMonth] = useState(chinaDay().slice(0, 7));
  const [year, setYear] = useState(chinaDay().slice(0, 4));
  const period = mode === 'day' ? month : year;
  const { report, error, reload } = useReport(mode, period);
  const rows = report?.rows ?? [];
  const learningRows = rows.filter((row) => row.kind !== 'login');
  const recognition = sumRows(rows.filter((r) => r.kind === 'recognition'));
  const spelling = sumRows(rows.filter((r) => r.kind === 'spelling'));
  const grammar = sumRows(rows.filter((r) => r.kind === 'grammar'));
  const periods = report ? reportPeriods(mode, period, rows) : [];
  const chartValues = periods.map(
    (label) => sumRows(rows.filter((row) => row.period === label)).studied,
  );
  const chartMax = Math.max(1, ...chartValues);
  const chartPoints = chartValues
    .map((value, index) => {
      const x =
        chartValues.length <= 1 ? 50 : (index / (chartValues.length - 1)) * 100;
      const y = 94 - (value / chartMax) * 78;
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <section className="learning-view statistics-view">
      <div className="report-heading">
        <div>
          <p className="eyebrow">看见每一次进步</p>
          <h1>学习统计</h1>
        </div>
        <Button variant="ghost" onClick={reload}>
          <RefreshCw /> 刷新
        </Button>
      </div>
      <div className="statistics-controls">
        <Tabs
          value={mode}
          onValueChange={(value) => setMode(value as ActivityMode)}
        >
          <TabsList>
            <TabsTrigger value="day">日度</TabsTrigger>
            <TabsTrigger value="month">月度</TabsTrigger>
            <TabsTrigger value="year">年度</TabsTrigger>
          </TabsList>
        </Tabs>
        {mode === 'day' && (
          <label>
            查看月份
            <Input
              type="month"
              value={month}
              min="2000-01"
              onChange={(e) => setMonth(e.target.value)}
            />
          </label>
        )}
        {mode === 'month' && (
          <label>
            查看年份
            <Input
              type="number"
              min="2000"
              max="9998"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
          </label>
        )}
        {mode === 'year' && <span>按年查看全部已记录历史</span>}
      </div>
      {!report ? (
        <ReportStatus error={error} reload={reload} />
      ) : (
        <>
          <div className="statistics-summary">
            <article>
              <span>认词学习 · 词次</span>
              <strong>{recognition.studied}</strong>
              <small>
                首次记住率 {rate(recognition.firstCorrect, recognition.studied)}
              </small>
            </article>
            <article>
              <span>拼写练习 · 词次</span>
              <strong>{spelling.studied}</strong>
              <small>
                首次正确率 {rate(spelling.firstCorrect, spelling.studied)}
              </small>
            </article>
            <article>
              <span>语法练习 · 题次</span>
              <strong>{grammar.studied}</strong>
              <small>
                首次正确率 {rate(grammar.firstCorrect, grammar.studied)}
              </small>
            </article>
            <article>
              <span>本区间获得积分</span>
              <strong>{sumRows(rows).points}</strong>
              <small>答对一次，积累一点成长</small>
            </article>
          </div>
          <div className="panel progress-chart">
            <div className="progress-chart-heading">
              <div>
                <h2>学习数量变化</h2>
                <p>折线越高，代表这段时间完成的学习越多。</p>
              </div>
              <strong>最高 {chartMax} 个</strong>
            </div>
            <svg
              viewBox="0 0 100 100"
              aria-label="学习数量折线图"
              preserveAspectRatio="none"
            >
              <line x1="0" y1="94" x2="100" y2="94" className="chart-axis" />
              <line
                x1="0"
                y1="55"
                x2="100"
                y2="55"
                className="chart-grid-line"
              />
              <line
                x1="0"
                y1="16"
                x2="100"
                y2="16"
                className="chart-grid-line"
              />
              <polyline points={chartPoints} className="chart-line" />
              {chartValues.map((value, index) => {
                const x =
                  chartValues.length <= 1
                    ? 50
                    : (index / (chartValues.length - 1)) * 100;
                const y = 94 - (value / chartMax) * 78;
                return (
                  <circle
                    key={periods[index]}
                    cx={x}
                    cy={y}
                    r="1.7"
                    className="chart-dot"
                  >
                    <title>
                      {periods[index]}：{value} 个
                    </title>
                  </circle>
                );
              })}
            </svg>
            <div className="chart-labels">
              {periods.map((label, index) => (
                <span
                  key={label}
                  className={
                    index % Math.max(1, Math.ceil(periods.length / 8)) === 0
                      ? ''
                      : 'muted-chart-label'
                  }
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
          {!learningRows.length && (
            <div className="notice-banner">
              这个区间还没有答题记录。每日登录积分已经单独计入积分栏。
            </div>
          )}
          <div className="panel statistics-table">
            <Table>
              <caption>
                学习数量按每天每个词／题去重；同词跨日学习会分别计入词次。记住率按首次回答计算。
              </caption>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    {mode === 'day'
                      ? '日期'
                      : mode === 'month'
                        ? '月份'
                        : '年份'}
                  </TableHead>
                  <TableHead>认词 · 词次</TableHead>
                  <TableHead>首次记住率</TableHead>
                  <TableHead>拼写 · 词次</TableHead>
                  <TableHead>首次正确率</TableHead>
                  <TableHead>语法 · 题次</TableHead>
                  <TableHead>首次正确率</TableHead>
                  <TableHead>积分</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periods.map((label) => {
                  const subset = rows.filter((r) => r.period === label);
                  return (
                    <TableRow key={label}>
                      <TableCell>{label}</TableCell>
                      {(['recognition', 'spelling', 'grammar'] as const).map(
                        (kind) => {
                          const row = sumRows(
                            subset.filter((r) => r.kind === kind),
                          );
                          return (
                            <TableCellPair
                              key={kind}
                              studied={row.studied}
                              correct={row.firstCorrect}
                            />
                          );
                        },
                      )}
                      <TableCell>{sumRows(subset).points}</TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="statistics-total">
                  <TableCell>合计</TableCell>
                  <TableCellPair
                    studied={recognition.studied}
                    correct={recognition.firstCorrect}
                  />
                  <TableCellPair
                    studied={spelling.studied}
                    correct={spelling.firstCorrect}
                  />
                  <TableCellPair
                    studied={grammar.studied}
                    correct={grammar.firstCorrect}
                  />
                  <TableCell>{sumRows(rows).points}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
          <div className="statistics-notes">
            <h2>这些数字代表什么？</h2>
            <p>
              记住率＝当天第一次回答“认识”的词次 ÷
              当天实际学过的词次。拼写、语法同样看第一次作答；它反映当时表现，不代表长期记忆的保证。
            </p>
            <p>
              第一次不会、重学后答对，仍能获得积分，但不会改高当天的首次记住率。月度、年度按题次加权汇总，不直接平均每日百分比。当前区间共作答{' '}
              {sumRows(learningRows).attempts} 次（含重学和重复练习）。
            </p>
            <p>
              按北京时间、服务器收到答案的日期记账。
              {report.startedOn
                ? `本账号记录始于 ${report.startedOn}。`
                : '尚未开始记录。'}
              不补造功能启用前的历史。删词或恢复词库不会删除历史积分与统计；这些记录在云端独立保存。
            </p>
          </div>
        </>
      )}
    </section>
  );
}
function TableCellPair({
  studied,
  correct,
}: {
  studied: number;
  correct: number;
}) {
  return (
    <>
      <TableCell>{studied}</TableCell>
      <TableCell>{rate(correct, studied)}</TableCell>
    </>
  );
}

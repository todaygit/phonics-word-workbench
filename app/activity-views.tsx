'use client';
/* oxlint-disable react/react-compiler, jsx-a11y/label-has-associated-control */
import { useEffect, useState } from 'react';
import {
  Sprout,
  TreePine,
  TreeDeciduous,
  CircleDot,
  Coins,
  RefreshCw,
} from 'lucide-react';
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
  treeProgress,
  sumRows,
  reportPeriods,
  type ActivityMode,
  type ActivityReport,
} from './activity-model';

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
        if (!response.ok)
          throw new Error(data.error || '暂时无法读取学习记录。');
        if (!controller.signal.aborted) setReport(data);
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : '读取失败');
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

export function RewardsView() {
  const { report, error, reload } = useReport('month', chinaDay().slice(0, 4));
  if (!report)
    return (
      <section className="learning-view">
        <h1>积分种树</h1>
        <ReportStatus error={error} reload={reload} />
      </section>
    );
  const tree = treeProgress(report.totalPoints);
  const GrowthIcon =
    tree.growth < 10
      ? CircleDot
      : tree.growth < 35
        ? Sprout
        : tree.growth < 70
          ? TreePine
          : TreeDeciduous;
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
      <div className="reward-layout">
        <article className="growth-panel">
          <span className="growth-stage">
            第 {tree.trees + 1} 棵 · {tree.stage}
          </span>
          <figure className={`growth-indicator growth-${tree.stage}`}>
            <GrowthIcon strokeWidth={1.3} aria-hidden="true" />
            <figcaption className="sr-only">
              第 {tree.trees + 1} 棵树，{tree.stage}阶段，进度 {tree.growth}%
            </figcaption>
          </figure>
          <h2>
            {report.totalPoints
              ? '每一次学会，都让小树成长'
              : '第一颗种子，等你来照顾'}
          </h2>
          <p>
            再积累 <strong>{tree.remaining}</strong> 分，就能长成一棵大树。
          </p>
          <Progress value={tree.growth} aria-label="本棵树成长进度" />
          <div className="growth-progress-label">
            <span>{tree.growth} / 100 分</span>
            <span>满 100 分自动种成</span>
          </div>
          <div className="growth-milestones">
            <span>0 · 种子</span>
            <span>10 · 嫩芽</span>
            <span>35 · 树苗</span>
            <span>70 · 小树</span>
            <span>100 · 成树</span>
          </div>
        </article>
        <div className="reward-details">
          <div className="reward-totals">
            <div>
              <Coins />
              <strong>{report.totalPoints}</strong>
              <span>累计积分</span>
            </div>
            <div>
              <Sprout />
              <strong>+{report.todayPoints}</strong>
              <span>今日积分</span>
            </div>
            <div>
              <TreeDeciduous />
              <strong>{tree.trees}</strong>
              <span>已种成的树</span>
            </div>
          </div>
          <article className="panel reward-rules">
            <h2>小树怎么长大？</h2>
            <p>认识一个词、拼对一个词，或答对一道语法题，可以获得 1 分。</p>
            <p>
              同一天，同一个词或题在同一模块里最多得 1
              分。第一次不会，练习后答对也能得分。
            </p>
            <p>答错不扣分，不学习也不会让树枯萎。明天复习，还可以再得分。</p>
            <small>这是工作台里的虚拟种树，不涉及真实植树或付费奖励。</small>
          </article>
        </div>
      </div>
      <article className="panel forest-panel">
        <div>
          <h2>我的小树林</h2>
          <p>
            {tree.trees
              ? `已经种成 ${tree.trees} 棵树，继续照顾下一棵吧。`
              : '第一棵树长成后，会留在这里。'}
          </p>
        </div>
        <div className="forest-icons" aria-label={`已种成 ${tree.trees} 棵树`}>
          {Array.from({ length: Math.min(tree.trees, 24) }, (_, i) => (
            <TreeDeciduous key={i} aria-hidden="true" />
          ))}
          {tree.trees > 24 && <span>共 {tree.trees} 棵</span>}
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
  const recognition = sumRows(rows.filter((r) => r.kind === 'recognition'));
  const spelling = sumRows(rows.filter((r) => r.kind === 'spelling'));
  const grammar = sumRows(rows.filter((r) => r.kind === 'grammar'));
  const periods = report ? reportPeriods(mode, period, rows) : [];
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
          {!rows.length && (
            <div className="notice-banner">
              这个区间还没有学习记录。完成一次学习后，这里会自动更新。
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
              {sumRows(rows).attempts} 次（含重学和重复练习）。
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

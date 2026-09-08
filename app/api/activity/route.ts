import {
  bindings,
  identity,
  sameOrigin,
  json,
  errorResponse,
} from '../learning/storage';
import {
  activityWord,
  chinaDay,
  reportRange,
  spellingCorrect,
} from '../../activity-model';
import { activityInsert } from './storage';

export async function GET(request: Request) {
  try {
    const user = identity(request);
    const params = new URL(request.url).searchParams;
    const mode = params.get('mode') ?? 'day';
    let range;
    try {
      range = reportRange(mode, params.get('period') ?? chinaDay().slice(0, 7));
    } catch {
      return json({ error: '请选择有效的统计日期。' }, 400);
    }
    const result = await bindings().DB.batch([
      bindings()
        .DB.prepare(`WITH items AS (
        SELECT day, kind, item_key, MIN(id) AS first_id, COUNT(*) AS attempts,
          SUM(correct) AS correct, SUM(points) AS points FROM learning_activity
        WHERE user_id = ? AND day >= ? AND day <= ? GROUP BY day, kind, item_key
      ) SELECT SUBSTR(items.day, 1, ?) AS period, items.kind,
        COUNT(*) AS studied, SUM(first.correct) AS firstCorrect,
        SUM(items.attempts) AS attempts, SUM(items.correct) AS correct, SUM(items.points) AS points
        FROM items JOIN learning_activity AS first ON first.id = items.first_id
        GROUP BY period, items.kind ORDER BY period, items.kind`)
        .bind(user, range.start, range.end, range.size),
      bindings()
        .DB.prepare(`SELECT COALESCE(SUM(points),0) AS totalPoints, MIN(day) AS startedOn,
        COALESCE(SUM(CASE WHEN day = ? THEN points ELSE 0 END),0) AS todayPoints,
        MAX(CASE WHEN day = ? AND kind = 'login' THEN 1 ELSE 0 END) AS checkedInToday
        FROM learning_activity WHERE user_id = ?`)
        .bind(chinaDay(), chinaDay(), user),
    ]);
    const summary = result[1].results[0] as {
      totalPoints: number;
      startedOn: string | null;
      todayPoints: number;
      checkedInToday: number;
    };
    return json({
      rows: result[0].results,
      ...summary,
      checkedInToday: Boolean(summary.checkedInToday),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

// Spelling banks are still device-local. Grade their frozen answer on the server;
// receipts, daily deduplication and all statistics remain server-backed.
export async function POST(request: Request) {
  try {
    const user = identity(request);
    sameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      return json({ error: '请求格式不正确。' }, 415);
    const raw = await request.text();
    if (raw.length > 4000) return json({ error: '答案过长。' }, 413);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: '答案格式不正确。' }, 400);
    }
    if (
      typeof body.eventId !== 'string' ||
      !/^spell:[a-f0-9-]{36}:\d{1,5}$/.test(body.eventId) ||
      typeof body.word !== 'string' ||
      !body.word.trim() ||
      body.word.length > 100 ||
      typeof body.expected !== 'string' ||
      !body.expected.trim() ||
      body.expected.length > 200 ||
      typeof body.answer !== 'string' ||
      !body.answer.trim() ||
      body.answer.length > 200
    )
      return json({ error: '答案格式不正确。' }, 400);
    const event = {
      eventId: body.eventId,
      kind: 'spelling' as const,
      itemKey: activityWord(body.word),
      label: body.word.trim(),
      correct: spellingCorrect(body.answer, body.expected),
    };
    await activityInsert(user, event, Date.now()).run();
    const saved = await bindings()
      .DB.prepare(
        `SELECT points, correct, day, item_key FROM learning_activity WHERE user_id = ? AND event_id = ?`,
      )
      .bind(user, event.eventId)
      .first<{
        points: number;
        correct: number;
        day: string;
        item_key: string;
      }>();
    if (
      !saved ||
      saved.item_key !== event.itemKey ||
      Boolean(saved.correct) !== event.correct
    )
      return json({ error: '这道题已提交过，请重新开始本轮。' }, 409);
    return json({
      points: saved.points,
      correct: Boolean(saved.correct),
      day: saved.day,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

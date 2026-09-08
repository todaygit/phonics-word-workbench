import {
  bindings,
  identity,
  sameOrigin,
  json,
  errorResponse,
} from '../storage';
import {
  answerRecognition,
  gradeGrammar,
  validateLearning,
} from '../../../learning-model';
import { activityWord, chinaDay } from '../../../activity-model';
import {
  activityInsert,
  contentKey,
  type ActivityEvent,
} from '../../activity/storage';

export async function POST(request: Request) {
  try {
    const user = identity(request);
    sameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      return json({ error: '请求格式不正确。' }, 415);
    const raw = await request.text();
    if (raw.length > 3000) return json({ error: '答案过长。' }, 413);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: '答案格式不正确。' }, 400);
    }
    if (
      !Number.isSafeInteger(body.revision) ||
      !Number.isSafeInteger(body.step) ||
      body.step < 0 ||
      !['recognition', 'grammar'].includes(body.kind)
    )
      return json({ error: '答案参数不正确。' }, 400);
    const stored = await bindings()
      .DB.prepare(
        'SELECT revision, payload FROM learning_states WHERE user_id = ?',
      )
      .bind(user)
      .first<{ revision: number; payload: string }>();
    if (!stored || stored.revision !== body.revision)
      return json({ error: '进度已更新，请重新载入后继续。' }, 409);
    const before = validateLearning(JSON.parse(stored.payload));
    const now = Date.now();
    let next = before;
    let event: ActivityEvent;
    if (body.kind === 'recognition') {
      const session = before.session;
      const word = before.words.find(
        (w) => w.id === session?.queue[0] && w.active,
      );
      if (typeof body.known !== 'boolean')
        return json({ error: '请选择认识或不认识。' }, 400);
      if (
        !session ||
        !word ||
        session.id !== body.sessionId ||
        session.step !== body.step
      )
        return json({ error: '这张卡片已更新，请重新载入。' }, 409);
      next = answerRecognition(before, body.known, body.step, now);
      event = {
        eventId: `recognition:${session.id}:${session.step}`,
        kind: 'recognition',
        itemKey: activityWord(word.word),
        label: word.word,
        correct: body.known,
      };
    } else {
      const session = before.grammarSession;
      if (
        typeof body.answer !== 'string' ||
        !body.answer.trim() ||
        body.answer.length > 500
      )
        return json({ error: '请填写有效答案。' }, 400);
      if (
        !session ||
        session.answers.length !== body.step ||
        session.id !== body.sessionId ||
        !session.questions[body.step]
      )
        return json({ error: '本轮题目已更新，请重新载入。' }, 409);
      const question = session.questions[body.step];
      const correct = gradeGrammar(question, body.answer);
      const id = session.id ?? crypto.randomUUID();
      next = {
        ...before,
        grammarSession: {
          ...session,
          id,
          answers: [
            ...session.answers,
            { answer: body.answer.trim(), correct },
          ],
        },
      };
      event = {
        eventId: `grammar:${id}:${body.step}`,
        kind: 'grammar',
        itemKey: await contentKey(
          `${activityWord(question.prompt)}|${activityWord(question.answer)}`,
        ),
        label: question.prompt.slice(0, 200),
        correct,
      };
    }
    const results = await bindings().DB.batch([
      activityInsert(user, event, now, stored.revision),
      bindings()
        .DB.prepare(`UPDATE learning_states SET revision = revision + 1, payload = ?
        WHERE user_id = ? AND revision = ? RETURNING revision`)
        .bind(JSON.stringify(next), user, stored.revision),
    ]);
    const revision = (
      results[1].results[0] as { revision?: number } | undefined
    )?.revision;
    if (!revision)
      return json({ error: '另一个页面更新了进度，请重新载入。' }, 409);
    const award = results[0].results[0] as
      | { points: number; day: string }
      | undefined;
    return json({
      revision,
      data: next,
      award: {
        points: award?.points ?? 0,
        day: award?.day ?? chinaDay(now),
        correct: event.correct,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

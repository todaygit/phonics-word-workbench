import { emptyLearning, validateLearning } from '../../learning-model';
import { bindings, identity, sameOrigin, json, errorResponse } from './storage';

export async function GET(request: Request) {
  try {
    const user = identity(request);
    const row = await bindings()
      .DB.prepare(
        'SELECT revision, payload FROM learning_states WHERE user_id = ?',
      )
      .bind(user)
      .first<{ revision: number; payload: string }>();
    return json({
      revision: row?.revision ?? 0,
      data: row ? JSON.parse(row.payload) : emptyLearning(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PUT(request: Request) {
  try {
    const user = identity(request);
    sameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      return json({ error: '请使用工作台的数据格式。' }, 415);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 1500000)
      return json({ error: '词库过大，请减少例句长度或拆分备份。' }, 413);
    let payload;
    let data;
    try {
      payload = JSON.parse(raw);
      if (!Number.isSafeInteger(payload.revision) || payload.revision < 0)
        throw new Error('revision');
      data = validateLearning(payload.data);
    } catch {
      return json(
        { error: '数据格式不正确，请检查词条、题目和复习间隔。' },
        400,
      );
    }
    const result = await bindings()
      .DB.prepare(`INSERT INTO learning_states (user_id, revision, payload)
      SELECT ?, 1, ? WHERE ? = 0 OR EXISTS (SELECT 1 FROM learning_states WHERE user_id = ?)
      ON CONFLICT(user_id) DO UPDATE SET revision = learning_states.revision + 1, payload = excluded.payload
      WHERE learning_states.revision = ? RETURNING revision`)
      .bind(
        user,
        JSON.stringify(data),
        payload.revision,
        user,
        payload.revision,
      )
      .first<{ revision: number }>();
    if (!result)
      return json(
        {
          error:
            '另一个页面更新了进度。请先重新载入，再进行操作；当前修改未覆盖已有数据。',
        },
        409,
      );
    return json({ revision: result.revision, data });
  } catch (error) {
    return errorResponse(error);
  }
}

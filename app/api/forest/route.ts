import {
  bindings,
  identity,
  sameOrigin,
  json,
  errorResponse,
} from '../learning/storage';
import { TREE_CATALOG, chinaDay, treeSpecies } from '../../activity-model';

async function balances(user: string) {
  const result = await bindings().DB.batch([
    bindings()
      .DB.prepare(
        'SELECT COALESCE(SUM(points),0) AS earned FROM learning_activity WHERE user_id = ?',
      )
      .bind(user),
    bindings()
      .DB.prepare(
        'SELECT COALESCE(SUM(cost),0) AS spent FROM planted_trees WHERE user_id = ?',
      )
      .bind(user),
    bindings()
      .DB.prepare(
        'SELECT id, tree_id AS treeId, tree_name AS treeName, cost, planted_at AS plantedAt FROM planted_trees WHERE user_id = ? ORDER BY planted_at, id',
      )
      .bind(user),
    bindings()
      .DB.prepare(
        "SELECT COALESCE(SUM(CASE WHEN day = ? THEN points ELSE 0 END),0) AS todayPoints, MAX(CASE WHEN day = ? AND kind = 'login' THEN 1 ELSE 0 END) AS checkedInToday FROM learning_activity WHERE user_id = ?",
      )
      .bind(chinaDay(), chinaDay(), user),
  ]);
  const earned = Number(
    (result[0].results[0] as { earned?: number })?.earned ?? 0,
  );
  const spent = Number(
    (result[1].results[0] as { spent?: number })?.spent ?? 0,
  );
  const today = result[3].results[0] as {
    todayPoints?: number;
    checkedInToday?: number;
  };
  return {
    earned,
    spent,
    available: Math.max(0, earned - spent),
    planted: result[2].results,
    todayPoints: Number(today?.todayPoints ?? 0),
    checkedInToday: Boolean(today?.checkedInToday),
  };
}
export async function GET(request: Request) {
  try {
    const user = identity(request);
    return json({ ...(await balances(user)), catalog: TREE_CATALOG });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const user = identity(request);
    sameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      return json({ error: '请求格式不正确。' }, 415);
    let body;
    try {
      body = JSON.parse(await request.text());
    } catch {
      return json({ error: '请选择一棵树。' }, 400);
    }
    const tree =
      typeof body.treeId === 'string' ? treeSpecies(body.treeId) : undefined;
    if (
      !tree ||
      typeof body.requestId !== 'string' ||
      !/^[a-f0-9-]{36}$/.test(body.requestId)
    )
      return json({ error: '请选择有效的树种。' }, 400);
    const id = crypto.randomUUID();
    const inserted = await bindings()
      .DB.prepare(`INSERT INTO planted_trees
      (id,user_id,request_id,tree_id,tree_name,cost,planted_at)
      SELECT ?,?,?,?,?,?,? WHERE
        (SELECT COALESCE(SUM(points),0) FROM learning_activity WHERE user_id = ?) -
        (SELECT COALESCE(SUM(cost),0) FROM planted_trees WHERE user_id = ?) >= ?
      ON CONFLICT(user_id,request_id) DO NOTHING RETURNING id`)
      .bind(
        id,
        user,
        body.requestId,
        tree.id,
        tree.name,
        tree.cost,
        Date.now(),
        user,
        user,
        tree.cost,
      )
      .first<{ id: string }>();
    const existing =
      inserted ??
      (await bindings()
        .DB.prepare(
          'SELECT id FROM planted_trees WHERE user_id = ? AND request_id = ?',
        )
        .bind(user, body.requestId)
        .first<{ id: string }>());
    if (!existing)
      return json({ error: `还差积分，暂时不能种下${tree.name}。` }, 409);
    return json({ ...(await balances(user)), plantedId: existing.id });
  } catch (error) {
    return errorResponse(error);
  }
}

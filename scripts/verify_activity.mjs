import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

// Run the actual route handlers and their prepared SQL against isolated SQLite.
// No local or production account data is changed.
const root = fileURLToPath(new URL('../', import.meta.url));
const sqlite = new DatabaseSync(':memory:');
for (const file of readdirSync(resolve(root, 'drizzle'))
  .filter((f) => f.endsWith('.sql'))
  .sort())
  sqlite.exec(readFileSync(resolve(root, 'drizzle', file), 'utf8'));
let failUpdate = false;
class Statement {
  constructor(sql, args = []) {
    this.sql = sql;
    this.args = args;
  }
  bind(...args) {
    return new Statement(this.sql, args);
  }
  execute() {
    if (failUpdate && this.sql.startsWith('UPDATE learning_states'))
      throw new Error('injected transaction failure');
    const results = sqlite
      .prepare(this.sql)
      .all(...this.args)
      .map((r) => ({ ...r }));
    return { success: true, results };
  }
  async first() {
    return this.execute().results[0] ?? null;
  }
  async all() {
    return this.execute();
  }
  async run() {
    return this.execute();
  }
}
globalThis.__activityTestEnv = {
  DB: {
    prepare: (sql) => new Statement(sql),
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = statements.map((s) => s.execute());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  },
  MEDIA: {},
};
const modules = new Map();
const dataUrl = (code) =>
  `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
async function moduleUrl(path) {
  if (modules.has(path)) return modules.get(path);
  let code = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const imports = [...code.matchAll(/from\s+['"]([^'"]+)['"]/g)];
  for (const match of imports) {
    const spec = match[1];
    if (spec === 'cloudflare:workers')
      code = code.replace(
        `'${spec}'`,
        JSON.stringify(
          dataUrl('export const env = globalThis.__activityTestEnv;'),
        ),
      );
    else if (spec.startsWith('.'))
      code = code.replace(
        `'${spec}'`,
        JSON.stringify(await moduleUrl(resolve(dirname(path), `${spec}.ts`))),
      );
  }
  const url = dataUrl(code);
  modules.set(path, url);
  return url;
}
const model = await import(
  await moduleUrl(resolve(root, 'app/activity-model.ts'))
);
const learning = await import(
  await moduleUrl(resolve(root, 'app/learning-model.ts'))
);
const parentLock = await import(
  await moduleUrl(resolve(root, 'app/parent-lock.ts'))
);
const activity = await import(
  await moduleUrl(resolve(root, 'app/api/activity/route.ts'))
);
const answers = await import(
  await moduleUrl(resolve(root, 'app/api/learning/answer/route.ts'))
);
const checkIn = await import(
  await moduleUrl(resolve(root, 'app/api/activity/check-in/route.ts'))
);
const forest = await import(
  await moduleUrl(resolve(root, 'app/api/forest/route.ts'))
);
const learningRoute = await import(
  await moduleUrl(resolve(root, 'app/api/learning/route.ts'))
);
let count = 0;
async function test(name, fn) {
  await fn();
  count++;
  console.log(`PASS ${name}`);
}
const base = 'https://workbench.test';
function req(path, body, user = 'child-a', origin = base) {
  const headers = { 'Content-Type': 'application/json', Origin: origin };
  if (user) headers['oai-authenticated-user-id'] = user;
  return new Request(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
function deleteReq(path, body, user = 'child-a', origin = base) {
  return new Request(base + path, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
      'oai-authenticated-user-id': user,
    },
    body: JSON.stringify(body),
  });
}
function spell(
  word,
  answer = word,
  eventId = `spell:${crypto.randomUUID()}:0`,
) {
  return { word, answer, expected: word, eventId };
}
async function postSpell(input, user) {
  const response = await activity.POST(req('/api/activity', input, user));
  assert.equal(response.status, 200);
  return response.json();
}
async function report(mode = 'day', period = '2026-09', user) {
  const response = await activity.GET(
    req(`/api/activity?mode=${mode}&period=${period}`, undefined, user),
  );
  assert.equal(response.status, 200);
  return response.json();
}
function saveLearning(data, user = 'child-a', revision = 1) {
  sqlite
    .prepare(
      'INSERT INTO learning_states VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload',
    )
    .run(user, revision, JSON.stringify(data));
}
function current(user = 'child-a') {
  const row = sqlite
    .prepare('SELECT * FROM learning_states WHERE user_id=?')
    .get(user);
  return { revision: row.revision, data: JSON.parse(row.payload) };
}
const originalNow = Date.now;
let clock = Date.parse('2026-09-08T04:00:00Z');
Date.now = () => clock;
try {
  await test('empty history has no invented scores or 0% memory rate', async () => {
    assert.deepEqual(await report(), {
      rows: [],
      totalPoints: 0,
      startedOn: null,
      todayPoints: 0,
      checkedInToday: false,
    });
    assert.equal(model.rate(0, 0), '—');
  });
  await test('parent settings accept only the requested four-digit PIN', async () => {
    assert.equal(parentLock.validParentPin('1111'), true);
    for (const value of ['111', '01111', '1112', '', ' 1111 '])
      assert.equal(parentLock.validParentPin(value), false);
  });
  await test('API requires identity, rejects cross-origin writes and invalid dates', async () => {
    assert.equal(
      (await activity.GET(req('/api/activity', undefined, ''))).status,
      401,
    );
    assert.equal(
      (await activity.POST(req('/api/activity', spell('cat'), ''))).status,
      401,
    );
    assert.equal(
      (await answers.POST(req('/api/learning/answer', {}, ''))).status,
      401,
    );
    assert.equal(
      (
        await activity.POST(
          req('/api/activity', spell('cat'), 'child-a', 'https://other.test'),
        )
      ).status,
      403,
    );
    assert.equal(
      (await activity.GET(req('/api/activity?mode=day&period=2026-13'))).status,
      400,
    );
  });
  const retry = spell('cat');
  await test('same spelling receipt can be retried without duplicate attempt or point', async () => {
    assert.equal((await postSpell(retry)).points, 1);
    assert.equal((await postSpell(retry)).points, 1);
    const data = await report();
    assert.equal(data.totalPoints, 1);
    assert.equal(data.rows[0].attempts, 1);
  });
  await test('repeat same word today is practice, not another point or first attempt', async () => {
    assert.equal((await postSpell(spell(' CAT '))).points, 0);
    const row = (await report()).rows[0];
    assert.equal(row.attempts, 2);
    assert.equal(row.studied, 1);
  });
  await test('wrong then correct earns one point but first correctness stays wrong', async () => {
    assert.equal((await postSpell(spell('dog', 'dig'))).points, 0);
    assert.equal((await postSpell(spell('dog'))).points, 1);
    const row = (await report()).rows[0];
    assert.equal(row.studied, 2);
    assert.equal(row.firstCorrect, 1);
    assert.equal(row.points, 2);
    assert.equal(model.spellingCorrect('c1at', 'cat'), false);
  });
  let recognition = learning.emptyLearning();
  recognition.words = [
    learning.newRecognition({
      id: 'card-cat',
      word: 'cat',
      meaning: '猫',
      learnedOn: '2026-09-08',
    }),
  ];
  recognition = learning.startRecognition(recognition, clock);
  saveLearning(recognition);
  const first = {
    kind: 'recognition',
    sessionId: recognition.session.id,
    step: 0,
    known: false,
    revision: 1,
  };
  await test('recognition answer and ledger commit together; repeat request is rejected', async () => {
    const response = await answers.POST(req('/api/learning/answer', first));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.award.points, 0);
    assert.equal(body.data.session.queue.length, 1);
    assert.equal(
      (await answers.POST(req('/api/learning/answer', first))).status,
      409,
    );
  });
  await test('recognition relearning award stays separate from spelling award', async () => {
    const state = current();
    const response = await answers.POST(
      req('/api/learning/answer', {
        kind: 'recognition',
        sessionId: state.data.session.id,
        step: 1,
        known: true,
        revision: state.revision,
      }),
    );
    assert.equal(response.status, 200);
    assert.equal((await response.json()).award.points, 1);
    const row = (await report()).rows.find((r) => r.kind === 'recognition');
    assert.equal(row.firstCorrect, 0);
    assert.equal(row.attempts, 2);
    assert.equal(row.studied, 1);
  });
  await test('injected storage failure rolls back both learning and reward', async () => {
    const state = current();
    state.data.grammarSession = {
      id: crypto.randomUUID(),
      questions: [learning.exampleGrammar[0]],
      answers: [],
    };
    saveLearning(state.data, 'child-a', state.revision);
    failUpdate = true;
    assert.equal(
      (
        await answers.POST(
          req('/api/learning/answer', {
            kind: 'grammar',
            sessionId: state.data.grammarSession.id,
            step: 0,
            answer: 'a',
            revision: state.revision,
          }),
        )
      ).status,
      500,
    );
    failUpdate = false;
    assert.equal(current().data.grammarSession.answers.length, 0);
    assert.equal(
      (await report()).rows.some((r) => r.kind === 'grammar'),
      false,
    );
  });
  await test('concurrent grammar submissions advance only once and score once', async () => {
    const state = current();
    const body = {
      kind: 'grammar',
      sessionId: state.data.grammarSession.id,
      step: 0,
      answer: 'a',
      revision: state.revision,
    };
    const results = await Promise.all([
      answers.POST(req('/api/learning/answer', body)),
      answers.POST(req('/api/learning/answer', body)),
    ]);
    assert.deepEqual(
      results.map((r) => r.status).sort((a, b) => a - b),
      [200, 409],
    );
    assert.equal(
      (await report()).rows.find((r) => r.kind === 'grammar').points,
      1,
    );
  });
  await test('deleting a word or restoring a learning backup does not alter the ledger', async () => {
    const before = await report();
    const state = current();
    const r = await learningRoute.PUT(
      new Request(base + '/api/learning', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'oai-authenticated-user-id': 'child-a',
          Origin: base,
        },
        body: JSON.stringify({
          revision: state.revision,
          data: learning.emptyLearning(),
        }),
      }),
    );
    assert.equal(r.status, 200);
    assert.deepEqual(await report(), before);
  });
  await test('China midnight grants next-day point; old receipt keeps its original day', async () => {
    clock = Date.parse('2026-09-08T16:00:00Z');
    assert.equal(model.chinaDay(clock), '2026-09-09');
    assert.equal((await postSpell(retry)).day, '2026-09-08');
    assert.equal((await postSpell(spell('cat'))).points, 1);
    assert.equal((await report()).todayPoints, 1);
  });
  await test('monthly rate uses weighted first attempts and preserves repeated daily study', async () => {
    const month = (await report('month', '2026')).rows.find(
      (r) => r.kind === 'spelling',
    );
    assert.equal(month.studied, 3);
    assert.equal(month.firstCorrect, 2);
    assert.equal(model.rate(month.firstCorrect, month.studied), '66.7%');
  });
  await test('year change keeps lifetime trees and separates annual rows', async () => {
    clock = Date.parse('2026-12-31T16:00:00Z');
    await postSpell(spell('cat'));
    const years = await report('year', '');
    assert.deepEqual(
      [...new Set(years.rows.map((r) => r.period))],
      ['2026', '2027'],
    );
    assert.equal(years.totalPoints, 6);
    assert.equal(years.todayPoints, 1);
  });
  await test('accounts are isolated and public inputs cannot choose points', async () => {
    assert.equal((await report('year', '', 'child-b')).totalPoints, 0);
    assert.equal(
      (await postSpell({ ...spell('cat'), points: 999 }, 'child-b')).points,
      1,
    );
    assert.equal((await report('year', '', 'child-a')).totalPoints, 6);
  });
  await test('daily login awards exactly once per China day', async () => {
    const request = () => req('/api/activity/check-in', {}, 'child-c');
    let response = await checkIn.POST(request());
    assert.equal(response.status, 200);
    assert.equal((await response.json()).points, 1);
    response = await checkIn.POST(request());
    assert.equal((await response.json()).points, 1);
    const data = await report('year', '', 'child-c');
    assert.equal(data.totalPoints, 1);
    assert.equal(data.checkedInToday, true);
  });
  await test('tree catalog spans 50 to 5000 points and toy unlocks every 100', async () => {
    assert.equal(model.TREE_CATALOG.length, 10);
    assert.equal(Math.min(...model.TREE_CATALOG.map((tree) => tree.cost)), 50);
    assert.equal(
      Math.max(...model.TREE_CATALOG.map((tree) => tree.cost)),
      5000,
    );
    assert.equal(new Set(model.TREE_CATALOG.map((tree) => tree.id)).size, 10);
    assert.equal(model.TOY_CATALOG.length, 10);
    assert.deepEqual(
      model.TOY_CATALOG.map((toy) => toy.unlockPoints),
      [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000],
    );
  });
  await test('planting spends available points and request retry is idempotent', async () => {
    for (let i = 0; i < 50; i++) await postSpell(spell(`seed ${i}`), 'child-c');
    const requestId = crypto.randomUUID();
    const body = { treeId: 'sprout', requestId };
    const plantRequest = () => req('/api/forest', body, 'child-c');
    let response = await forest.POST(plantRequest());
    assert.equal(response.status, 200);
    let data = await response.json();
    assert.equal(data.available, 1);
    assert.equal(data.planted.length, 1);
    response = await forest.POST(plantRequest());
    assert.equal(response.status, 200);
    data = await response.json();
    assert.equal(data.planted.length, 1);
    assert.equal(data.available, 1);
  });
  await test('cannot plant an unaffordable or unknown tree', async () => {
    let response = await forest.POST(
      req(
        '/api/forest',
        { treeId: 'wonder', requestId: crypto.randomUUID() },
        'child-c',
      ),
    );
    assert.equal(response.status, 409);
    response = await forest.POST(
      req(
        '/api/forest',
        { treeId: 'not-real', requestId: crypto.randomUUID() },
        'child-c',
      ),
    );
    assert.equal(response.status, 400);
  });
  await test('tree boundaries 99, 100, 101, 199 and 200 are stable', async () => {
    for (const n of [0, 99, 100, 101, 199, 200]) {
      const p = model.treeProgress(n);
      assert.equal(p.trees, Math.floor(n / 100));
      assert.equal(p.growth, n % 100);
    }
    assert.equal(model.reportPeriods('day', '2028-02', []).length, 29);
    assert.equal(model.reportPeriods('month', '2026', []).length, 12);
  });
  await test('parent PIN can clear spelling records while keeping the word bank and trees', async () => {
    let response = await activity.DELETE(
      deleteReq('/api/activity', { scope: 'all', pin: '0000' }, 'child-b'),
    );
    assert.equal(response.status, 403);
    response = await activity.DELETE(
      deleteReq('/api/activity', { scope: 'all', pin: '1111' }, 'child-b'),
    );
    assert.equal(response.status, 200);
    assert.equal(typeof (await response.json()).deleted, 'number');
    assert.equal((await report('year', '', 'child-b')).totalPoints, 0);
  });
  console.log(
    `Verified ${count} activity, atomic scoring, history and statistics checks.`,
  );
} finally {
  Date.now = originalNow;
  sqlite.close();
  delete globalThis.__activityTestEnv;
}

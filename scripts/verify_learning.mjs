import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(
  new URL('../app/learning-model.ts', import.meta.url),
  'utf8',
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const {
  emptyLearning,
  newRecognition,
  startRecognition,
  answerRecognition,
  learningStats,
  validateLearning,
  dateKey,
  exampleGrammar,
  gradeGrammar,
} = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);
let count = 0;
function test(name, fn) {
  fn();
  count++;
  console.log(`PASS ${name}`);
}
const now = Date.parse('2026-09-08T01:00:00Z');
const make = (word, more = {}) =>
  newRecognition({
    word,
    meaning: '测试词义',
    learnedOn: '2026-09-08',
    ...more,
  });
function seed() {
  return {
    ...emptyLearning(),
    words: [make('cat'), make('dog'), make('sun'), make('hat')],
  };
}

test('empty state is valid; no spelling words auto-enrolled', () => {
  assert.deepEqual(validateLearning(emptyLearning()).words, []);
});
test('new and review budgets are independent', () => {
  const data = seed();
  data.plan.newLimit = 1;
  data.plan.reviewLimit = 1;
  data.words[0].seen = 1;
  data.words[1].seen = 1;
  const next = startRecognition(data, now);
  assert.equal(next.session.queue.length, 2);
  assert.equal(next.days[dateKey(now)].newIds.length, 1);
  assert.equal(next.days[dateKey(now)].reviewIds.length, 1);
});
test('unknown words reappear after two other cards, without duplicate or extra quota', () => {
  const start = startRecognition(seed(), now);
  const id = start.session.queue[0];
  const next = answerRecognition(start, false, 0, now);
  assert.equal(next.session.queue[2], id);
  assert.equal(next.session.queue.length, 4);
  assert.equal(next.words[0].due, now);
  assert.equal(next.words[0].stage, 0);
  assert.deepEqual(
    next.days[dateKey(now)].newIds,
    start.days[dateKey(now)].newIds,
  );
});
test('last unknown word cannot finish the round', () => {
  const data = seed();
  data.words = data.words.slice(0, 1);
  let round = startRecognition(data, now);
  round = answerRecognition(round, false, 0, now);
  assert.equal(round.session.queue.length, 1);
  assert.equal(round.session.completed.length, 0);
  round = answerRecognition(round, true, 1, now);
  assert.equal(round.session.queue.length, 0);
  assert.equal(round.session.completed.length, 1);
  assert.equal(round.words[0].due, now + 10 * 60000);
});
test('same card response is idempotent', () => {
  const first = answerRecognition(startRecognition(seed(), now), true, 0, now);
  assert.equal(answerRecognition(first, false, 0, now), first);
});
test('round trip backup preserves queue order, stage, quota, and due date', () => {
  const round = answerRecognition(startRecognition(seed(), now), false, 0, now);
  assert.deepEqual(validateLearning(JSON.parse(JSON.stringify(round))), round);
});
test('daily caps cannot be bypassed by restarting; due same-day words do not double-count', () => {
  const data = seed();
  data.plan.newLimit = 1;
  let round = startRecognition(data, now);
  round = answerRecognition(round, true, 0, now);
  assert.equal(learningStats(round, now).fresh.length, 0);
  assert.equal(startRecognition(round, now).session, null);
  round = startRecognition(round, now + 600001);
  assert.equal(round.session.queue.length, 1);
  assert.equal(round.days[dateKey(now)].newIds.length, 1);
  assert.equal(round.days[dateKey(now)].reviewIds.length, 0);
});
test('zero limits permit pending session, no new admissions', () => {
  let data = startRecognition(seed(), now);
  data.plan.newLimit = 0;
  data.plan.reviewLimit = 0;
  assert.deepEqual(
    startRecognition(data, now).session.queue,
    data.session.queue,
  );
  data = seed();
  data.plan.newLimit = 0;
  data.plan.reviewLimit = 0;
  assert.equal(startRecognition(data, now).session, null);
});
test('cross-day continuation retains original enrolment; actual answer time schedules review', () => {
  const data = startRecognition(seed(), now);
  const later = now + 86400000;
  assert.deepEqual(
    startRecognition(data, later).session.queue,
    data.session.queue,
  );
  const next = answerRecognition(data, true, 0, later);
  assert.equal(next.words[0].due, later + 600000);
  assert.deepEqual(next.days[dateKey(later)].newIds, []);
});
test('disabled and future-dated words are excluded', () => {
  const data = seed();
  data.words[0].active = false;
  data.words[1].learnedOn = '2026-09-10';
  assert.equal(startRecognition(data, now).session.queue.length, 2);
});
test('invalid imported images, dates, intervals, duplicate IDs and choices are rejected', () => {
  for (const change of [
    (d) => (d.words[0].image = 'javascript:alert(1)'),
    (d) => (d.words[0].learnedOn = '2026-02-31'),
    (d) => (d.plan.intervals = [2, 1]),
    (d) => d.words.push(d.words[0]),
    (d) => d.grammar.push({ ...exampleGrammar[0], answer: 'wrong' }),
  ]) {
    const data = seed();
    change(data);
    assert.throws(() => validateLearning(data));
  }
});
test('grammar accepts normalised answers and remains independent from recognition', () => {
  assert.equal(gradeGrammar(exampleGrammar[0], ' A '), true);
  assert.equal(
    gradeGrammar({ ...exampleGrammar[0], answer: "is not|isn't" }, "ISN'T"),
    true,
  );
  const data = seed();
  data.grammar = exampleGrammar;
  data.grammarSession = {
    questions: exampleGrammar.slice(0, 1),
    answers: [{ answer: 'an', correct: true }],
  };
  const result = validateLearning(data);
  assert.equal(result.grammarSession.answers[0].correct, false);
  assert.deepEqual(result.words, data.words);
  assert.equal(result.session, null);
});
console.log(`Verified ${count} learning and grammar checks.`);

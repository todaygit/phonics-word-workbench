import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bank = JSON.parse(
  readFileSync(new URL('../app/word-bank-v19.json', import.meta.url), 'utf8'),
);

assert.equal(bank.version, 'v1.9');
assert.equal(bank.chapters.length, 75);
assert.equal(bank.words.length, 2490);
assert.equal(
  new Set(bank.words.map((word) => word.id)).size,
  bank.words.length,
);
assert.equal(bank.chapters[0].title, '1.1 short a：a 的短音');
assert.equal(bank.words[0].word, 'cat');
assert.equal(bank.words[0].meaning, '猫');

for (const chapter of bank.chapters) {
  const chapterWords = bank.words.filter(
    (word) => word.chapterId === chapter.id,
  );
  assert.equal(
    chapterWords.length,
    chapter.wordCount,
    `${chapter.title} word count`,
  );
  assert.ok(chapter.rule.trim(), `${chapter.title} rule`);
  assert.ok(chapter.childNote.trim(), `${chapter.title} child note`);
}

for (const word of bank.words) {
  assert.ok(word.word.trim(), `${word.id} word`);
  assert.ok(word.ipa.trim(), `${word.id} ipa`);
  assert.ok(word.phonics.trim(), `${word.id} phonics`);
  assert.ok(word.example.trim(), `${word.id} example`);
  assert.ok(
    word.meaning.trim() && word.meaning !== '待补充',
    `${word.id} meaning`,
  );
  assert.match(word.meaning, /[\u3400-\u9fff]/, `${word.id} Chinese meaning`);
}

console.log(
  'Verified v1.9: 75 chapters, 2,490 complete word rows, no missing Chinese meanings.',
);

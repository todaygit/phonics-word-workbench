import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(
  new URL('../app/word-resources.ts', import.meta.url),
  'utf8',
);
const code = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const {
  parseDictionary,
  selectAudio,
  parseCommons,
  normalizeWord,
  approvedAudio,
  approvedImage,
} = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
);
let count = 0;
function test(name, fn) {
  fn();
  count++;
  console.log(`PASS ${name}`);
}
const raw = [
  {
    word: 'read',
    phonetic: '/ɹiːd/',
    phonetics: [
      {
        text: '/ɹiːd/',
        audio:
          'https://api.dictionaryapi.dev/media/pronunciations/en/read-1-uk.mp3',
        sourceUrl: 'https://commons.wikimedia.org/w/index.php?curid=9028720',
        license: {
          name: 'BY 3.0 US',
          url: 'https://creativecommons.org/licenses/by/3.0/us',
        },
      },
      {
        text: '/ɹid/',
        audio:
          'https://api.dictionaryapi.dev/media/pronunciations/en/read-1-us.ogg',
      },
    ],
    sourceUrls: ['https://en.wiktionary.org/wiki/read'],
    license: {
      name: 'CC BY-SA 3.0',
      url: 'https://creativecommons.org/licenses/by-sa/3.0',
    },
    meanings: [
      {
        partOfSpeech: 'verb',
        definitions: [
          {
            definition: 'Look at written text.',
            example: 'Have you read this book?',
          },
          {
            definition: 'vulgar slang',
            example: 'This is an unsuitable example.',
          },
        ],
      },
    ],
  },
  {
    word: 'read',
    phonetic: '/ɹɛd/',
    phonetics: [
      {
        text: '/ɹɛd/',
        audio:
          'https://api.dictionaryapi.dev/media/pronunciations/en/read-2-us.mp3',
      },
    ],
  },
];
test('retain different readings and do not inherit the text licence for audio', () => {
  const data = parseDictionary(raw, 'read');
  assert.equal(data.clips.length, 3);
  assert.equal(data.clips[2].license, '');
  assert.equal(data.clips[2].entry, 1);
});
test('match IPA before default accent, or require choice for ambiguous word', () => {
  const clips = parseDictionary(raw, 'read').clips;
  assert.equal(
    selectAudio(clips, '', '/riːd/').clip.url.includes('read-1'),
    true,
  );
  assert.equal(selectAudio(clips).ambiguous, true);
  assert.equal(selectAudio(clips, clips[2].url).clip.url, clips[2].url);
  assert.equal(selectAudio(clips, '', '/red/').ambiguous, true);
});
test('filter known inappropriate examples and preserve source attribution', () => {
  const examples = parseDictionary(raw, 'read').examples;
  assert.equal(examples.length, 1);
  assert.equal(examples[0].sourceUrl, 'https://en.wiktionary.org/wiki/read');
});
test('do not assume every phonetic has audio or every definition an example', () => {
  const result = parseDictionary(
    [
      {
        word: 'cat',
        phonetics: [{ text: '/kæt/' }],
        meanings: [{ definitions: [{ definition: 'A domestic animal.' }] }],
      },
    ],
    'cat',
  );
  assert.equal(result.clips.length, 0);
  assert.equal(result.examples.length, 0);
});
test('reject unsafe media URLs and unexpected headword', () => {
  assert.equal(approvedAudio('https://evil.invalid/a.mp3'), false);
  assert.equal(
    approvedAudio(
      'https://api.dictionaryapi.dev.evil.invalid/media/pronunciations/en/cat.mp3',
    ),
    false,
  );
  assert.equal(approvedImage('javascript:alert(1)'), false);
  assert.equal(
    approvedImage('https://upload.wikimedia.org/wikipedia/commons/a.svg'),
    false,
  );
  assert.equal(parseDictionary(raw, 'cat').clips.length, 0);
  assert.equal(normalizeWord('../private'), '');
});
test('Commons thumbnail and authorship are preserved as safe plain text', () => {
  const images = parseCommons({
    query: {
      pages: [
        {
          title: 'File:Cat.jpg',
          imageinfo: [
            {
              thumburl:
                'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Cat.jpg/640px-Cat.jpg',
              descriptionurl: 'https://commons.wikimedia.org/wiki/File:Cat.jpg',
              extmetadata: {
                Artist: { value: '<a>Author</a>' },
                LicenseShortName: { value: 'CC BY-SA 3.0' },
                LicenseUrl: {
                  value: 'https://creativecommons.org/licenses/by-sa/3.0',
                },
              },
            },
          ],
        },
      ],
    },
  });
  assert.equal(images.length, 1);
  assert.equal(images[0].author, 'Author');
  assert.equal(images[0].license, 'CC BY-SA 3.0');
});
console.log(`Verified ${count} resource matching checks.`);

test('phrase recordings never become isolated-word spelling cues', () => {
  const clips = parseDictionary(raw, 'read').clips;
  clips[0].phrase = 'to read';
  assert.notEqual(
    selectAudio(clips, clips[0].url, '/riːd/').clip.url,
    clips[0].url,
  );
  assert.equal(selectAudio([clips[0]]).clip, undefined);
});

const resourceUrl = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
function moduleSource(path) {
  return ts.transpileModule(
    readFileSync(new URL(path, import.meta.url), 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.ES2022,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
}
const downloadCode = moduleSource(
  '../app/api/word-resources/audio/download.ts',
).replace("'../../../word-resources'", JSON.stringify(resourceUrl));
const { downloadRecording } = await import(
  `data:text/javascript;base64,${Buffer.from(downloadCode).toString('base64')}`
);
const { applyVerifiedAudio } = await import(
  `data:text/javascript;base64,${Buffer.from(moduleSource('../app/api/word-resources/verified-audio.ts')).toString('base64')}`
);
test('verified source metadata identifies phrase and original recording', () => {
  const clip = parseDictionary(raw, 'read').clips[0];
  assert.equal(applyVerifiedAudio(clip), true);
  assert.equal(clip.phrase, 'to read');
  assert.ok(clip.originalUrl.startsWith('https://upload.wikimedia.org/'));
});
const originalUrl =
  'https://upload.wikimedia.org/wikipedia/commons/4/46/En-us-cat.ogg';
const fixture = () => ({
  url: 'https://api.dictionaryapi.dev/media/pronunciations/en/cat-us.mp3',
  ipa: '/kæt/',
  accent: 'us',
  entry: 0,
  sourceUrl: '',
  author: '',
  license: '',
  licenseUrl: '',
});
const validAudio = () =>
  new Response(new Uint8Array([79, 103, 103, 83, 0, 1]), {
    headers: { 'Content-Type': 'application/ogg' },
  });
for (const failure of ['status', 'timeout']) {
  const urls = [];
  const result = await downloadRecording(
    fixture(),
    async (clip) => {
      clip.originalUrl = originalUrl;
    },
    async (url) => {
      urls.push(url);
      if (url === originalUrl) return validAudio();
      if (failure === 'timeout')
        throw new DOMException('timeout', 'TimeoutError');
      return new Response('', { status: 522 });
    },
  );
  assert.equal(result.bytes.byteLength, 6);
  assert.equal(result.type, 'application/ogg');
  assert.equal(urls.length, 2);
  count++;
  console.log(`PASS audio ${failure} falls back to original recording`);
}
await assert.rejects(
  downloadRecording(
    fixture(),
    async () => {},
    async (url) => {
      assert.notEqual(new URL(url).hostname, 'evil.invalid');
      return new Response('', {
        status: 302,
        headers: { Location: 'https://evil.invalid/private.mp3' },
      });
    },
  ),
);
count++;
console.log('PASS redirect cannot escape approved audio origins');
await assert.rejects(
  downloadRecording(
    fixture(),
    async () => {},
    async () =>
      new Response(new Uint8Array(2000001), {
        headers: { 'Content-Type': 'audio/mpeg' },
      }),
  ),
);
count++;
console.log('PASS oversized stream is rejected even without content-length');
await assert.rejects(
  downloadRecording(
    { ...fixture(), phrase: 'a cat' },
    async () => {},
    async () => {
      assert.fail('phrase must not be fetched');
    },
  ),
);
count++;
console.log('PASS phrase audio cannot bypass the server guard');
console.log(`Verified ${count} resource matching and audio checks.`);

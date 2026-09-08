export type AudioClip = {
  url: string;
  originalUrl?: string;
  phrase?: string;
  ipa: string;
  accent: string;
  entry: number;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
  author: string;
};
export type ExampleCandidate = {
  text: string;
  definition: string;
  partOfSpeech: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
};
export type ImageCandidate = {
  url: string;
  title: string;
  sourceUrl: string;
  author: string;
  license: string;
  licenseUrl: string;
};
export type WordResources = {
  word: string;
  clips: AudioClip[];
  examples: ExampleCandidate[];
  images: ImageCandidate[];
  notices: string[];
  fetchedAt: number;
};

export function normalizeWord(value: string) {
  const word = value.trim().toLowerCase().replace(/\s+/g, ' ');
  return /^[a-z][a-z '-]{0,69}$/.test(word) ? word : '';
}
export function approvedAudio(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      ((url.hostname === 'api.dictionaryapi.dev' &&
        url.pathname.startsWith('/media/pronunciations/en/')) ||
        (url.hostname === 'upload.wikimedia.org' &&
          url.pathname.startsWith('/wikipedia/commons/'))) &&
      /\.(mp3|ogg|wav)$/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}
export function approvedImage(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      ['upload.wikimedia.org', 'thumb.wikimedia.org'].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      url.pathname.startsWith('/wikipedia/commons/') &&
      /\.(png|jpe?g|webp)$/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}
export function safeSource(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      [
        'commons.wikimedia.org',
        'en.wiktionary.org',
        'creativecommons.org',
        'dictionaryapi.dev',
      ].includes(url.hostname)
      ? url.href
      : '';
  } catch {
    return '';
  }
}
function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
export function plainText(value: unknown) {
  return text(value)
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
    .slice(0, 1200);
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}
function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
const unsuitable =
  /\b(sex(?:ual)?|porn|penis|vagina|vulva|fuck|shit|bitch|cocaine|heroin|prostitut\w*|slang|vulgar|offensive|derogatory)\b/i;
export function parseDictionary(raw: unknown, word: string): WordResources {
  const clips: AudioClip[] = [];
  const examples: ExampleCandidate[] = [];
  const containsWord = new RegExp(
    `\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
    'i',
  );
  list(raw)
    .slice(0, 12)
    .forEach((value, entry) => {
      const row = record(value);
      // Avoid silently accepting another headword from upstream.
      if (normalizeWord(text(row.word)) !== word) return;
      const sourceUrl = safeSource(text(list(row.sourceUrls)[0]));
      const license = record(row.license);
      for (const item of list(row.phonetics)) {
        const p = record(item);
        const url = text(p.audio);
        const attribution = record(p.license);
        if (!approvedAudio(url) || clips.some((c) => c.url === url)) continue;
        const marker = new URL(url).pathname
          .match(/-(us|uk|au|ca)(?:\.|-)/i)?.[1]
          ?.toLowerCase();
        clips.push({
          url,
          ipa: text(p.text ?? row.phonetic).slice(0, 150),
          accent: marker ?? 'unknown',
          entry,
          sourceUrl: safeSource(text(p.sourceUrl)),
          license: text(attribution.name).slice(0, 100),
          licenseUrl: safeSource(text(attribution.url)),
          author: '',
        });
      }
      for (const meaning of list(row.meanings)) {
        const part = record(meaning);
        for (const def of list(part.definitions)) {
          const d = record(def);
          const text = plainText(d.example);
          const definition = plainText(d.definition);
          if (
            !text ||
            !containsWord.test(text) ||
            text.length > 180 ||
            unsuitable.test(`${text} ${definition}`) ||
            !sourceUrl ||
            examples.some((e) => e.text === text)
          )
            continue;
          examples.push({
            text,
            definition,
            partOfSpeech: plainText(part.partOfSpeech),
            sourceUrl,
            license: plainText(license.name),
            licenseUrl: safeSource(plainText(license.url)),
          });
        }
      }
    });
  return {
    word,
    clips: clips.slice(0, 10),
    examples: examples
      .sort((a, b) => a.text.length - b.text.length)
      .slice(0, 6),
    images: [],
    notices: [],
    fetchedAt: Date.now(),
  };
}
export function parseCommons(raw: unknown): ImageCandidate[] {
  const query = record(record(raw).query);
  const pages = query.pages;
  const rows = Array.isArray(pages) ? pages : Object.values(record(pages));
  return rows
    .flatMap((value) => {
      const page = record(value);
      const info = record(list(page.imageinfo)[0]);
      const meta = record(info.extmetadata);
      const get = (key: string) => plainText(record(meta[key]).value);
      const url = text(info.thumburl ?? info.url);
      const license = get('LicenseShortName');
      if (
        !approvedImage(url) ||
        !license ||
        !/CC|public domain|\bPD\b/i.test(license) ||
        unsuitable.test(`${text(page.title)} ${get('ImageDescription')}`)
      )
        return [];
      return [
        {
          url,
          title: plainText(page.title),
          sourceUrl: safeSource(text(info.descriptionurl)),
          author: get('Artist') || text(info.user),
          license,
          licenseUrl: safeSource(get('LicenseUrl')),
        },
      ];
    })
    .slice(0, 4);
}
export function normalizedIpa(value: string) {
  return value
    .replace(/[/[\]ˈˌː:\s.]/g, '')
    .replace(/ɹ/g, 'r')
    .replace(/ɡ/g, 'g');
}
export function selectAudio(clips: AudioClip[], preferredUrl = '', ipa = '') {
  // A recording of “a cat” or “to read” is not a single-word dictation cue.
  clips = clips.filter((clip) => !clip.phrase);
  const preferred = clips.find((c) => c.url === preferredUrl);
  if (preferred) return { clip: preferred, ambiguous: false };
  const matching = ipa
    ? clips.filter((c) => normalizedIpa(c.ipa) === normalizedIpa(ipa))
    : [];
  const candidates = matching.length ? matching : clips;
  const ambiguous =
    !matching.length && new Set(clips.map((c) => c.entry)).size > 1;
  const score = (c: AudioClip) =>
    (c.accent === 'us' ? 0 : c.accent === 'uk' ? 2 : 4) +
    (c.url.endsWith('.mp3') ? 0 : 1);
  return {
    clip: [...candidates].sort((a, b) => score(a) - score(b))[0],
    ambiguous,
  };
}

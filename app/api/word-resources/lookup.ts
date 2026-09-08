import { bindings } from '../learning/storage';
import { applyVerifiedAudio } from './verified-audio';
import {
  parseDictionary,
  parseCommons,
  safeSource,
  approvedAudio,
  type WordResources,
} from '../../word-resources';

const agent =
  'PhonicsLearningWorkbench/1.0 (private educational vocabulary cards; https://phonics-word-workbench.todayztt.chatgpt.site)';
async function getJson(url: string, timeout = 25000) {
  const response = await fetch(url, {
    headers: { 'User-Agent': agent, Accept: 'application/json' },
    signal: AbortSignal.timeout(timeout),
    redirect: 'manual',
  });
  if (!response.ok) throw new Error(`source-${response.status}`);
  return response.json();
}
export async function commonsAudio(
  clip: WordResources['clips'][number],
  timeout = 5000,
) {
  if (applyVerifiedAudio(clip)) return;
  if (!clip.sourceUrl.startsWith('https://commons.wikimedia.org/')) return;
  const source = new URL(clip.sourceUrl);
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    prop: 'imageinfo',
    iiprop: 'url|extmetadata|user',
    formatversion: '2',
  });
  const id = source.searchParams.get('curid');
  if (id && /^\d+$/.test(id)) params.set('pageids', id);
  else if (source.pathname.startsWith('/wiki/File:'))
    params.set('titles', decodeURIComponent(source.pathname.slice(6)));
  else return;
  const raw = (await getJson(
    `https://commons.wikimedia.org/w/api.php?${params}`,
    timeout,
  )) as {
    query?: {
      pages?: {
        title?: string;
        imageinfo?: {
          url?: string;
          user?: string;
          extmetadata?: Record<string, { value?: string }>;
        }[];
      }[];
    };
  };
  const info = raw.query?.pages?.[0]?.imageinfo?.[0];
  const title = raw.query?.pages?.[0]?.title?.replace(/_/g, ' ') ?? '';
  const phrase = title.match(
    /^File:En-(?:us|uk|au|ca)-((?:a|an|the|to) .+)\.(?:ogg|mp3|wav)$/i,
  )?.[1];
  if (phrase) clip.phrase = phrase;
  if (info?.url && approvedAudio(info.url)) clip.originalUrl = info.url;
  const plain = (v?: string) =>
    (v ?? '').replace(/<[^>]*>/g, '').slice(0, 1200);
  clip.author = plain(info?.extmetadata?.Artist?.value) || info?.user || '';
  clip.license ||= plain(info?.extmetadata?.LicenseShortName?.value);
  clip.licenseUrl ||= safeSource(
    (info?.extmetadata?.LicenseUrl?.value ?? '').replace(
      /^http:\/\/creativecommons.org\//,
      'https://creativecommons.org/',
    ),
  );
}
const inFlight = new Map<string, Promise<WordResources>>();
export function lookup(
  word: string,
  withImages = false,
): Promise<WordResources> {
  const key = `${word}:${withImages}`;
  const current = inFlight.get(key);
  if (current) return current;
  const request = lookupUncached(word, withImages).finally(() =>
    inFlight.delete(key),
  );
  inFlight.set(key, request);
  return request;
}
async function lookupUncached(
  word: string,
  withImages = false,
): Promise<WordResources> {
  const bucket = bindings().MEDIA;
  const cacheKey = `word-resources/v2/${encodeURIComponent(word)}${withImages ? '-images' : ''}.json`;
  const cached = await bucket.get(cacheKey);
  if (cached) {
    const data = await cached.json<WordResources>();
    if (
      Date.now() - data.fetchedAt <
      (data.clips.length ? 7 * 86400000 : 3600000)
    )
      return data;
  }
  let result: WordResources = {
    word,
    clips: [],
    examples: [],
    images: [],
    notices: [],
    fetchedAt: Date.now(),
  };
  if (!withImages)
    try {
      result = parseDictionary(
        await getJson(
          `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
        ),
        word,
      );
      // Commons attribution is per recording, not the dictionary entry's text licence.
      await Promise.all(
        result.clips.map(async (clip) => {
          try {
            await commonsAudio(clip);
          } catch {
            /* retain upstream attribution and source */
          }
        }),
      );
      if (result.clips.some((clip) => clip.phrase))
        result.notices.push(
          '已排除带冠词或 to 的短语录音，不将其用于单词听写。',
        );
      if (!result.clips.length)
        result.notices.push('词典暂未提供可用录音，可明确选择备用合成朗读。');
    } catch (error) {
      console.warn(
        'Dictionary source unavailable:',
        error instanceof Error ? error.message : 'unknown',
      );
      result.notices.push(
        error instanceof Error && error.message === 'source-404'
          ? '词典暂未收录这个词，可使用备用合成朗读。'
          : '词典暂时无法连接，未替换已有内容。',
      );
    }
  if (withImages) {
    const dictionary = lookup(word, false);
    let images: WordResources['images'] = [];
    let imageNotice = '';
    try {
      const query = new URLSearchParams({
        action: 'query',
        format: 'json',
        formatversion: '2',
        generator: 'search',
        gsrsearch: `"${word}" filetype:bitmap`,
        gsrnamespace: '6',
        gsrlimit: '4',
        prop: 'imageinfo',
        iiprop: 'url|extmetadata|user',
        iiurlwidth: '640',
      });
      images = parseCommons(
        await getJson(`https://commons.wikimedia.org/w/api.php?${query}`),
      );
    } catch (error) {
      console.warn(
        'Commons source unavailable:',
        error instanceof Error ? error.message : 'unknown',
      );
      imageNotice = '配图来源暂时无法连接，可稍后重试或上传图片。';
    }
    const base = await dictionary;
    result = {
      ...base,
      images,
      notices: [...base.notices, ...(imageNotice ? [imageNotice] : [])],
    };
  }
  // Do not preserve a transient source outage as a negative search result.
  if (!result.notices.some((n) => n.includes('无法连接')))
    await bucket.put(cacheKey, JSON.stringify(result), {
      httpMetadata: { contentType: 'application/json' },
    });
  return result;
}

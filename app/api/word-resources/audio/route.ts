import {
  bindings,
  identity,
  json,
  errorResponse,
} from '../../learning/storage';
import { normalizeWord } from '../../../word-resources';
import { lookup, commonsAudio } from '../lookup';
import { downloadRecording } from './download';

export async function GET(request: Request) {
  try {
    identity(request);
    const params = new URL(request.url).searchParams;
    const word = normalizeWord(params.get('word') ?? '');
    const index = Number(params.get('clip'));
    if (!word || !Number.isInteger(index) || index < 0 || index > 9)
      return json({ error: '发音参数不正确。' }, 400);
    const resources = await lookup(word);
    const clip = resources.clips[index];
    if (!clip) return json({ error: '暂无词典录音。' }, 404);
    if (clip.phrase)
      return json({ error: '此录音是短语，不用于单词听写。' }, 409);
    const hash = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(clip.url),
    );
    const key = `dictionary-audio/${Array.from(new Uint8Array(hash))
      .map((n) => n.toString(16).padStart(2, '0'))
      .join('')}`;
    const bucket = bindings().MEDIA;
    const saved = await bucket.get(key);
    if (saved)
      return new Response(saved.body, {
        headers: {
          'Content-Type': saved.httpMetadata?.contentType ?? 'audio/mpeg',
          'Cache-Control': 'private, max-age=86400',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    let recording;
    try {
      recording = await downloadRecording(clip, (value) => commonsAudio(value));
    } catch {
      return json(
        { error: '词典录音暂时无法播放，请稍后重试或使用备用朗读。' },
        502,
      );
    }
    const { bytes, type } = recording;
    // Only cache media when the recording has its own open licence, never infer it from text.
    if (clip.licenseUrl.startsWith('https://creativecommons.org/'))
      await bucket.put(key, bytes, { httpMetadata: { contentType: type } });
    return new Response(bytes, {
      headers: {
        'Content-Type': type,
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

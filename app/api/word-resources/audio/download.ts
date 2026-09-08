import { approvedAudio, type AudioClip } from '../../../word-resources';

const maxBytes = 2000000;
async function download(url: string, fetcher: typeof fetch) {
  for (let hop = 0; hop <= 2; hop++) {
    if (!approvedAudio(url)) throw new Error('unapproved-audio-url');
    const response = await fetcher(url, {
      signal: AbortSignal.timeout(12000),
      redirect: 'manual',
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new Error('missing-audio-location');
      url = new URL(location, url).href;
      continue;
    }
    const type = (response.headers.get('content-type') ?? '')
      .split(';')[0]
      .trim();
    if (
      !response.ok ||
      Number(response.headers.get('content-length')) > maxBytes ||
      ![
        'audio/mpeg',
        'audio/ogg',
        'application/ogg',
        'audio/wav',
        'audio/x-wav',
      ].includes(type)
    ) {
      await response.body?.cancel();
      throw new Error(`audio-source-${response.status}`);
    }
    if (!response.body) throw new Error('empty-audio');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error('oversized-audio');
      }
      chunks.push(item.value);
    }
    if (!size) throw new Error('empty-audio');
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { bytes: bytes.buffer, type };
  }
  throw new Error('audio-redirect-limit');
}

export async function downloadRecording(
  clip: AudioClip,
  resolveOriginal: (clip: AudioClip) => Promise<void>,
  fetcher: typeof fetch = fetch,
) {
  if (clip.phrase) throw new Error('phrase-is-not-word-audio');
  // Try both independently: an exception or timeout must also trigger fallback.
  const attempted = new Set<string>();
  const attempt = async (url?: string) => {
    if (!url || attempted.has(url)) return;
    attempted.add(url);
    try {
      return await download(url, fetcher);
    } catch {
      return;
    }
  };
  let audio = (await attempt(clip.originalUrl)) ?? (await attempt(clip.url));
  if (audio) return audio;
  if (!clip.originalUrl) {
    try {
      await resolveOriginal(clip);
    } catch {
      /* explicit unavailable result below */
    }
    if (clip.phrase) throw new Error('phrase-is-not-word-audio');
    audio = await attempt(clip.originalUrl);
    if (audio) return audio;
  }
  throw new Error('recording-unavailable');
}

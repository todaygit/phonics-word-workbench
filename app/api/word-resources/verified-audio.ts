import type { AudioClip } from '../../word-resources';

// Commons imageinfo metadata verified on 2026-09-08. These are returned URLs,
// never guessed hashed paths. Used when the metadata service is unavailable.
const verified: Record<string, Partial<AudioClip> & { title: string }> = {
  '187316': {
    title: 'File:En-us-cat.ogg',
    originalUrl:
      'https://upload.wikimedia.org/wikipedia/commons/4/46/En-us-cat.ogg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original',
    author: 'Dvortygirl',
    license: 'CC BY-SA 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
  },
  '9014180': {
    title: 'File:En-uk-a cat.ogg',
    phrase: 'a cat',
    originalUrl:
      'https://upload.wikimedia.org/wikipedia/commons/1/1e/En-uk-a_cat.ogg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original',
    author: 'Association Shtooka, Judith Franck',
    license: 'CC BY 3.0 us',
    licenseUrl: 'https://creativecommons.org/licenses/by/3.0/us/deed.en',
  },
  '9028720': {
    title: 'File:En-uk-to read.ogg',
    phrase: 'to read',
    originalUrl:
      'https://upload.wikimedia.org/wikipedia/commons/4/4d/En-uk-to_read.ogg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original',
    author: 'Association Shtooka, Judith Franck',
    license: 'CC BY 3.0 us',
    licenseUrl: 'https://creativecommons.org/licenses/by/3.0/us/deed.en',
  },
  '330394': {
    title: 'File:En-us-read-past.ogg',
    originalUrl:
      'https://upload.wikimedia.org/wikipedia/commons/8/84/En-us-read-past.ogg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original',
    author: 'Dvortygirl',
    license: 'Public domain',
    licenseUrl: '',
  },
  '112398709': {
    title: 'File:En-us-read.ogg',
    originalUrl:
      'https://upload.wikimedia.org/wikipedia/commons/5/50/En-us-read.ogg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original',
    author: 'Dvortygirl',
    license: 'Public domain',
    licenseUrl: '',
  },
};
export function applyVerifiedAudio(clip: AudioClip) {
  if (!clip.sourceUrl.startsWith('https://commons.wikimedia.org/'))
    return false;
  const source = new URL(clip.sourceUrl);
  const entry =
    verified[source.searchParams.get('curid') ?? ''] ??
    Object.values(verified).find(
      (v) =>
        `/wiki/${v.title}` ===
        decodeURIComponent(source.pathname).replace(/_/g, ' '),
    );
  if (!entry) return false;
  const { title: _title, ...metadata } = entry;
  Object.assign(clip, metadata);
  return true;
}

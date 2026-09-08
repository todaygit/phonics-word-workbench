'use client';
/* oxlint-disable react/react-compiler, jsx-a11y/label-has-associated-control, jsx-a11y/prefer-tag-over-role */
import { useEffect, useRef, useState } from 'react';
import { Volume2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  normalizeWord,
  approvedAudio,
  selectAudio,
  type WordResources,
} from './word-resources';

const requests = new Map<string, Promise<WordResources>>();
export function loadResources(word: string, images = false, refresh = false) {
  const normalized = normalizeWord(word);
  const key = `${normalized}:${images}`;
  if (refresh) requests.delete(key);
  if (!requests.has(key))
    requests.set(
      key,
      (async () => {
        if (!normalized) throw new Error('请先填写英文单词。');
        const response = await fetch(
          `/api/word-resources?word=${encodeURIComponent(normalized)}${images ? '&images=1' : ''}`,
        );
        const data = (await response.json()) as WordResources & {
          error?: string;
        };
        if (!response.ok) throw new Error(data.error || '素材暂时无法读取。');
        if (data.notices.some((n) => n.includes('无法连接')))
          requests.delete(key);
        return data;
      })().catch((error) => {
        requests.delete(key);
        throw error;
      }),
    );
  return requests.get(key)!;
}
let playingAudio: HTMLAudioElement | null = null;
let playbackGeneration = 0;
export function stopWordAudio() {
  playbackGeneration++;
  playingAudio?.pause();
  playingAudio = null;
  if (typeof window !== 'undefined' && 'speechSynthesis' in window)
    window.speechSynthesis.cancel();
}
export const accentLabel = (accent: string) =>
  ({
    us: '美音',
    uk: '英音',
    au: '澳音',
    ca: '加拿大音',
    unknown: '口音未标注',
  })[accent] ?? '口音未标注';

export function WordAudio({
  word,
  ipa = '',
  preferredUrl = '',
  autoPlay = false,
  hideDetails = false,
  onSelect,
}: {
  word: string;
  ipa?: string;
  preferredUrl?: string;
  autoPlay?: boolean;
  hideDetails?: boolean;
  onSelect?: (url: string) => void;
}) {
  const [resources, setResources] = useState<WordResources | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [localChoice, setLocalChoice] = useState(preferredUrl);
  const [rate, setRate] = useState('1');
  const [retry, setRetry] = useState(0);
  const active = useRef(true);
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    active.current = true;
    setResources(null);
    setLocalChoice(preferredUrl);
    setMessage('');
    setLoading(true);
    let disposed = false;
    const timer = setTimeout(() => {
      void loadResources(word, false, retry > 0)
        .then((data) => {
          if (!disposed) {
            setResources(data);
            if (!data.clips.length && data.notices.length)
              setMessage(data.notices.join(' '));
          }
        })
        .catch((error) => {
          if (!disposed)
            setMessage(
              error instanceof Error ? error.message : '录音暂时无法读取。',
            );
        })
        .finally(() => {
          if (!disposed) setLoading(false);
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      disposed = true;
      active.current = false;
      audio.current?.pause();
      if (playingAudio === audio.current) stopWordAudio();
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  }, [word, preferredUrl, retry]);
  const choice = selectAudio(resources?.clips ?? [], localChoice, ipa);
  const selected = choice.clip;
  async function play() {
    if (!selected || !resources || choice.ambiguous) return;
    stopWordAudio();
    const generation = playbackGeneration;
    const index = resources.clips.findIndex(
      (clip) => clip.url === selected.url,
    );
    const sources = [
      ...(selected.originalUrl && approvedAudio(selected.originalUrl)
        ? [selected.originalUrl]
        : []),
      `/api/word-resources/audio?word=${encodeURIComponent(normalizeWord(word))}&clip=${index}`,
      ...(approvedAudio(selected.url) ? [selected.url] : []),
    ];
    const current = () => active.current && generation === playbackGeneration;
    const attempt = async (position: number): Promise<void> => {
      if (!current()) return;
      if (position >= sources.length) {
        setMessage('录音未能播放。请重试，或明确选择备用合成朗读。');
        return;
      }
      const player = new Audio(sources[position]);
      player.playbackRate = Number(rate);
      player.preservesPitch = true;
      audio.current = player;
      playingAudio = player;
      setMessage(position ? '正在切换备用录音来源…' : '正在加载录音…');
      let advanced = false;
      const next = () => {
        if (advanced || !current()) return;
        advanced = true;
        player.pause();
        void attempt(position + 1);
      };
      player.onplaying = () => current() && setMessage('词典录音播放中');
      player.onended = () => current() && setMessage('可以再次点击重复听。');
      player.onerror = next;
      try {
        await player.play();
      } catch (error) {
        if (!current()) return;
        if (error instanceof DOMException && error.name === 'NotAllowedError')
          setMessage('浏览器限制自动播放，请点击“听单词”。');
        else next();
      }
    };
    await attempt(0);
  }
  const playRef = useRef(play);
  playRef.current = play;
  useEffect(() => {
    if (autoPlay && resources && !choice.ambiguous && selected)
      void playRef.current();
  }, [autoPlay, resources, choice.ambiguous, selected]);
  function fallback() {
    stopWordAudio();
    if (!('speechSynthesis' in window)) {
      setMessage(
        '当前设备不支持备用朗读，请使用有词典录音的单词或更换浏览器。',
      );
      return;
    }
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = 'en-US';
    utterance.rate = Number(rate) * 0.9;
    utterance.voice =
      window.speechSynthesis.getVoices().find((v) => v.lang === 'en-US') ??
      null;
    utterance.onerror = () => setMessage('设备朗读未能播放，请检查声音设置。');
    window.speechSynthesis.speak(utterance);
    setMessage('正在使用备用合成朗读，不是词典录音。');
  }
  return (
    <div className={`word-audio ${hideDetails ? 'word-audio-test' : ''}`}>
      <div className="word-audio-controls">
        <Button
          type="button"
          disabled={loading || !selected || choice.ambiguous}
          onClick={() => void play()}
        >
          <Volume2 /> {loading ? '匹配发音中…' : '听单词'}
        </Button>
        <Select value={rate} onValueChange={(value) => value && setRate(value)}>
          <SelectTrigger aria-label="发音速度">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">正常速度</SelectItem>
            <SelectItem value="0.75">慢速 0.75×</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {choice.ambiguous ? (
        <p className="audio-message">
          这个词有不同读音，请先由家长在词库选定，避免听错音。
        </p>
      ) : (
        <p className="audio-message">
          {message ||
            (selected
              ? `词典录音 · ${accentLabel(selected.accent)}（按来源文件标记）`
              : loading
                ? '正在寻找词典录音。'
                : '没有匹配到可用词典录音。')}
        </p>
      )}
      {!choice.ambiguous && (
        <div className="audio-secondary">
          <Button type="button" variant="ghost" size="sm" onClick={fallback}>
            备用合成朗读
          </Button>
          {!selected && !loading && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setRetry((n) => n + 1)}
            >
              <RotateCcw /> 重试匹配
            </Button>
          )}
        </div>
      )}
      {!hideDetails && resources && (
        <>
          {onSelect && resources.clips.length > 0 && (
            <label className="audio-choice">
              选定本词读音
              <Select
                value={localChoice || ''}
                onValueChange={(url) => {
                  if (!url) return;
                  setLocalChoice(url);
                  onSelect(url);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="自动按音标匹配（同等条件优先美音）" />
                </SelectTrigger>
                <SelectContent>
                  {resources.clips
                    .filter((clip) => !clip.phrase)
                    .map((clip) => (
                      <SelectItem key={clip.url} value={clip.url}>
                        {accentLabel(clip.accent)} · {clip.ipa || '未标音标'} ·
                        词条 {clip.entry + 1}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </label>
          )}
          {selected?.sourceUrl && (
            <small className="media-attribution">
              <a href={selected.sourceUrl} target="_blank" rel="noreferrer">
                录音出处
              </a>
              {selected.author && ` · ${selected.author}`} ·{' '}
              {selected.licenseUrl ? (
                <a href={selected.licenseUrl} target="_blank" rel="noreferrer">
                  {selected.license || '查看许可'}
                </a>
              ) : (
                '许可请见来源文件页'
              )}
            </small>
          )}
        </>
      )}
    </div>
  );
}

'use client';
/* oxlint-disable next/no-img-element */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { loadResources, WordAudio } from './word-audio';
import type { RecognitionWord } from './learning-model';
import type { WordResources } from './word-resources';

export function ResourcePicker({
  word,
  onApply,
}: {
  word: RecognitionWord;
  onApply: (change: Partial<RecognitionWord>) => void;
}) {
  const [result, setResult] = useState<WordResources | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  return (
    <section className="resource-picker full">
      <h3>网上补充素材</h3>
      <p>
        优先保留你提供的 RAZ
        内容。下面是网上匹配的候选，确认词义和适龄性后采用，不会自动覆盖已有例句和图片。
      </p>
      <WordAudio
        word={word.word}
        ipa={word.ipa}
        preferredUrl={word.audioUrl}
        onSelect={(audioUrl) => onApply({ audioUrl })}
      />
      <Button
        type="button"
        variant="outline"
        disabled={busy || !word.word.trim()}
        onClick={async () => {
          const query = word.word;
          setBusy(true);
          setMessage('');
          try {
            const data = await loadResources(query, true, true);
            setResult(data);
            if (!data.examples.length && !data.images.length)
              setMessage(
                '未匹配到合适素材，可稍后重试，或保留自编例句与上传配图。',
              );
          } catch (error) {
            setMessage(error instanceof Error ? error.message : '查询失败。');
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? '正在匹配图片和例句…' : '匹配图片和例句'}
      </Button>
      {message && <p className="audio-message">{message}</p>}
      {result && (
        <>
          <div className="resource-notices">
            {result.notices.map((n) => (
              <p key={n}>{n}</p>
            ))}
          </div>
          <h4>例句候选（非 RAZ）</h4>
          {!result.examples.length && (
            <p className="muted">
              词典未提供适合的短例句，不代表该词没有例句。可在上方自行填写。
            </p>
          )}
          {result.examples.map((example) => (
            <article className="example-candidate" key={example.text}>
              <p>{example.text}</p>
              <small>
                {example.partOfSpeech} · {example.definition}
              </small>
              <small>
                <a href={example.sourceUrl} target="_blank" rel="noreferrer">
                  词典出处
                </a>{' '}
                ·{' '}
                {example.licenseUrl ? (
                  <a href={example.licenseUrl} target="_blank" rel="noreferrer">
                    {example.license}
                  </a>
                ) : (
                  example.license
                )}
              </small>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  onApply({
                    example: example.text,
                    source: `Wiktionary / Free Dictionary API（非 RAZ）；${example.sourceUrl}；${example.license} ${example.licenseUrl}`,
                  });
                  setMessage('例句已填入编辑框，请检查后保存词条。');
                }}
              >
                采用这句
              </Button>
            </article>
          ))}
          <h4>配图候选</h4>
          <p className="muted">关键词图片可能有不同含义，请先看图再采用。</p>
          <div className="image-candidates">
            {result.images.map((candidate) => (
              <article key={candidate.url}>
                <img src={candidate.url} alt={candidate.title} loading="lazy" />
                <small>{candidate.title}</small>
                <small>{candidate.author}</small>
                <small>
                  <a
                    href={candidate.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    来源
                  </a>{' '}
                  ·{' '}
                  {candidate.licenseUrl ? (
                    <a
                      href={candidate.licenseUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {candidate.license}
                    </a>
                  ) : (
                    candidate.license
                  )}
                </small>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onApply({
                      image: candidate.url,
                      imageSource: candidate.sourceUrl,
                      imageAuthor: candidate.author,
                      imageLicense: candidate.license,
                      imageLicenseUrl: candidate.licenseUrl,
                    });
                    setMessage('配图已选中，请保存词条。');
                  }}
                >
                  采用这张图
                </Button>
              </article>
            ))}
          </div>
          {!result.images.length && (
            <p className="muted">未找到可用配图，仍可上传自己的图片。</p>
          )}
        </>
      )}
    </section>
  );
}

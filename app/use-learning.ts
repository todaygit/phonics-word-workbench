'use client';
/* oxlint-disable react/react-compiler */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  emptyLearning,
  validateLearning,
  type LearningData,
} from './learning-model';

export function useLearning() {
  const [data, setData] = useState<LearningData>(emptyLearning);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needsLogin, setNeedsLogin] = useState(false);
  const [stale, setStale] = useState(false);
  const latest = useRef({ data, revision: 0 });
  const locked = useRef(false);
  const reload = useCallback(async () => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    try {
      const response = await fetch('/api/learning', { cache: 'no-store' });
      setNeedsLogin(response.status === 401);
      const body = (await response.json()) as {
        error?: string;
        data: unknown;
        revision: number;
      };
      if (!response.ok) throw new Error(body.error);
      const saved = validateLearning(body.data);
      latest.current = { data: saved, revision: body.revision };
      setData(saved);
      setReady(true);
      setStale(false);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取失败，请重试。');
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (locked.current) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  const save = useCallback(
    async (change: (current: LearningData) => LearningData) => {
      if (locked.current || !ready || stale) return false;
      locked.current = true;
      setBusy(true);
      setError('');
      try {
        const next = validateLearning(change(latest.current.data));
        const response = await fetch('/api/learning', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            revision: latest.current.revision,
            data: next,
          }),
        });
        if (response.status === 409 || response.status >= 500) setStale(true);
        const body = (await response.json()) as {
          error?: string;
          data: LearningData;
          revision: number;
        };
        if (!response.ok) throw new Error(body.error);
        latest.current = { data: body.data, revision: body.revision };
        setData(body.data);
        return true;
      } catch (err) {
        // An interrupted response may have committed. Require a reload before retrying an answer.
        if (err instanceof TypeError) setStale(true);
        setError(err instanceof Error ? err.message : '保存失败，请重试。');
        return false;
      } finally {
        locked.current = false;
        setBusy(false);
      }
    },
    [ready, stale],
  );
  return { data, ready, busy, error, needsLogin, stale, reload, save };
}
export type LearningStore = ReturnType<typeof useLearning>;

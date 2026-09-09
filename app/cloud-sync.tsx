'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  CheckCircle2,
  Cloud,
  CloudOff,
  LogOut,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const SUPABASE_URL = 'https://huiiydqyixpdwuggdwzb.supabase.co';
// Supabase publishable keys are intended for browser use. RLS protects each account's row.
const SUPABASE_KEY = 'sb_publishable_0IcnprXg1kNIqJAcnomJKg_1_9xP0va';
const SESSION_KEY = 'phonics.cloud.session';
const LAST_SYNC_KEY = 'phonics.cloud.lastSyncAt';
const BEFORE_RESTORE_KEY = 'phonics.cloud.beforeCloudRestore';
const LOCAL_BACKUPS_KEY = 'phonics.cloud.localBackups';
const APP_URL = 'https://todaygit.github.io/phonics-word-workbench/';

type CloudStatus =
  | 'signed-out'
  | 'connecting'
  | 'syncing'
  | 'synced'
  | 'confirm-email'
  | 'offline'
  | 'error';

type AuthSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: { id: string; email?: string };
};

type Snapshot = {
  version: 1;
  savedAt: string;
  items: Record<string, string>;
};

type LocalSafetyBackup = Snapshot & { reason: string };

type CloudRow = {
  revision: number;
  payload: Snapshot;
  updated_at: string;
};

type CloudContextValue = {
  status: CloudStatus;
  message: string;
  email: string;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
};

const CloudContext = createContext<CloudContextValue | null>(null);

function readSession(): AuthSession | null {
  try {
    const value = window.localStorage.getItem(SESSION_KEY);
    return value ? (JSON.parse(value) as AuthSession) : null;
  } catch {
    return null;
  }
}

function storeSession(session: AuthSession | null) {
  if (session) {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } else {
    window.localStorage.removeItem(SESSION_KEY);
    window.localStorage.removeItem(LAST_SYNC_KEY);
  }
}

function collectSnapshot(): Snapshot {
  const items: Record<string, string> = {};
  const keys = Object.keys(window.localStorage)
    .filter(
      (key) =>
        key.startsWith('phonics.') &&
        !key.startsWith('phonics.cloud.') &&
        !key.startsWith('phonics.pwa.'),
    )
    .sort();
  for (const key of keys) {
    const value = window.localStorage.getItem(key);
    if (value !== null) items[key] = value;
  }
  return { version: 1, savedAt: new Date().toISOString(), items };
}

function validSnapshot(value: unknown): value is Snapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<Snapshot>;
  return (
    snapshot.version === 1 &&
    typeof snapshot.savedAt === 'string' &&
    Boolean(snapshot.items) &&
    typeof snapshot.items === 'object' &&
    Object.entries(snapshot.items ?? {}).every(
      ([key, item]) =>
        key.startsWith('phonics.') &&
        !key.startsWith('phonics.cloud.') &&
        !key.startsWith('phonics.pwa.') &&
        typeof item === 'string',
    )
  );
}

function snapshotFingerprint(snapshot: Snapshot) {
  return JSON.stringify(snapshot.items);
}

/** Keep a small rolling, device-local safety net. Cloud restores and app
 * migrations must never be the only copy of a family's current progress. */
export function saveLocalSafetyBackup(reason = '自动备份') {
  if (typeof window === 'undefined') return;
  const snapshot = collectSnapshot();
  if (!Object.keys(snapshot.items).length) return;
  let previous: LocalSafetyBackup[] = [];
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(LOCAL_BACKUPS_KEY) ?? '[]',
    );
    if (Array.isArray(parsed)) previous = parsed as LocalSafetyBackup[];
  } catch {
    previous = [];
  }
  const next: LocalSafetyBackup[] = [
    ...previous,
    { ...snapshot, reason, savedAt: new Date().toISOString() },
  ].slice(-5);
  window.localStorage.setItem(LOCAL_BACKUPS_KEY, JSON.stringify(next));
}

/** Recover only when a rollback/restore left the key completely absent. Never
 * overwrite a non-empty current value, so intentional edits remain intact. */
export function recoverLocalSafetyBackup() {
  if (typeof window === 'undefined') return false;
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(LOCAL_BACKUPS_KEY) ?? '[]',
    ) as LocalSafetyBackup[];
    const latest = Array.isArray(parsed) ? parsed.at(-1) : null;
    if (!latest?.items) return false;
    let recovered = false;
    for (const key of ['phonics.github.activity', 'phonics.github.forest']) {
      const current = window.localStorage.getItem(key);
      const previous = latest.items[key];
      if ((!current || current === '[]') && previous && previous !== '[]') {
        window.localStorage.setItem(key, previous);
        recovered = true;
      }
    }
    return recovered;
  } catch {
    return false;
  }
}

function restoreSnapshot(snapshot: Snapshot) {
  const current = collectSnapshot();
  saveLocalSafetyBackup('云端记录覆盖前');
  window.localStorage.setItem(BEFORE_RESTORE_KEY, JSON.stringify(current));
  for (const key of Object.keys(window.localStorage)) {
    if (
      key.startsWith('phonics.') &&
      !key.startsWith('phonics.cloud.') &&
      !key.startsWith('phonics.pwa.')
    ) {
      window.localStorage.removeItem(key);
    }
  }
  for (const [key, value] of Object.entries(snapshot.items)) {
    window.localStorage.setItem(key, value);
  }
}

function authSession(value: unknown): AuthSession | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as Record<string, unknown>;
  const user = body.user as Record<string, unknown> | undefined;
  if (
    typeof body.access_token !== 'string' ||
    typeof body.refresh_token !== 'string' ||
    typeof body.expires_in !== 'number' ||
    !user ||
    typeof user.id !== 'string'
  ) {
    return null;
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: Date.now() + body.expires_in * 1000,
    user: {
      id: user.id,
      email: typeof user.email === 'string' ? user.email : undefined,
    },
  };
}

async function responseBody(response: Response) {
  const body = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    const text =
      (typeof body.msg === 'string' && body.msg) ||
      (typeof body.message === 'string' && body.message) ||
      (typeof body.error_description === 'string' && body.error_description) ||
      '云端暂时没有响应，请稍后重试。';
    throw new Error(text);
  }
  return body;
}

async function authRequest(path: string, body: Record<string, unknown>) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return responseBody(response);
}

async function refreshSession(session: AuthSession) {
  if (session.expiresAt > Date.now() + 90_000) return session;
  const body = await authRequest('token?grant_type=refresh_token', {
    refresh_token: session.refreshToken,
  });
  const refreshed = authSession(body);
  if (!refreshed) throw new Error('家庭账号登录已过期，请重新登录。');
  storeSession(refreshed);
  return refreshed;
}

async function cloudRows(session: AuthSession) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/workbench_states?select=revision,payload,updated_at&user_id=eq.${encodeURIComponent(session.user.id)}`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${session.accessToken}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    },
  );
  return (await responseBody(response)) as unknown as CloudRow[];
}

async function uploadSnapshot(
  session: AuthSession,
  revision: number,
  snapshot: Snapshot,
) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/workbench_states?on_conflict=user_id`,
    {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify({
        user_id: session.user.id,
        revision,
        payload: snapshot,
        updated_at: snapshot.savedAt,
      }),
    },
  );
  const rows = (await responseBody(response)) as unknown as CloudRow[];
  return rows[0];
}

function friendlyError(error: unknown) {
  const text = error instanceof Error ? error.message : String(error);
  if (/invalid login credentials/i.test(text)) return '邮箱或密码不正确。';
  if (/email not confirmed/i.test(text))
    return '请先打开确认邮件，再回来登录。';
  if (/user already registered/i.test(text))
    return '这个邮箱已经注册，请直接登录。';
  if (/password/i.test(text) && /characters/i.test(text))
    return '密码至少需要 6 位。';
  if (/failed to fetch|network/i.test(text))
    return '网络暂时无法连接云端，本机数据仍会保留。';
  return text;
}

export function CloudSyncProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<CloudStatus>('signed-out');
  const [message, setMessage] = useState('尚未连接家庭云端。');
  const [email, setEmail] = useState('');
  const sessionRef = useRef<AuthSession | null>(null);
  const fingerprintRef = useRef('');
  const syncingRef = useRef(false);

  const setSignedIn = useCallback((session: AuthSession) => {
    sessionRef.current = session;
    setEmail(session.user.email ?? '家庭账号');
    storeSession(session);
  }, []);

  const pushCurrent = useCallback(
    async (force = false) => {
      if (syncingRef.current || !sessionRef.current || !navigator.onLine)
        return;
      const snapshot = collectSnapshot();
      const fingerprint = snapshotFingerprint(snapshot);
      if (!force && fingerprint === fingerprintRef.current) return;
      syncingRef.current = true;
      setStatus('syncing');
      setMessage('正在保存到家庭云端…');
      try {
        const session = await refreshSession(sessionRef.current);
        setSignedIn(session);
        const current = await cloudRows(session);
        const row = await uploadSnapshot(
          session,
          (current[0]?.revision ?? 0) + 1,
          snapshot,
        );
        const syncedAt = row?.updated_at ?? snapshot.savedAt;
        window.localStorage.setItem(LAST_SYNC_KEY, syncedAt);
        fingerprintRef.current = fingerprint;
        setStatus('synced');
        setMessage(
          `已同步 · ${new Intl.DateTimeFormat('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
          }).format(new Date(syncedAt))}`,
        );
      } catch (error) {
        setStatus(navigator.onLine ? 'error' : 'offline');
        setMessage(friendlyError(error));
      } finally {
        syncingRef.current = false;
      }
    },
    [setSignedIn],
  );

  const pullOrCreate = useCallback(
    async (session: AuthSession, firstConnection = false) => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      setStatus('syncing');
      setMessage('正在读取家庭学习记录…');
      try {
        const active = await refreshSession(session);
        setSignedIn(active);
        const rows = await cloudRows(active);
        const remote = rows[0];
        if (!remote) {
          const snapshot = collectSnapshot();
          const saved = await uploadSnapshot(active, 1, snapshot);
          window.localStorage.setItem(
            LAST_SYNC_KEY,
            saved?.updated_at ?? snapshot.savedAt,
          );
          fingerprintRef.current = snapshotFingerprint(snapshot);
          setStatus('synced');
          setMessage('本机学习记录已保存到家庭云端。');
          return;
        }

        if (!validSnapshot(remote.payload))
          throw new Error('云端数据格式不正确，未覆盖本机数据。');
        const localSync = window.localStorage.getItem(LAST_SYNC_KEY);
        const remoteIsNewer =
          !localSync ||
          Date.parse(remote.updated_at) > Date.parse(localSync) + 1000;
        if (firstConnection || remoteIsNewer) {
          restoreSnapshot(remote.payload);
          window.localStorage.setItem(LAST_SYNC_KEY, remote.updated_at);
          fingerprintRef.current = snapshotFingerprint(remote.payload);
          setStatus('synced');
          setMessage('已下载家庭云端记录，正在更新工作台…');
          window.setTimeout(() => window.location.reload(), 250);
          return;
        }
        const localFingerprint = snapshotFingerprint(collectSnapshot());
        const remoteFingerprint = snapshotFingerprint(remote.payload);
        // If this device changed while it was offline, leave the fingerprint
        // unset so the short local timer uploads those changes next.
        fingerprintRef.current =
          localFingerprint === remoteFingerprint ? localFingerprint : '';
        setStatus('synced');
        setMessage('当前设备已经与家庭云端同步。');
      } catch (error) {
        setStatus(navigator.onLine ? 'error' : 'offline');
        setMessage(friendlyError(error));
      } finally {
        syncingRef.current = false;
      }
    },
    [setSignedIn],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = readSession();
      if (!stored) return;
      sessionRef.current = stored;
      setEmail(stored.user.email ?? '家庭账号');
      void pullOrCreate(stored);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [pullOrCreate]);

  useEffect(() => {
    const localTimer = window.setInterval(() => void pushCurrent(), 2500);
    const remoteTimer = window.setInterval(() => {
      if (sessionRef.current && navigator.onLine)
        void pullOrCreate(sessionRef.current);
    }, 45_000);
    const online = () => {
      if (sessionRef.current) void pullOrCreate(sessionRef.current);
    };
    const offline = () => {
      if (sessionRef.current) {
        setStatus('offline');
        setMessage('当前离线，学习记录保存在本机；联网后自动同步。');
      }
    };
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.clearInterval(localTimer);
      window.clearInterval(remoteTimer);
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, [pullOrCreate, pushCurrent]);

  const signIn = useCallback(
    async (accountEmail: string, password: string) => {
      setStatus('connecting');
      setMessage('正在登录家庭账号…');
      try {
        const body = await authRequest('token?grant_type=password', {
          email: accountEmail.trim(),
          password,
        });
        const session = authSession(body);
        if (!session) throw new Error('没有取得有效登录信息，请重试。');
        setSignedIn(session);
        await pullOrCreate(session, true);
      } catch (error) {
        setStatus('error');
        setMessage(friendlyError(error));
      }
    },
    [pullOrCreate, setSignedIn],
  );

  const signUp = useCallback(
    async (accountEmail: string, password: string) => {
      setStatus('connecting');
      setMessage('正在建立家庭账号…');
      try {
        const body = await authRequest(
          `signup?redirect_to=${encodeURIComponent(APP_URL)}`,
          {
            email: accountEmail.trim(),
            password,
          },
        );
        const session = authSession(body);
        if (session) {
          setSignedIn(session);
          await pullOrCreate(session);
        } else {
          setStatus('confirm-email');
          setMessage('确认邮件已经发送。请在邮箱里确认后，回来点击“登录”。');
        }
      } catch (error) {
        setStatus('error');
        setMessage(friendlyError(error));
      }
    },
    [pullOrCreate, setSignedIn],
  );

  const signOut = useCallback(async () => {
    const session = sessionRef.current;
    sessionRef.current = null;
    storeSession(null);
    setEmail('');
    fingerprintRef.current = '';
    setStatus('signed-out');
    setMessage('已经退出家庭同步；本机学习记录仍然保留。');
    if (session) {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${session.accessToken}`,
        },
      }).catch(() => undefined);
    }
  }, []);

  const syncNow = useCallback(async () => {
    if (!sessionRef.current) return;
    await pushCurrent(true);
  }, [pushCurrent]);

  return (
    <CloudContext.Provider
      value={{ status, message, email, signIn, signUp, signOut, syncNow }}
    >
      {children}
    </CloudContext.Provider>
  );
}

export function CloudSyncPanel() {
  const cloud = useContext(CloudContext);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  if (!cloud) return null;

  const signedIn = Boolean(cloud.email);
  const busy = cloud.status === 'connecting' || cloud.status === 'syncing';

  return (
    <section className="cloud-sync panel" aria-labelledby="cloud-sync-title">
      <div className="cloud-sync-heading">
        <div className="cloud-sync-icon">
          {cloud.status === 'offline' ? <CloudOff /> : <Cloud />}
        </div>
        <div>
          <p className="eyebrow">FAMILY SYNC</p>
          <h2 id="cloud-sync-title">手机、平板和电脑同步</h2>
          <p>同一个家庭账号共享词库、学习进度、积分、统计和已种下的树。</p>
        </div>
      </div>

      <output className={`cloud-sync-status status-${cloud.status}`}>
        {cloud.status === 'synced' ? <CheckCircle2 /> : <ShieldCheck />}
        <span>
          <strong>{signedIn ? cloud.email : '尚未登录家庭账号'}</strong>
          <small>{cloud.message}</small>
        </span>
      </output>

      {!signedIn ? (
        <div className="cloud-login-form">
          <div className="cloud-field">
            <label htmlFor="cloud-family-email">家庭账号邮箱</label>
            <Input
              id="cloud-family-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="用来在其他设备登录"
            />
          </div>
          <div className="cloud-field">
            <label htmlFor="cloud-family-password">家庭账号密码</label>
            <Input
              id="cloud-family-password"
              type="password"
              autoComplete="current-password"
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="至少 6 位"
            />
          </div>
          <div className="cloud-login-actions">
            <Button
              disabled={busy || !email.trim() || password.length < 6}
              onClick={() => void cloud.signIn(email, password)}
            >
              {busy && <RefreshCw className="spin" />} 登录并同步
            </Button>
            <Button
              variant="outline"
              disabled={busy || !email.trim() || password.length < 6}
              onClick={() => void cloud.signUp(email, password)}
            >
              第一次使用，创建家庭账号
            </Button>
          </div>
          <p className="cloud-help">
            第一台设备创建账号后会上传当前记录；其他设备请直接登录同一个账号。密码不会进入词库备份。
          </p>
        </div>
      ) : (
        <div className="cloud-signed-actions">
          <Button disabled={busy} onClick={() => void cloud.syncNow()}>
            <RefreshCw className={busy ? 'spin' : ''} /> 立即同步
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void cloud.signOut()}
          >
            <LogOut /> 退出家庭同步
          </Button>
        </div>
      )}
    </section>
  );
}

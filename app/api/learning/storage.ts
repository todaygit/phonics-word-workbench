import { env } from 'cloudflare:workers';

export function bindings() {
  return env as unknown as { DB: D1Database; MEDIA: R2Bucket };
}
export function identity(request: Request) {
  const id = request.headers.get('oai-authenticated-user-id');
  if (!id) throw new Error('unauthorized');
  return id;
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin)
    throw new Error('origin');
}
export function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}
export function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message === 'unauthorized')
    return json({ error: '请登录后保存和读取学习数据。' }, 401);
  if (message === 'origin') return json({ error: '请从工作台页面操作。' }, 403);
  console.error('Learning storage request failed', message);
  return json(
    { error: '暂时无法保存或读取，请稍后重试。当前操作未完成。' },
    500,
  );
}
export async function imageKey(user: string, id: string) {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(user),
  );
  const owner = Array.from(new Uint8Array(bytes))
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
  return `learning/${owner}/${id}`;
}

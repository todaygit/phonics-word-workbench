import {
  bindings,
  identity,
  sameOrigin,
  json,
  errorResponse,
  imageKey,
} from '../storage';

export async function POST(request: Request) {
  try {
    const user = identity(request);
    sameOrigin(request);
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.length > 1024 * 1024 || bytes.length < 12)
      return json(
        { error: '请选择 1 MB 以内的 PNG、JPEG 或 WebP 图片。' },
        400,
      );
    const mime =
      bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71
        ? 'image/png'
        : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          ? 'image/jpeg'
          : new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' &&
              new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP'
            ? 'image/webp'
            : null;
    if (!mime)
      return json({ error: '图片格式不支持，请使用 PNG、JPEG 或 WebP。' }, 400);
    const id = crypto.randomUUID();
    await bindings().MEDIA.put(await imageKey(user, id), bytes, {
      httpMetadata: { contentType: mime },
    });
    return json({ image: `/api/learning/image?id=${id}` });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function GET(request: Request) {
  try {
    const user = identity(request);
    const id = new URL(request.url).searchParams.get('id') ?? '';
    if (!/^[a-f0-9-]{36}$/.test(id))
      return json({ error: '图片不存在。' }, 404);
    const object = await bindings().MEDIA.get(await imageKey(user, id));
    if (!object) return json({ error: '图片不存在。' }, 404);
    return new Response(object.body, {
      headers: {
        'Content-Type':
          object.httpMetadata?.contentType ?? 'application/octet-stream',
        'Cache-Control': 'private, no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

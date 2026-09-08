import { identity, json, errorResponse } from '../learning/storage';
import { normalizeWord } from '../../word-resources';
import { lookup } from './lookup';

export async function GET(request: Request) {
  try {
    identity(request);
    const params = new URL(request.url).searchParams;
    const word = normalizeWord(params.get('word') ?? '');
    if (!word) return json({ error: '请输入一个英文单词或短语。' }, 400);
    return json(await lookup(word, params.get('images') === '1'));
  } catch (error) {
    return errorResponse(error);
  }
}

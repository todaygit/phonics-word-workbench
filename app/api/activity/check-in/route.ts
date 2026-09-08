import {
  bindings,
  identity,
  sameOrigin,
  json,
  errorResponse,
} from '../../learning/storage';
import { chinaDay } from '../../../activity-model';
import { activityInsert } from '../storage';

export async function POST(request: Request) {
  try {
    const user = identity(request);
    sameOrigin(request);
    const day = chinaDay();
    const eventId = `login:${day}`;
    await activityInsert(
      user,
      {
        eventId,
        kind: 'login',
        itemKey: day,
        label: '每日登录',
        correct: true,
      },
      Date.now(),
    ).run();
    const saved = await bindings()
      .DB.prepare(
        'SELECT points, day FROM learning_activity WHERE user_id = ? AND event_id = ?',
      )
      .bind(user, eventId)
      .first<{ points: number; day: string }>();
    return json({ points: saved?.points ?? 0, day, checkedIn: true });
  } catch (error) {
    return errorResponse(error);
  }
}

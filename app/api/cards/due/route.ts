import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { resolveUser } from '@/lib/identity';
import { getDueCards, getStats, getLessonProgress } from '@/lib/cards';
import { getNewPerDay } from '@/lib/settings';
import { SESSION_COOKIE } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GROUPS_ENABLED = process.env.GROUPS_ENABLED === 'true';

/** GET /api/cards/due — kartice + progres + napredak po lekciji. Identitet iz kolačića. */
export async function GET() {
  try {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    const user = await resolveUser(token);
    const groupFilter = GROUPS_ENABLED && !user.isDev ? user.groups : null;
    const newPerDay = await getNewPerDay();

    const [cards, stats, lessons] = await Promise.all([
      getDueCards(user.userId, groupFilter, newPerDay),
      getStats(user.userId, groupFilter, newPerDay),
      getLessonProgress(user.userId, groupFilter),
    ]);

    return NextResponse.json({
      cards,
      stats,
      lessons,
      name: user.name,
      dev: user.isDev,
      isAdmin: user.isAdmin,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Greška' }, { status: 500 });
  }
}

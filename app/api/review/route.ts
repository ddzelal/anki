import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { resolveUser } from '@/lib/identity';
import { submitReview } from '@/lib/cards';
import { RATING } from '@/lib/fsrs';
import { SESSION_COOKIE } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/review — body: { cardKey, rating }. Identitet iz session kolačića. */
export async function POST(req: Request) {
  let body: { cardKey?: string; rating?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Neispravan JSON' }, { status: 400 });
  }
  const { cardKey, rating } = body;
  if (!cardKey || typeof cardKey !== 'string' || !rating || !(rating in RATING)) {
    return NextResponse.json({ error: 'Neispravan zahtev' }, { status: 400 });
  }
  try {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    const user = await resolveUser(token);
    const r = await submitReview(user.userId, cardKey, RATING[rating as keyof typeof RATING]);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Greška' }, { status: 500 });
  }
}

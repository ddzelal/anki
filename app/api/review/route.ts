import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/identity';
import { submitReview } from '@/lib/cards';
import { RATING } from '@/lib/fsrs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/review — body: { cardId, rating: 'again'|'hard'|'good'|'easy' }. */
export async function POST(req: Request) {
  let body: { cardId?: number; rating?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Neispravan JSON' }, { status: 400 });
  }
  const { cardId, rating } = body;
  if (!cardId || !rating || !(rating in RATING)) {
    return NextResponse.json({ error: 'Neispravan zahtev' }, { status: 400 });
  }
  try {
    const user = await getCurrentUser();
    const r = await submitReview(user.userId, Number(cardId), RATING[rating as keyof typeof RATING]);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Greška';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

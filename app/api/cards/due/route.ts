import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/identity';
import { getDueCards } from '@/lib/cards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/cards/due — due kartice za trenutnog korisnika. */
export async function GET() {
  try {
    const user = await getCurrentUser();
    // dev mod: bez filtracije po grupama (null) -> sve aktivne kartice
    const cards = await getDueCards(user.userId, null);
    return NextResponse.json({ cards, dev: user.isDev });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Greška';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

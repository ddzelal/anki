import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { runSync } from '@/lib/sync';
import { resolveUser } from '@/lib/identity';
import { SESSION_COOKIE } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/sync — dozvoljeno ako je korisnik admin (LTI instruktor/admin, iz kolačića)
 * ILI ako je poslata ispravna SYNC_SECRET (fallback za CLI/eksterno).
 */
export async function POST(req: Request) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const user = await resolveUser(token);
  const secret = req.headers.get('x-sync-secret');
  const secretOk = !!process.env.SYNC_SECRET && secret === process.env.SYNC_SECRET;

  if (!user.isAdmin && !secretOk) {
    return NextResponse.json({ error: 'Nemaš dozvolu' }, { status: 401 });
  }

  try {
    const r = await runSync();
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Sync greška' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { runSync } from '@/lib/sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/sync — zaštićeno SYNC_SECRET-om (header x-sync-secret). */
export async function POST(req: Request) {
  const secret = req.headers.get('x-sync-secret');
  if (!process.env.SYNC_SECRET || secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: 'Neispravna tajna' }, { status: 401 });
  }
  try {
    const r = await runSync();
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Sync greška';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

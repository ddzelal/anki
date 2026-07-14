import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { resolveUser } from '@/lib/identity';
import { buildStudy } from '@/lib/cards';
import { getDeck, filterVisible } from '@/lib/sheets';
import { newPerDay } from '@/lib/settings';
import { SESSION_COOKIE } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GROUPS_ENABLED = process.env.GROUPS_ENABLED === 'true';

/**
 * GET /api/cards/due — kartice + progres + napredak po lekciji.
 * Reči se čitaju UŽIVO iz Google Sheet-a (keširano ~5min); ?fresh=1 probije keš.
 * Identitet iz session kolačića; grupno filtriranje u JS-u.
 */
export async function GET(req: Request) {
  try {
    const fresh = new URL(req.url).searchParams.get('fresh') === '1';
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    const user = await resolveUser(token);

    const deck = await getDeck(fresh);
    // Model B filtriranje samo za prave studente. Admin i dev (bez sesije) vide SVE
    // (preview/lokalni rad) — inače bi nastavnik u nijednoj grupi video prazno.
    const groupFilter =
      GROUPS_ENABLED && !user.isDev && !user.isAdmin ? user.groups : null;
    const visible = filterVisible(deck.cards, groupFilter);

    const study = await buildStudy(user.userId, visible, newPerDay(deck.settings));

    return NextResponse.json({
      ...study,
      name: user.name,
      dev: user.isDev,
      isAdmin: user.isAdmin,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Greška' }, { status: 500 });
  }
}

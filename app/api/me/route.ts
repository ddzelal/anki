import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { resolveUser } from '@/lib/identity';
import { SESSION_COOKIE } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/me — ko je ulogovan i da li je admin (za UI). */
export async function GET() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const user = await resolveUser(token);
  const groupsDebug =
    process.env.GROUPS_DEBUG === 'true' || process.env.GROUPS_ENABLED === 'true';
  return NextResponse.json({
    name: user.name,
    isAdmin: user.isAdmin,
    dev: user.isDev,
    groups: user.groups,
    groupsRaw: user.groupsRaw ?? null,
    groupsDebug,
  });
}

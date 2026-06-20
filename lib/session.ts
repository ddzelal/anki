import jwt from 'jsonwebtoken';

/**
 * Trajni session kolačić (potpisan LTI_KEY-om) koji se postavi pri LTI launch-u.
 * Nosi identitet -> app radi na refresh bez oslanjanja na ltik u URL-u.
 */
export const SESSION_COOKIE = 'anki_session';

export interface Session {
  sub: string; // Moodle user id (stabilan)
  name: string | null;
  groups: string[]; // ID-evi Moodle grupa ovog korisnika (iz custom parametra; prazno ako nije uključeno)
  isAdmin: boolean; // instruktor/admin u Moodle-u
  groupsRaw?: string; // originalna vrednost custom parametra groupids (dijagnostika)
}

const SECRET = () => process.env.LTI_KEY ?? '';

export function signSession(s: Session): string {
  return jwt.sign(s, SECRET(), { expiresIn: '30d' });
}

export function verifySession(token: string | undefined | null): Session | null {
  if (!token) return null;
  try {
    const p = jwt.verify(token, SECRET()) as Session;
    return {
      sub: p.sub,
      name: p.name ?? null,
      groups: Array.isArray(p.groups) ? p.groups : [],
      isAdmin: !!p.isAdmin,
      groupsRaw: typeof p.groupsRaw === 'string' ? p.groupsRaw : undefined,
    };
  } catch {
    return null;
  }
}

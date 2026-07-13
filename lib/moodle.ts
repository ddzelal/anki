/**
 * Moodle Web Services (REST) — pouzdan dohvat grupa studenta u kursu.
 *
 * Zašto: custom-param supstitucija `$Moodle.Person.userGroupIds` na ovom Moodle-u
 * vraća PRAZNO iako je student u grupi (potvrđeno na /admin dijagnostici). Web Services
 * `core_group_get_course_user_groups` vraća grupe deterministički — sa ID-em I IMENOM.
 *
 * Podešavanje u Moodle-u (jednom, kao admin):
 *   1) Site administration → General → Advanced features → Enable web services = ON
 *   2) Server → Web services → Manage protocols → REST = ON
 *   3) Server → Web services → External services → Add:
 *        - dodaj funkciju `core_group_get_course_user_groups`
 *      → Create token (za usera sa `moodle/site:accessallgroups`, npr. admin/menadžer)
 *   4) Vercel env: MOODLE_WS_TOKEN=<token>   (MOODLE_PLATFORM_URL je već postavljen)
 */

export interface MoodleGroup {
  id: number;
  name: string;
  idnumber?: string;
}

/**
 * Grupe u kojima je `userId` unutar kursa `courseId`. Prazno ako WS nije podešen
 * ili poziv ne uspe (nikad ne baca — launch se ne sme srušiti zbog ovoga).
 */
export async function fetchUserCourseGroups(
  courseId: string,
  userId: string,
): Promise<MoodleGroup[]> {
  const base = process.env.MOODLE_PLATFORM_URL;
  const token = process.env.MOODLE_WS_TOKEN;
  if (!base || !token || !courseId || !userId) return [];

  const body = new URLSearchParams({
    wstoken: token,
    wsfunction: 'core_group_get_course_user_groups',
    moodlewsrestformat: 'json',
    courseid: String(courseId),
    userid: String(userId),
  });

  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/webservice/rest/server.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(4000),
    });
    const data: unknown = await res.json();

    // Moodle greške dolaze kao {exception, errorcode, message}
    if (data && typeof data === 'object' && 'exception' in data) {
      console.error('[MOODLE_WS] greška:', JSON.stringify(data));
      return [];
    }
    const groups =
      data && typeof data === 'object' && Array.isArray((data as { groups?: unknown }).groups)
        ? (data as { groups: unknown[] }).groups
        : [];
    return groups
      .map((g) => g as { id?: unknown; name?: unknown; idnumber?: unknown })
      .map((g) => ({
        id: Number(g.id),
        name: String(g.name ?? '').trim(),
        idnumber: g.idnumber ? String(g.idnumber).trim() : undefined,
      }))
      .filter((g) => Number.isFinite(g.id) && g.name.length > 0);
  } catch (e) {
    console.error('[MOODLE_WS] fetch nije uspeo:', e instanceof Error ? e.message : e);
    return [];
  }
}

/**
 * Izvuci Moodle course id iz LTI launch tokena, bez potrebe za dodatnim custom parametrom:
 *   1) custom.courseid (ako neko doda `courseid=$Context.id`)
 *   2) iz NRPS URL-a `.../CourseSection/<courseid>/bindings/...` (uvek prisutan kad je NRPS ON)
 *   3) platformContext.context.id (poslednja opcija)
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export function courseIdFromToken(token: any): string {
  const pc = token?.platformContext ?? {};
  const custom = pc.custom ?? {};
  if (custom.courseid) return String(custom.courseid).trim();

  const nrps = String(
    custom.context_memberships_url ?? pc.namesRoles?.context_memberships_url ?? '',
  );
  const m = nrps.match(/\/CourseSection\/(\d+)\//);
  if (m) return m[1];

  if (pc.context?.id) return String(pc.context.id).trim();
  return '';
}

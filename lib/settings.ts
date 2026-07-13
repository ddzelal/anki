/**
 * App podešavanja dolaze iz `Settings` taba u Google Sheet-u (čitaju se sa deck-om, keširano).
 * Više nema `anki_settings` tabele.
 */

const DEFAULTS: Record<string, string> = {
  new_per_day: '10',
};

export function getSetting(settings: Record<string, string>, key: string): string | null {
  return settings[key] ?? DEFAULTS[key] ?? null;
}

/** Dnevni limit NOVIH reči po korisniku (default 10). */
export function newPerDay(settings: Record<string, string>): number {
  const v = getSetting(settings, 'new_per_day');
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 10;
}

import { pool } from './db';

const DEFAULTS: Record<string, string> = {
  new_per_day: '10',
};

export async function getSetting(key: string): Promise<string | null> {
  const { rows } = await pool.query(
    `select value from public.anki_settings where key = $1`,
    [key],
  );
  return rows[0]?.value ?? DEFAULTS[key] ?? null;
}

/** Dnevni limit NOVIH reči po korisniku (default 10). */
export async function getNewPerDay(): Promise<number> {
  const v = await getSetting('new_per_day');
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 10;
}

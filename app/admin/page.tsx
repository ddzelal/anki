'use client';

import { useEffect, useState } from 'react';

interface Me {
  name: string | null;
  isAdmin: boolean;
  groups: string[];
  groupsRaw: string | null;
  groupsDebug: boolean;
}

export default function AdminPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [secret, setSecret] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('sync_secret') ?? '' : '',
  );
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((d) =>
        setMe({
          name: d.name ?? null,
          isAdmin: Boolean(d.isAdmin),
          groups: Array.isArray(d.groups) ? d.groups : [],
          groupsRaw: typeof d.groupsRaw === 'string' ? d.groupsRaw : null,
          groupsDebug: Boolean(d.groupsDebug),
        }),
      )
      .catch(() =>
        setMe({ name: null, isAdmin: false, groups: [], groupsRaw: null, groupsDebug: false }),
      );
  }, []);

  const isAdmin = me?.isAdmin ?? false;

  async function sync() {
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      const headers: Record<string, string> = {};
      if (!isAdmin) {
        localStorage.setItem('sync_secret', secret);
        headers['x-sync-secret'] = secret;
      }
      const res = await fetch('/api/sync', { method: 'POST', headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Greška');
      setResult(
        `Sinhronizovano: ${data.cards} kartica, ${data.groupTags} grupa-oznaka, ${data.settings} podešavanja.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Greška');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh bg-ulum-paper text-ulum-ink flex flex-col items-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-1">
          <span className="grid place-items-center w-8 h-8 rounded-lg bg-ulum-blue text-white text-sm font-bold">
            ع
          </span>
          <h1 className="text-2xl font-bold text-ulum-blue">Admin</h1>
        </div>
        <p className="text-ulum-ink/60 text-sm mb-8">
          Sinhronizacija kartica iz Google Sheet-a u bazu.
        </p>

        <div className="rounded-2xl bg-white shadow-sm p-6">
          {isAdmin ? (
            <p className="text-sm text-ulum-ink/70 mb-4">
              Ulogovan kao <span className="font-semibold text-ulum-ink">{me?.name ?? 'admin'}</span>{' '}
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-ulum-blue/10 text-ulum-blue font-semibold">
                admin
              </span>
              . Tajna nije potrebna.
            </p>
          ) : (
            <>
              <label className="block text-sm font-medium text-ulum-ink/70 mb-2">Sync tajna</label>
              <input
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="SYNC_SECRET"
                className="w-full px-3 py-2.5 rounded-lg bg-ulum-paper border border-ulum-cream outline-none focus:border-ulum-green mb-4"
              />
              <p className="text-xs text-ulum-ink/50 mb-4">
                Nisi prepoznat kao admin. Uđi iz Moodle-a kao instruktor, ili unesi tajnu.
              </p>
            </>
          )}

          <button
            onClick={sync}
            disabled={busy || (!isAdmin && !secret)}
            className="w-full py-3 rounded-xl bg-ulum-green text-white font-medium hover:bg-ulum-green-dark disabled:opacity-50 transition-colors"
          >
            {busy ? 'Sinhronizacija…' : 'Pokreni Sync'}
          </button>

          {result && <p className="mt-4 text-ulum-green-dark text-sm">{result}</p>}
          {error && <p className="mt-4 text-ulum-pink text-sm">{error}</p>}
        </div>

        {me?.groupsDebug && (
          <div className="rounded-2xl bg-white shadow-sm p-6 mt-4">
            <h2 className="text-sm font-semibold text-ulum-blue mb-1">
              Moodle grupe (dijagnostika)
            </h2>
            <p className="text-xs text-ulum-ink/50 mb-4">
              Grupe stižu iz custom parametra{' '}
              <code className="px-1 rounded bg-ulum-paper">groupids=$Moodle.Person.userGroupIds</code>{' '}
              (postavi ga u Moodle External Tool → Custom parameters). Moodle šalje{' '}
              <strong>ID-eve</strong> grupa u kojima je ulogovani korisnik. U zaglavlja kolona u
              CardsV2 upiši <code className="px-1 rounded bg-ulum-paper">Ime (ID)</code>, npr.{' '}
              <code className="px-1 rounded bg-ulum-paper">arapski_jezik_decembar_2025 (7)</code>.
            </p>

            <div className="text-xs font-medium text-ulum-ink/60 mb-1">
              Custom parametar (sirovo)
            </div>
            {me.groupsRaw === null || me.groupsRaw === '' ? (
              <p className="text-sm text-ulum-pink mb-3">
                Nije stigao (prazno). Dodaj{' '}
                <code className="px-1 rounded bg-ulum-paper">groupids=$Moodle.Person.userGroupIds</code>{' '}
                u Custom parameters i sačuvaj alat. Napomena: nastavnik često nije ni u jednoj
                grupi — tada je prazno i kad je sve dobro podešeno.
              </p>
            ) : (
              <code className="block text-[12px] px-2 py-1 rounded-md bg-ulum-paper border border-ulum-cream text-ulum-ink select-all mb-3">
                {me.groupsRaw}
              </code>
            )}

            <div className="text-xs font-medium text-ulum-ink/60 mb-1">
              Tvoje grupe (ID-evi koje vidi app)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {me.groups.length === 0 ? (
                <span className="text-sm text-ulum-ink/50">— (nijedan ID)</span>
              ) : (
                me.groups.map((g) => (
                  <code
                    key={g}
                    className="text-[12px] px-2 py-1 rounded-md bg-ulum-green/10 border border-ulum-green/30 text-ulum-green-dark select-all"
                  >
                    {g}
                  </code>
                ))
              )}
            </div>
          </div>
        )}

        <p className="text-ulum-ink/40 text-xs mt-4">
          Sync prepisuje kartice i podešavanja iz Sheet-a; napredak studenata ostaje netaknut.
        </p>
      </div>
    </main>
  );
}

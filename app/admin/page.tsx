'use client';

import { useEffect, useState } from 'react';

export default function AdminPage() {
  const [me, setMe] = useState<{ name: string | null; isAdmin: boolean } | null>(null);
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSecret(localStorage.getItem('sync_secret') ?? '');
    fetch('/api/me')
      .then((r) => r.json())
      .then((d) => setMe({ name: d.name ?? null, isAdmin: Boolean(d.isAdmin) }))
      .catch(() => setMe({ name: null, isAdmin: false }));
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

        <p className="text-ulum-ink/40 text-xs mt-4">
          Sync prepisuje kartice i podešavanja iz Sheet-a; napredak studenata ostaje netaknut.
        </p>
      </div>
    </main>
  );
}

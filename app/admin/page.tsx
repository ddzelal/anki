'use client';

import { useEffect, useState } from 'react';

export default function AdminPage() {
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSecret(localStorage.getItem('sync_secret') ?? '');
  }, []);

  async function sync() {
    setBusy(true);
    setResult(null);
    setError(null);
    localStorage.setItem('sync_secret', secret);
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'x-sync-secret': secret },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Greška');
      setResult(`Sinhronizovano: ${data.cards} kartica, ${data.access} pristupa.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Greška');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh bg-neutral-950 text-neutral-100 flex flex-col items-center px-4 py-12">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold mb-1">Admin</h1>
        <p className="text-neutral-400 text-sm mb-8">
          Sinhronizacija kartica iz Google Sheet-a u bazu.
        </p>

        <div className="rounded-2xl bg-neutral-900 border border-neutral-800 p-6">
          <label className="block text-sm text-neutral-300 mb-2">Sync tajna</label>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="SYNC_SECRET"
            className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 outline-none focus:border-neutral-500 mb-4"
          />
          <button
            onClick={sync}
            disabled={busy || !secret}
            className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-medium disabled:opacity-50"
          >
            {busy ? 'Sinhronizacija…' : 'Pokreni Sync'}
          </button>

          {result && <p className="mt-4 text-emerald-400 text-sm">{result}</p>}
          {error && <p className="mt-4 text-rose-400 text-sm">{error}</p>}
        </div>

        <p className="text-neutral-500 text-xs mt-4">
          Sync prepisuje kartice i pristup iz Sheet-a; napredak studenata ostaje netaknut.
        </p>
      </div>
    </main>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';

interface Card {
  id: number;
  front: string;
  back: string;
  lesson: string;
  is_new: boolean;
}

type Rating = 'again' | 'hard' | 'good' | 'easy';

const RATINGS: { key: Rating; label: string; cls: string }[] = [
  { key: 'again', label: 'Ponovo', cls: 'bg-rose-600 hover:bg-rose-500' },
  { key: 'hard', label: 'Teško', cls: 'bg-amber-600 hover:bg-amber-500' },
  { key: 'good', label: 'Dobro', cls: 'bg-emerald-600 hover:bg-emerald-500' },
  { key: 'easy', label: 'Lako', cls: 'bg-sky-600 hover:bg-sky-500' },
];

export default function StudyPage() {
  const [queue, setQueue] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showBack, setShowBack] = useState(false);
  const [done, setDone] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setShowBack(false);
    try {
      const res = await fetch('/api/cards/due');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Greška');
      setQueue(data.cards);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Greška');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const card = queue[0];

  async function rate(rating: Rating) {
    if (!card || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId: card.id, rating }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? 'Greška');
      }
      setQueue((q) => q.slice(1));
      setShowBack(false);
      setDone((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Greška');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-dvh bg-neutral-950 text-neutral-100 flex flex-col items-center px-4 py-8">
      <header className="w-full max-w-xl flex items-center justify-between mb-8">
        <span className="text-sm text-neutral-400">Anki — Arapski</span>
        <span className="text-sm text-neutral-400">
          Preostalo: {queue.length} · Urađeno: {done}
        </span>
      </header>

      {loading && <p className="text-neutral-400 mt-20">Učitavanje…</p>}

      {error && (
        <div className="mt-20 text-center">
          <p className="text-rose-400 mb-4">{error}</p>
          <button onClick={load} className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700">
            Pokušaj ponovo
          </button>
        </div>
      )}

      {!loading && !error && !card && (
        <div className="mt-24 text-center">
          <p className="text-2xl mb-2">🎉 Gotovo za sada!</p>
          <p className="text-neutral-400 mb-6">Nema više dospelih kartica.</p>
          <button onClick={load} className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700">
            Osveži
          </button>
        </div>
      )}

      {!loading && !error && card && (
        <div className="w-full max-w-xl flex flex-col items-center">
          <div className="mb-4 flex gap-2">
            <span className="text-xs px-2 py-1 rounded-full bg-neutral-800 text-neutral-300">
              {card.lesson}
            </span>
            {card.is_new && (
              <span className="text-xs px-2 py-1 rounded-full bg-indigo-900/60 text-indigo-300">
                nova
              </span>
            )}
          </div>

          <div className="w-full min-h-64 rounded-2xl bg-neutral-900 border border-neutral-800 flex flex-col items-center justify-center p-8 gap-6">
            <p dir="auto" className="text-4xl md:text-5xl text-center leading-relaxed">
              {card.front}
            </p>
            {showBack && (
              <>
                <hr className="w-1/2 border-neutral-800" />
                <p dir="auto" className="text-3xl md:text-4xl text-center text-emerald-300 leading-relaxed">
                  {card.back}
                </p>
              </>
            )}
          </div>

          <div className="w-full mt-6">
            {!showBack ? (
              <button
                onClick={() => setShowBack(true)}
                className="w-full py-4 rounded-xl bg-neutral-100 text-neutral-900 font-medium hover:bg-white"
              >
                Prikaži odgovor
              </button>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {RATINGS.map((r) => (
                  <button
                    key={r.key}
                    disabled={submitting}
                    onClick={() => rate(r.key)}
                    className={`py-4 rounded-xl font-medium text-white disabled:opacity-50 ${r.cls}`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

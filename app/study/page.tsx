'use client';

import { useCallback, useEffect, useState } from 'react';

interface Card {
  key: string;
  front: string;
  back: string;
  lesson: string;
  is_new: boolean;
}

interface Stats {
  total: number;
  learned: number;
  started: number;
  fresh: number;
  due: number;
  newPerDay: number;
  newToday: number;
  newLeft: number;
  streak: number;
}

interface LessonProgress {
  lesson: string;
  total: number;
  learned: number;
}

type Rating = 'again' | 'hard' | 'good' | 'easy';

const RATINGS: { key: Rating; label: string; cls: string }[] = [
  { key: 'again', label: 'Ponovo', cls: 'bg-ulum-pink hover:brightness-110 text-white' },
  { key: 'hard', label: 'Teško', cls: 'bg-ulum-yellow hover:brightness-105 text-ulum-ink' },
  { key: 'good', label: 'Dobro', cls: 'bg-ulum-green hover:bg-ulum-green-dark text-white' },
  { key: 'easy', label: 'Lako', cls: 'bg-ulum-blue hover:bg-ulum-blue-dark text-white' },
];

function StatChip({ label, value, tone }: { label: string; value: string | number; tone: string }) {
  return (
    <div className="flex flex-col items-center px-3 py-2 rounded-xl bg-ulum-cream/60">
      <span className={`text-xl font-bold ${tone}`}>{value}</span>
      <span className="text-[11px] text-ulum-ink/60">{label}</span>
    </div>
  );
}

function dani(n: number) {
  return n === 1 ? 'dan' : 'dana';
}

export default function StudyPage() {
  const [queue, setQueue] = useState<Card[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [lessons, setLessons] = useState<LessonProgress[]>([]);
  const [name, setName] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showBack, setShowBack] = useState(false);
  const [showLessons, setShowLessons] = useState(false);
  const [done, setDone] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (fresh = false) => {
    setLoading(true);
    setError(null);
    setShowBack(false);
    try {
      const res = await fetch(`/api/cards/due${fresh ? '?fresh=1' : ''}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Greška');
      setQueue(data.cards);
      setStats(data.stats ?? null);
      setLessons(data.lessons ?? []);
      setName(data.name ?? null);
      setIsAdmin(Boolean(data.isAdmin));
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
        body: JSON.stringify({ cardKey: card.key, rating }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? 'Greška');
      }
      setQueue((q) => q.slice(1));
      setStats((s) => (s ? { ...s, due: Math.max(0, s.due - 1) } : s));
      setShowBack(false);
      setDone((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Greška');
    } finally {
      setSubmitting(false);
    }
  }

  const pct = stats && stats.total > 0 ? Math.round((stats.learned / stats.total) * 100) : 0;

  return (
    <main className="min-h-dvh bg-ulum-paper text-ulum-ink flex flex-col items-center px-4 py-6">
      {/* Top bar */}
      <header className="w-full max-w-2xl flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <span className="grid place-items-center w-8 h-8 rounded-lg bg-ulum-blue text-white text-sm font-bold">
            ع
          </span>
          <div className="leading-tight">
            <div className="text-ulum-blue font-bold text-sm">Ulum — Arapske kartice</div>
            <div className="text-[11px] text-ulum-ink/50">Online akademija</div>
          </div>
        </div>
        <div className="relative flex items-center gap-2">
          {name && (
            <span className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white shadow-sm text-sm font-medium text-ulum-ink">
              <span className="grid place-items-center w-6 h-6 rounded-full bg-ulum-green/20 text-ulum-green text-xs font-bold">
                {name.trim().charAt(0).toUpperCase() || '?'}
              </span>
              {name}
              {isAdmin && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-ulum-blue/10 text-ulum-blue font-semibold">
                  admin
                </span>
              )}
            </span>
          )}
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Meni"
            className="grid place-items-center w-9 h-9 rounded-full bg-white shadow-sm text-ulum-ink/70 hover:text-ulum-blue"
          >
            <span className="text-lg leading-none">≡</span>
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-2 w-60 rounded-xl bg-white shadow-lg ring-1 ring-black/5 p-1.5 z-20 text-sm">
              {isAdmin && (
                <>
                  <a
                    href="/admin"
                    className="block px-3 py-2 rounded-lg hover:bg-ulum-cream text-ulum-ink"
                  >
                    ⚙️ Admin panel
                  </a>
                  <div className="my-1 border-t border-ulum-cream" />
                </>
              )}
              <button
                onClick={() => {
                  setMenuOpen(false);
                  load(true);
                }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-ulum-cream"
              >
                ↻ Osveži iz Sheet-a
              </button>
              <a href="/" className="block px-3 py-2 rounded-lg hover:bg-ulum-cream text-ulum-ink">
                🏠 Početna
              </a>
            </div>
          )}
        </div>
      </header>

      {/* Progress card */}
      {stats && (
        <section className="w-full max-w-2xl mb-6 rounded-2xl bg-white shadow-sm p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-ulum-blue">Tvoj napredak</span>
            <div className="flex items-center gap-3">
              {stats.streak > 0 && (
                <span className="text-sm font-semibold text-ulum-pink">
                  🔥 {stats.streak} {dani(stats.streak)}
                </span>
              )}
              <span className="text-sm font-bold text-ulum-green">{pct}%</span>
            </div>
          </div>
          <div className="h-2.5 w-full rounded-full bg-ulum-cream overflow-hidden mb-4">
            <div
              className="h-full rounded-full bg-ulum-green transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="grid grid-cols-4 gap-2">
            <StatChip label="Ukupno" value={stats.total} tone="text-ulum-blue" />
            <StatChip label="Naučeno" value={stats.learned} tone="text-ulum-green" />
            <StatChip label="Za danas" value={stats.due} tone="text-ulum-pink" />
            <StatChip
              label="Nove danas"
              value={`${stats.newToday}/${stats.newPerDay}`}
              tone="text-ulum-ink"
            />
          </div>

          {lessons.length > 0 && (
            <div className="mt-4">
              <button
                onClick={() => setShowLessons((v) => !v)}
                className="text-xs font-medium text-ulum-blue/80 hover:text-ulum-blue"
              >
                {showLessons ? '▾ Sakrij napredak po lekciji' : '▸ Napredak po lekciji'}
              </button>
              {showLessons && (
                <ul className="mt-3 space-y-2">
                  {lessons.map((l) => {
                    const p = l.total > 0 ? Math.round((l.learned / l.total) * 100) : 0;
                    return (
                      <li key={l.lesson} className="flex items-center gap-3 text-xs">
                        <span className="w-20 shrink-0 text-ulum-ink/70">{l.lesson}</span>
                        <div className="h-1.5 flex-1 rounded-full bg-ulum-cream overflow-hidden">
                          <div className="h-full rounded-full bg-ulum-green" style={{ width: `${p}%` }} />
                        </div>
                        <span className="w-12 shrink-0 text-right text-ulum-ink/50">
                          {l.learned}/{l.total}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </section>
      )}

      {loading && <p className="text-ulum-ink/50 mt-16">Učitavanje…</p>}

      {error && (
        <div className="mt-16 text-center">
          <p className="text-ulum-pink mb-4">{error}</p>
          <button
            onClick={() => load()}
            className="px-4 py-2 rounded-lg bg-ulum-blue text-white hover:bg-ulum-blue-dark"
          >
            Pokušaj ponovo
          </button>
        </div>
      )}

      {!loading && !error && !card && (
        <div className="mt-12 text-center">
          <div className="text-5xl mb-3">🎉</div>
          <p className="text-xl font-semibold text-ulum-blue mb-1">Gotovo za danas!</p>
          <p className="text-ulum-ink/60 mb-6">
            Odlično — ocenio si {done} {done === 1 ? 'karticu' : 'kartica'}. Vrati se sutra za nove.
          </p>
          <button
            onClick={() => load()}
            className="px-5 py-2.5 rounded-xl bg-ulum-green text-white font-medium hover:bg-ulum-green-dark"
          >
            Osveži
          </button>
        </div>
      )}

      {!loading && !error && card && (
        <div className="w-full max-w-2xl flex flex-col items-center">
          <div className="mb-3 flex gap-2">
            <span className="text-xs px-2.5 py-1 rounded-full bg-ulum-blue/10 text-ulum-blue font-medium">
              {card.lesson}
            </span>
            {card.is_new && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-ulum-yellow/40 text-ulum-ink font-medium">
                nova
              </span>
            )}
          </div>

          <div className="w-full min-h-72 rounded-3xl bg-white shadow-md flex flex-col items-center justify-center p-8 gap-6">
            <p dir="auto" className="text-5xl md:text-6xl text-center leading-relaxed text-ulum-blue">
              {card.front}
            </p>
            {showBack && (
              <>
                <hr className="w-1/3 border-ulum-cream" />
                <p
                  dir="auto"
                  className="text-3xl md:text-4xl text-center leading-relaxed text-ulum-green-dark"
                >
                  {card.back}
                </p>
              </>
            )}
          </div>

          <div className="w-full mt-5">
            {!showBack ? (
              <button
                onClick={() => setShowBack(true)}
                className="w-full py-4 rounded-2xl bg-ulum-blue text-white font-semibold text-lg hover:bg-ulum-blue-dark transition-colors"
              >
                Prikaži odgovor
              </button>
            ) : (
              <div className="grid grid-cols-4 gap-2.5">
                {RATINGS.map((r) => (
                  <button
                    key={r.key}
                    disabled={submitting}
                    onClick={() => rate(r.key)}
                    className={`py-4 rounded-2xl font-semibold disabled:opacity-50 transition ${r.cls}`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <p className="mt-5 text-xs text-ulum-ink/50">
            Preostalo u sesiji: {queue.length} · Urađeno: {done}
          </p>
        </div>
      )}
    </main>
  );
}

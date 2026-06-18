import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-dvh bg-ulum-paper text-ulum-ink flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-lg text-center">
        <div className="inline-grid place-items-center w-14 h-14 rounded-2xl bg-ulum-blue text-white text-2xl font-bold mb-6">
          ع
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-ulum-blue mb-2">
          Arapske kartice
        </h1>
        <p className="text-ulum-ink/60 mb-1">Ulum Academy — uči arapski jezik karticama</p>
        <p className="text-ulum-ink/40 text-sm mb-8">Spaced repetition (FSRS) · LTI za Moodle</p>

        <div className="flex gap-3 justify-center">
          <Link
            href="/study"
            className="px-6 py-3 rounded-xl bg-ulum-blue text-white font-medium hover:bg-ulum-blue-dark transition-colors"
          >
            Počni učenje
          </Link>
          <Link
            href="/admin"
            className="px-6 py-3 rounded-xl bg-white text-ulum-blue font-medium border border-ulum-blue/20 hover:bg-ulum-cream transition-colors"
          >
            Admin
          </Link>
        </div>
      </div>
    </main>
  );
}

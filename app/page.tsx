import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-dvh bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center px-4 gap-8">
      <div className="text-center">
        <h1 className="text-3xl font-semibold mb-2">Anki — Arapski</h1>
        <p className="text-neutral-400">Kartice za Moodle (LTI 1.3)</p>
      </div>
      <div className="flex gap-4">
        <Link
          href="/study"
          className="px-6 py-3 rounded-xl bg-neutral-100 text-neutral-900 font-medium hover:bg-white"
        >
          Uči
        </Link>
        <Link
          href="/admin"
          className="px-6 py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 font-medium"
        >
          Admin
        </Link>
      </div>
    </main>
  );
}

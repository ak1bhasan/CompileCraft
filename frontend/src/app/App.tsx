export default function App() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--cc-bg)] px-6">
      <section className="w-full max-w-lg rounded-xl border border-[var(--cc-border)] bg-[var(--cc-surface)] p-8 shadow-lg shadow-black/40">
        <p className="mb-2 text-sm font-medium tracking-wide text-[var(--cc-primary)]">
          CompileCraft
        </p>
        <h1 className="mb-3 text-3xl font-semibold text-[var(--cc-text)]">
          Frontend foundation ready
        </h1>
        <p className="text-[var(--cc-text-muted)]">
          React, TypeScript, Vite, Tailwind, Monaco, and Lucide are installed.
          IDE layout work starts in FE1.2.
        </p>
      </section>
    </main>
  )
}

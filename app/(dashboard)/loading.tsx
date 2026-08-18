import { Spinner } from '@/src/components/icons';

/**
 * Shown while a section's server component is still querying. It mirrors the shape every
 * screen has —header, indicator row, panel— so the layout does not jump when the real
 * content arrives, and it says what it is waiting for instead of only spinning.
 */
export default function Cargando() {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="mb-8 border-b border-line pb-5">
        <div className="h-7 w-56 bg-line motion-safe:animate-pulse" />
        <div className="mt-2 h-4 w-full max-w-2xl bg-line/60 motion-safe:animate-pulse" />
      </div>

      <div className="mb-6 grid grid-cols-2 border border-line bg-surface lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="border-r border-b border-line px-4 py-4 last:border-r-0">
            <div className="h-8 w-12 bg-line motion-safe:animate-pulse" />
            <div className="mt-2 h-3 w-24 bg-line/60 motion-safe:animate-pulse" />
          </div>
        ))}
      </div>

      <div className="border border-line bg-surface">
        <div className="border-b border-line px-4 py-2.5">
          <div className="h-3 w-32 bg-line motion-safe:animate-pulse" />
        </div>
        <p className="flex items-center justify-center gap-2 px-4 py-16 text-sm text-muted">
          <Spinner />
          Consultando la base de datos…
        </p>
      </div>
    </div>
  );
}

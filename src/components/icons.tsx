/**
 * The icon set, drawn here instead of installed. One family, one grid (24), one stroke
 * width, `currentColor` throughout, so an icon always matches the text it sits next to.
 * Icons are decorative in this app: every one of them has a visible label beside it, which
 * is why they are all `aria-hidden`. An icon-only control names itself with `aria-label`.
 */
import type { ReactNode } from 'react';

const TRAZOS = {
  tablero: <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />,
  turnos: <path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M8 3v4M16 3v4" />,
  proyeccion: <path d="M4 17l5-5 3 3 7-7M15 8h5v5" />,
  equipos: (
    <path d="M3 6h10v9H3zM13 9h4l3 3.5V15h-7zM7.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M16.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3" />
  ),
  operadores: (
    <path d="M16 19v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6M22 19v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  ),
  auditoria: (
    <path d="M9 4H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2M9 4a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2 2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2M9 12h6M9 16h4" />
  ),
  mas: <path d="M12 5v14M5 12h14" />,
  visto: <path d="M4.5 12.5l5 5 10-11" />,
  cerrar: <path d="M6 6l12 12M18 6L6 18" />,
  alerta: <path d="M12 9.5v4M12 17h.01M10.3 4.1L2.3 18a2 2 0 0 0 1.7 3h16a2 2 0 0 0 1.7-3L13.7 4.1a2 2 0 0 0-3.4 0z" />,
  taller: (
    <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" />
  ),
  bloqueado: <path d="M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5z" />,
  panel: <path d="M4 4h16v16H4zM10 4v16" />,
  salir: <path d="M15 12H3m0 0l4-4m-4 4l4 4M10 4h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-8" />,
  flecha: <path d="M4 12h16m0 0l-6-6m6 6l-6 6" />,
  desplegar: <path d="M6 9.5l6 6 6-6" />,
  persona: <path d="M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4.5 21v-1.5A5.5 5.5 0 0 1 10 14h4a5.5 5.5 0 0 1 5.5 5.5V21" />,
  reloj: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2" />,
} satisfies Record<string, ReactNode>;

export type NombreIcono = keyof typeof TRAZOS;

export function Icon({
  name,
  className = 'size-4 shrink-0',
}: {
  name: NombreIcono;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {TRAZOS[name]}
    </svg>
  );
}

/**
 * Spinner for a request already in flight. Linear rotation, because a constant-rate wait
 * should not appear to speed up or slow down. It stops under `prefers-reduced-motion`: the
 * button text next to it ("Guardando…") is what actually carries the meaning.
 */
export function Spinner({ className = 'size-4 shrink-0' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden
      className={`motion-safe:animate-spin ${className}`}
    >
      <circle cx="12" cy="12" r="9" className="opacity-25" />
      <path d="M21 12a9 9 0 0 0-9-9" />
    </svg>
  );
}

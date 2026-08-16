/**
 * Las cuatro piezas visuales que se repiten en todas las pantallas. No es una librería de
 * componentes: es lo mínimo para que las tablas se vean iguales entre sí.
 */
import type { ReactNode } from 'react';

import type { Tono } from './format';

const TONOS: Record<Tono, string> = {
  ok: 'border-emerald-700/30 bg-emerald-50 text-emerald-900',
  aviso: 'border-amber-700/40 bg-amber-50 text-amber-900',
  bloqueo: 'border-red-700/40 bg-red-50 text-red-900',
  taller: 'border-sky-700/30 bg-sky-50 text-sky-900',
  neutro: 'border-line bg-canvas text-muted',
};

export function Badge({ tono, children }: { tono: Tono; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-2 py-0.5 text-xs font-medium ${TONOS[tono]}`}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current opacity-70" />
      {children}
    </span>
  );
}

export function Encabezado({
  titulo,
  descripcion,
  acciones,
}: {
  titulo: string;
  descripcion?: string;
  acciones?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        {descripcion && <p className="mt-1 max-w-2xl text-sm text-muted">{descripcion}</p>}
      </div>
      {acciones}
    </header>
  );
}

export function Panel({
  titulo,
  children,
  className = '',
}: {
  titulo?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`border border-line bg-surface ${className}`}>
      {titulo && (
        <h2 className="rotulo border-b border-line px-4 py-2.5">{titulo}</h2>
      )}
      {children}
    </section>
  );
}

/** Barra de horómetro: `738,0 / 750,0 h` se entiende mejor viéndose que leyéndose. */
export function BarraHorometro({ actual, umbral }: { actual: number; umbral: number }) {
  const porcentaje = umbral > 0 ? Math.min(100, (actual / umbral) * 100) : 0;
  const color =
    porcentaje >= 100 ? 'bg-red-700' : porcentaje >= 90 ? 'bg-amber-600' : 'bg-emerald-700';

  return (
    <div className="h-1.5 w-28 bg-line" role="presentation">
      <div className={`h-full ${color}`} style={{ width: `${porcentaje}%` }} />
    </div>
  );
}

export const tabla = {
  wrapper: 'w-full overflow-x-auto',
  table: 'w-full min-w-[48rem] border-collapse text-sm',
  th: 'rotulo border-b border-line px-4 py-2.5 text-left whitespace-nowrap',
  td: 'border-b border-line/70 px-4 py-3 align-middle',
  num: 'border-b border-line/70 px-4 py-3 text-right font-mono align-middle',
};

export function Vacio({ children }: { children: ReactNode }) {
  return <p className="px-4 py-10 text-center text-sm text-muted">{children}</p>;
}

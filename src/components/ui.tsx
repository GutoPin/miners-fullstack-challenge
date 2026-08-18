/** The few visual pieces every screen repeats. Not a component library, just consistency. */
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
  id,
  titulo,
  descripcion,
  acciones,
  children,
  className = '',
}: {
  /** anchor target, for screens whose panels link to each other */
  id?: string;
  titulo?: string;
  descripcion?: string;
  acciones?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`border border-line bg-surface ${className}`}>
      {titulo && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <div>
            <h2 className="rotulo">{titulo}</h2>
            {descripcion && <p className="mt-0.5 text-xs text-muted">{descripcion}</p>}
          </div>
          {acciones}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * Callout for anything the screen has to say back to the user: what was saved, what is
 * missing, why an action is unavailable. `ok` announces politely because it follows an
 * action the user just took; `bloqueo` is left to the caller, which usually wants `alert`.
 */
export function Aviso({
  tono,
  titulo,
  children,
  className = '',
}: {
  tono: Tono;
  titulo?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tono === 'ok' ? 'status' : undefined}
      className={`border px-4 py-3 text-sm ${TONOS[tono]} ${className}`}
    >
      {titulo && <p className="font-medium">{titulo}</p>}
      {children && <div className={titulo ? 'mt-1' : ''}>{children}</div>}
    </div>
  );
}

// shared control classes: same idea as `tabla`, one place instead of a wrapper component
export const boton = {
  primario:
    'inline-flex min-h-11 items-center justify-center bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40',
  secundario:
    'inline-flex min-h-11 items-center justify-center border border-line bg-surface px-4 py-2.5 text-sm font-medium hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40',
  excepcion:
    'inline-flex min-h-11 items-center justify-center border border-accent px-4 py-2.5 text-sm font-medium text-accent hover:bg-accent hover:text-white disabled:cursor-not-allowed disabled:opacity-40',
  peligro:
    'inline-flex min-h-11 items-center justify-center bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40',
};

// native selects do not inherit the page colours on every platform, hence the explicit pair
export const campo = {
  input: 'block w-full border border-line bg-canvas px-3 py-2.5 text-sm text-ink',
  numero: 'block border border-line bg-canvas px-3 py-2.5 text-right font-mono text-sm text-ink',
};

/**
 * Hourmeter bullet: the fill is the hourmeter, the tick is the threshold that blocks the
 * unit, and the amber band is the last 10 % of the cycle. Shape first, numbers next to it.
 */
export function BarraHorometro({
  actual,
  umbral,
  ancho = 'w-28',
}: {
  actual: number;
  umbral: number;
  ancho?: string;
}) {
  const crudo = umbral > 0 ? (actual / umbral) * 100 : 0;
  const porcentaje = Math.min(100, crudo);
  const color = crudo >= 100 ? 'bg-red-700' : crudo >= 90 ? 'bg-amber-600' : 'bg-emerald-700';

  return (
    <div className={`relative h-2 ${ancho} bg-line`} role="presentation">
      {/* alert zone: the last 10 % before the threshold */}
      <div className="absolute inset-y-0 right-0 w-[10%] bg-amber-700/15" />
      <div className={`relative h-full ${color}`} style={{ width: `${porcentaje}%` }} />
      <div className="absolute -inset-y-0.5 right-0 w-px bg-ink" />
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

/** Empty state: says why it is empty and what to do about it, never a blank panel. */
export function Vacio({ children, accion }: { children: ReactNode; accion?: ReactNode }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-sm text-muted">{children}</p>
      {accion && <div className="mt-3">{accion}</div>}
    </div>
  );
}

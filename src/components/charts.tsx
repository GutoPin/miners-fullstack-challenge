/**
 * The three charts the operation actually decides with. Drawn by hand in SVG and CSS on
 * purpose: the shapes are simple, a charting library would be a dependency and a bundle for
 * three figures, and every one of them is rendered on the server next to the table that
 * carries the same numbers. The table is the accessible version; the chart is the shortcut.
 */
import { formatHoras } from './format';
import { formatIsoDate } from '../services/dates';

// ── margin vs. what is already scheduled ──

export interface FilaMargen {
  code: string;
  /** hours left before the threshold blocks the unit */
  margen: number;
  /** hours already committed in the shifts of the window */
  consumo: number;
  cruza: boolean;
}

/**
 * Bullet chart. The light band is the margin the unit has left, the bar is the work already
 * scheduled on it, and the tick is the threshold. A bar past the tick is a unit that will
 * stop mid-week, which is the whole question this screen answers.
 */
export function MargenVsConsumo({ filas }: { filas: FilaMargen[] }) {
  const max = Math.max(...filas.flatMap((f) => [f.margen, f.consumo]), 1);
  const cruzan = filas.filter((f) => f.cruza).length;

  return (
    <div
      className="space-y-2 px-4 py-4"
      role="img"
      aria-label={`Margen de horas contra horas ya programadas, ${filas.length} equipos. ${cruzan} superan su margen dentro de la ventana. El detalle está en la tabla siguiente.`}
    >
      {filas.map((f) => (
        <div key={f.code} className="flex items-center gap-3 text-xs">
          <span className="w-16 shrink-0 font-mono">{f.code}</span>

          <div className="relative h-5 flex-1 bg-canvas">
            <div
              className="absolute inset-y-0 left-0 bg-emerald-700/15"
              style={{ width: `${(f.margen / max) * 100}%` }}
            />
            <div
              className={`absolute top-1/2 left-0 h-2 -translate-y-1/2 ${
                f.cruza ? 'bg-red-700' : 'bg-emerald-700'
              }`}
              style={{ width: `${(f.consumo / max) * 100}%` }}
            />
            <div
              className="absolute inset-y-0 w-px bg-ink"
              style={{ left: `${(f.margen / max) * 100}%` }}
            />
          </div>

          <span
            className={`w-52 shrink-0 text-right ${f.cruza ? 'text-red-800' : 'text-muted'}`}
          >
            {formatHoras(f.consumo)} h programadas · margen {formatHoras(f.margen)} h
          </span>
        </div>
      ))}

      <p className="pt-1 text-xs text-muted">
        Banda clara: horas que le quedan al equipo antes del umbral. Barra: horas ya
        comprometidas en los turnos de la ventana. La marca vertical es el umbral: barra
        pasada la marca, el equipo se detiene a mitad de semana.
      </p>
    </div>
  );
}

// ── fleet available day by day ──

export interface DiaFlota {
  fecha: string;
  disponibles: number;
  detenidos: number;
}

/**
 * How much of the fleet is usable each day of the window. All columns add up to the same
 * total, so the red growing from the top is the capacity the plan is about to lose.
 */
export function DisponibilidadPorDia({ dias }: { dias: DiaFlota[] }) {
  const total = Math.max(...dias.map((d) => d.disponibles + d.detenidos), 1);
  const ultimo = dias[dias.length - 1];

  return (
    <div className="px-4 py-4">
      <div
        className="flex items-end gap-2"
        role="img"
        aria-label={`Equipos disponibles por día. Hoy ${dias[0]?.disponibles ?? 0} de ${total}; al final de la ventana ${ultimo?.disponibles ?? 0} de ${total}.`}
      >
        {dias.map((d) => (
          <div key={d.fecha} className="flex flex-1 flex-col items-center gap-1.5">
            <span className="font-mono text-sm">{d.disponibles}</span>

            <div className="flex h-28 w-full flex-col justify-end bg-canvas">
              {d.detenidos > 0 && (
                <div
                  className="w-full bg-red-700/70"
                  style={{ height: `${(d.detenidos / total) * 100}%` }}
                />
              )}
              <div
                className="w-full bg-emerald-700"
                style={{ height: `${(d.disponibles / total) * 100}%` }}
              />
            </div>

            <span className="text-[0.6875rem] text-muted">
              {formatIsoDate(d.fecha).slice(0, 5)}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 bg-emerald-700" /> Disponibles
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 bg-red-700/70" /> Detenidos por umbral,
          taller o baja
        </span>
        <span>Total de flota: {total} equipos.</span>
      </p>
    </div>
  );
}

// ── hourmeter over time ──

export interface PuntoHorometro {
  fecha: string;
  horas: number;
  mantenimiento: boolean;
}

const ANCHO = 640;
const ALTO = 160;
const MARGEN = { arriba: 12, abajo: 22, izq: 8, der: 8 };

/**
 * Accumulated hourmeter with the threshold drawn across it. The slope is how fast the unit
 * burns hours, the squares are its services, and the distance to the dashed line is how much
 * operation it has left. Together they say whether the next service falls this week or next
 * month, which two numbers in a table do not.
 */
export function HistorialHorometro({
  puntos,
  umbral,
}: {
  puntos: PuntoHorometro[];
  umbral: number;
}) {
  if (puntos.length < 2) return null;

  const horas = puntos.map((p) => p.horas);
  const techo = Math.max(...horas, umbral) * 1.02;
  const piso = Math.min(...horas) * 0.98;
  const rango = techo - piso || 1;

  const x = (i: number) =>
    MARGEN.izq + (i / (puntos.length - 1)) * (ANCHO - MARGEN.izq - MARGEN.der);
  const y = (h: number) =>
    MARGEN.arriba + (1 - (h - piso) / rango) * (ALTO - MARGEN.arriba - MARGEN.abajo);

  const linea = puntos.map((p, i) => `${x(i)},${y(p.horas)}`).join(' ');
  const area = `${MARGEN.izq},${y(piso)} ${linea} ${ANCHO - MARGEN.der},${y(piso)}`;
  const servicios = puntos.filter((p) => p.mantenimiento);

  return (
    <div className="px-4 py-4">
      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Horómetro acumulado en ${puntos.length} movimientos, de ${formatHoras(horas[0])} a ${formatHoras(horas[horas.length - 1])} horas, con el umbral en ${formatHoras(umbral)}. Los movimientos están listados en la bitácora de abajo.`}
      >
        <polygon points={area} className="fill-emerald-700/10" />
        <polyline
          points={linea}
          fill="none"
          className="stroke-emerald-700"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />

        {umbral <= techo && (
          <>
            <line
              x1={MARGEN.izq}
              x2={ANCHO - MARGEN.der}
              y1={y(umbral)}
              y2={y(umbral)}
              className="stroke-red-700"
              strokeWidth={1}
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={ANCHO - MARGEN.der}
              y={y(umbral) - 4}
              textAnchor="end"
              className="fill-red-800 text-[10px]"
            >
              umbral {formatHoras(umbral)} h
            </text>
          </>
        )}

        {puntos.map((p, i) =>
          p.mantenimiento ? (
            <rect
              key={p.fecha + i}
              x={x(i) - 3}
              y={y(p.horas) - 3}
              width={6}
              height={6}
              className="fill-sky-700"
            />
          ) : null,
        )}

        <text x={MARGEN.izq} y={ALTO - 6} className="fill-muted text-[10px]">
          {formatIsoDate(puntos[0].fecha)}
        </text>
        <text
          x={ANCHO - MARGEN.der}
          y={ALTO - 6}
          textAnchor="end"
          className="fill-muted text-[10px]"
        >
          {formatIsoDate(puntos[puntos.length - 1].fecha)}
        </text>
      </svg>

      <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-3 bg-emerald-700" /> Horómetro acumulado
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2 bg-sky-700" /> Mantenimiento ({servicios.length})
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-px w-3 border-t border-dashed border-red-700" /> Umbral
          de bloqueo
        </span>
      </p>
    </div>
  );
}

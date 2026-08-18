/**
 * The three charts the operation actually decides with. Drawn by hand in SVG and CSS on
 * purpose: the shapes are simple, a charting library would be a dependency and a bundle for
 * three figures, and every one of them is rendered on the server next to the table that
 * carries the same numbers. The table is the accessible version; the chart is the shortcut.
 */
import { diaSemana, formatHoras } from './format';
import { formatIsoDate } from '../services/dates';

/** shared legend row, so the three charts explain themselves the same way */
function Leyenda({ items }: { items: { color: string; label: string }[] }) {
  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span aria-hidden className={`size-2.5 shrink-0 ${i.color}`} />
          {i.label}
        </span>
      ))}
    </p>
  );
}

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
 * Bullet chart. The pale band is the margin the unit has left and the bar is the work already
 * scheduled on it, split where it runs past the threshold: green is the part the margin
 * covers, red the part it does not. A unit that shows red stops mid-week.
 */
export function MargenVsConsumo({ filas }: { filas: FilaMargen[] }) {
  const max = Math.max(...filas.flatMap((f) => [f.margen, f.consumo]), 1);
  const pct = (valor: number) => `${(Math.max(0, valor) / max) * 100}%`;
  const cruzan = filas.filter((f) => f.cruza).length;

  return (
    <div className="px-4 py-4">
      <div
        className="space-y-1"
        role="img"
        aria-label={`Margen de horas contra horas ya programadas, ${filas.length} equipos. ${cruzan} superan su margen dentro de la ventana. El detalle está en la tabla siguiente.`}
      >
        {filas.map((f) => {
          const cubierto = Math.min(f.consumo, f.margen);
          const exceso = Math.max(0, f.consumo - f.margen);

          return (
            <div key={f.code} className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-3">
              <span className="font-mono text-xs">{f.code}</span>

              <span className="relative block h-6 bg-canvas">
                {/* the margin available, as a pale ground the bar is read against */}
                <span
                  className="absolute inset-y-0 left-0 bg-emerald-700/12"
                  style={{ width: pct(f.margen) }}
                />
                <span
                  className="absolute top-1/2 left-0 h-2.5 -translate-y-1/2 bg-emerald-700"
                  style={{ width: pct(cubierto) }}
                />
                {exceso > 0 && (
                  <span
                    className="absolute top-1/2 h-2.5 -translate-y-1/2 bg-red-700"
                    style={{ left: pct(cubierto), width: pct(exceso) }}
                  />
                )}
                <span
                  aria-hidden
                  className="absolute inset-y-0 w-0.5 bg-ink"
                  style={{ left: pct(f.margen) }}
                />
              </span>

              <span className="text-right font-mono text-xs whitespace-nowrap">
                <span className={f.cruza ? 'text-red-800' : ''}>
                  {formatHoras(f.consumo)} h
                </span>
                <span className="text-muted"> / {formatHoras(f.margen)} h</span>
              </span>
            </div>
          );
        })}
      </div>

      <Leyenda
        items={[
          { color: 'bg-emerald-700', label: 'Horas programadas dentro del margen' },
          { color: 'bg-red-700', label: 'Horas que exceden el umbral' },
          { color: 'bg-emerald-700/12 border border-line', label: 'Margen disponible' },
          { color: 'bg-ink w-0.5', label: 'Umbral' },
        ]}
      />
    </div>
  );
}

// ── fleet available day by day ──

export interface DiaFlota {
  fecha: string;
  disponibles: number;
  detenidos: number;
}

const ANCHO = 640;
const ALTO = 210;

/**
 * How much of the fleet is usable each day of the window. Every column adds up to the same
 * total, so the red growing from the top is exactly the capacity the current plan gives away.
 */
export function DisponibilidadPorDia({ dias }: { dias: DiaFlota[] }) {
  const total = Math.max(...dias.map((d) => d.disponibles + d.detenidos), 1);

  const m = { arriba: 18, abajo: 40, izq: 26, der: 6 };
  const areaAlto = ALTO - m.arriba - m.abajo;
  const banda = (ANCHO - m.izq - m.der) / dias.length;
  const barra = Math.min(banda * 0.56, 46);

  const y = (valor: number) => m.arriba + areaAlto * (1 - valor / total);
  const centro = (i: number) => m.izq + banda * i + banda / 2;

  // 0, half and full: three references are enough to read a count
  const marcas = [0, Math.round(total / 2), total].filter((v, i, a) => a.indexOf(v) === i);
  const ultimo = dias[dias.length - 1];

  return (
    <div className="px-4 py-4">
      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Equipos disponibles por día. Hoy ${dias[0]?.disponibles ?? 0} de ${total}; al final de la ventana ${ultimo?.disponibles ?? 0} de ${total}.`}
      >
        {marcas.map((v) => (
          <g key={v}>
            <line
              x1={m.izq}
              x2={ANCHO - m.der}
              y1={y(v)}
              y2={y(v)}
              className="stroke-line"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={m.izq - 7}
              y={y(v) + 3.5}
              textAnchor="end"
              className="fill-muted text-[10px]"
            >
              {v}
            </text>
          </g>
        ))}

        {dias.map((d, i) => {
          const x = centro(i) - barra / 2;
          const altoDisp = areaAlto * (d.disponibles / total);
          const altoDet = areaAlto * (d.detenidos / total);
          const hoy = i === 0;

          return (
            <g key={d.fecha}>
              {d.detenidos > 0 && (
                <rect x={x} y={y(total)} width={barra} height={altoDet} className="fill-red-700/25" />
              )}
              <rect
                x={x}
                y={y(d.disponibles)}
                width={barra}
                height={altoDisp}
                className="fill-emerald-700"
              />

              <text
                x={centro(i)}
                y={y(d.disponibles) - 6}
                textAnchor="middle"
                className="fill-ink text-[11px] font-medium"
              >
                {d.disponibles}
              </text>

              <text
                x={centro(i)}
                y={ALTO - m.abajo + 16}
                textAnchor="middle"
                className={hoy ? 'fill-accent text-[10px] font-medium' : 'fill-muted text-[10px]'}
              >
                {hoy ? 'hoy' : diaSemana(d.fecha)}
              </text>
              <text
                x={centro(i)}
                y={ALTO - m.abajo + 29}
                textAnchor="middle"
                className="fill-muted text-[10px]"
              >
                {formatIsoDate(d.fecha).slice(0, 5)}
              </text>
            </g>
          );
        })}

        <line
          x1={m.izq}
          x2={ANCHO - m.der}
          y1={y(0)}
          y2={y(0)}
          className="stroke-ink"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <Leyenda
        items={[
          { color: 'bg-emerald-700', label: 'Disponibles' },
          { color: 'bg-red-700/25', label: 'Detenidos por umbral, taller o baja' },
          { color: 'bg-transparent', label: `Total de flota: ${total} equipos` },
        ]}
      />
    </div>
  );
}

// ── hourmeter over time ──

export interface PuntoHorometro {
  fecha: string;
  horas: number;
  mantenimiento: boolean;
}

const MARGEN = { arriba: 14, abajo: 24, izq: 8, der: 8 };
const ALTO_LINEA = 170;

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
    MARGEN.arriba + (1 - (h - piso) / rango) * (ALTO_LINEA - MARGEN.arriba - MARGEN.abajo);

  const linea = puntos.map((p, i) => `${x(i)},${y(p.horas)}`).join(' ');
  const base = y(piso);
  const area = `${MARGEN.izq},${base} ${linea} ${ANCHO - MARGEN.der},${base}`;
  const servicios = puntos.filter((p) => p.mantenimiento);

  return (
    <div className="px-4 py-4">
      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO_LINEA}`}
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
          strokeLinejoin="round"
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
              y={y(umbral) - 5}
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
              x={x(i) - 3.5}
              y={y(p.horas) - 3.5}
              width={7}
              height={7}
              className="fill-sky-700"
            />
          ) : null,
        )}

        <line
          x1={MARGEN.izq}
          x2={ANCHO - MARGEN.der}
          y1={base}
          y2={base}
          className="stroke-line"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        <text x={MARGEN.izq} y={ALTO_LINEA - 6} className="fill-muted text-[10px]">
          {formatIsoDate(puntos[0].fecha)}
        </text>
        <text
          x={ANCHO - MARGEN.der}
          y={ALTO_LINEA - 6}
          textAnchor="end"
          className="fill-muted text-[10px]"
        >
          {formatIsoDate(puntos[puntos.length - 1].fecha)}
        </text>
      </svg>

      <Leyenda
        items={[
          { color: 'bg-emerald-700', label: 'Horómetro acumulado' },
          { color: 'bg-sky-700', label: `Mantenimiento (${servicios.length})` },
          { color: 'bg-red-700', label: 'Umbral de bloqueo' },
        ]}
      />
    </div>
  );
}

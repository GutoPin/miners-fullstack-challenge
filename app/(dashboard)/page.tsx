import Link from 'next/link';

import { DisponibilidadPorDia } from '@/src/components/charts';
import { Icon, type NombreIcono } from '@/src/components/icons';
import { Aviso, Badge, BarraHorometro, Encabezado, Panel, Vacio, tabla } from '@/src/components/ui';
import {
  ESTADO_EQUIPO,
  ESTADO_TURNO,
  JORNADA,
  formatHoras,
} from '@/src/components/format';
import { prisma } from '@/src/db/prisma';
import { formatIsoDate, toIsoDate, toOperationalDate } from '@/src/services/dates';
import { getProjection } from '@/src/services/get-projection';

export const dynamic = 'force-dynamic';

const DIAS = 7;

const ALERTA: Record<string, { label: string; icono: NombreIcono }> = {
  MAINTENANCE_DUE_SOON: { label: 'Mantenimiento', icono: 'taller' },
  ASSIGNMENT_AT_RISK: { label: 'Asignación en riesgo', icono: 'alerta' },
  CERT_EXPIRING_BEFORE_SHIFT: { label: 'Certificación', icono: 'operadores' },
  OVERRIDE_USED: { label: 'Excepción autorizada', icono: 'bloqueado' },
};

export default async function TableroPage() {
  const ahora = new Date();
  const hoy = new Date(`${toOperationalDate(ahora)}T00:00:00.000Z`);

  const [equipos, turnos, alertas, proyeccion] = await Promise.all([
    prisma.equipment.findMany({ include: { type: true }, orderBy: { code: 'asc' } }),
    prisma.shift.findMany({
      where: { date: { gte: hoy } },
      include: { _count: { select: { assignments: true } } },
      orderBy: [{ date: 'asc' }, { journey: 'asc' }],
      take: 6,
    }),
    prisma.alert.findMany({
      where: { resolvedAt: null },
      include: { equipment: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    getProjection(DIAS, ahora),
  ]);

  // critical first: those need a decision today
  const ORDEN = { CRITICAL: 0, WARNING: 1, INFO: 2 } as const;
  const activas = [...alertas].sort((a, b) => ORDEN[a.severity] - ORDEN[b.severity]);
  const criticas = activas.filter((a) => a.severity === 'CRITICAL').length;

  const porEstado = equipos.reduce<Record<string, number>>((acc, e) => {
    acc[e.status] = (acc[e.status] ?? 0) + 1;
    return acc;
  }, {});

  const abiertos = turnos.filter((t) => t.status === 'PLANNED').length;
  const cruzan = proyeccion.filter((f) => f.projection.status === 'WILL_CROSS').length;
  const detenidos = (porEstado.BLOCKED ?? 0) + (porEstado.IN_MAINTENANCE ?? 0);

  const ventana = Array.from({ length: DIAS }, (_, i) =>
    toOperationalDate(new Date(ahora.getTime() + i * 86_400_000)),
  );

  const disponibilidad = ventana.map((fecha) => {
    const fuera = proyeccion.filter((f) => {
      if (f.status !== 'AVAILABLE') return true;
      if (f.projection.status === 'ALREADY_BLOCKED') return true;
      return f.projection.status === 'WILL_CROSS' && f.projection.crossesOn <= fecha;
    }).length;

    return { fecha, detenidos: fuera, disponibles: proyeccion.length - fuera };
  });

  const indicadores: {
    t: string;
    v: number;
    de?: number;
    icono: NombreIcono;
    href: string;
    alerta: boolean;
  }[] = [
    {
      t: 'Equipos disponibles',
      v: porEstado.AVAILABLE ?? 0,
      de: equipos.length,
      icono: 'equipos',
      href: '/equipos',
      alerta: false,
    },
    {
      t: 'Bloqueados o en taller',
      v: detenidos,
      icono: 'bloqueado',
      href: '/equipos',
      alerta: detenidos > 0,
    },
    {
      t: 'Turnos sin cerrar',
      v: abiertos,
      icono: 'turnos',
      href: '/turnos',
      alerta: false,
    },
    {
      t: 'Cruzan umbral en 7 días',
      v: cruzan,
      icono: 'proyeccion',
      href: '/proyeccion',
      alerta: cruzan > 0,
    },
  ];

  return (
    <>
      <Encabezado
        titulo="Tablero"
        descripcion="Estado de la flota y turnos programados. Las reglas se validan en el servidor: lo que se ve aquí es el resultado, no una copia."
      />

      {/* a list, not a <dl>: each tile is a link, and an <a> is not valid inside <dl> */}
      <ul className="mb-6 grid grid-cols-2 border border-line bg-surface lg:grid-cols-4">
        {indicadores.map((c) => (
          <li key={c.t} className="border-r border-b border-line last:border-r-0">
            <Link href={c.href} className="group block px-4 py-4 hover:bg-canvas">
              <span className="flex items-center justify-between text-muted">
                <Icon name={c.icono} className={`size-4.5 ${c.alerta ? 'text-accent' : ''}`} />
                <Icon
                  name="flecha"
                  className="size-4 opacity-0 transition-opacity group-hover:opacity-100"
                />
              </span>

              <span className="mt-3 flex items-baseline gap-1">
                <span
                  className={`font-mono text-3xl leading-none font-medium ${c.alerta ? 'text-accent' : ''}`}
                >
                  {c.v}
                </span>
                {c.de !== undefined && (
                  <span className="font-mono text-sm text-muted">/ {c.de}</span>
                )}
              </span>
              <span className="mt-1.5 block text-xs text-muted">{c.t}</span>
            </Link>
          </li>
        ))}
      </ul>

      <Panel
        icono="alerta"
        titulo={`Requiere atención (${activas.length})`}
        descripcion={
          criticas > 0
            ? `${criticas} ${criticas === 1 ? 'alerta crítica' : 'alertas críticas'} sin resolver`
            : 'Ninguna alerta crítica abierta'
        }
        className="mb-6"
      >
        {activas.length === 0 ? (
          <Aviso tono="ok" className="m-4">
            Sin alertas abiertas. Las alertas se resuelven solas cuando desaparece su causa:
            registrar el mantenimiento de un equipo bloqueado cierra las suyas.
          </Aviso>
        ) : (
          <ul className="divide-y divide-line">
            {activas.map((a) => {
              const tipo = ALERTA[a.type];

              return (
                <li key={a.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                  <Badge tono={a.severity === 'CRITICAL' ? 'bloqueo' : 'aviso'}>
                    {tipo?.label ?? a.type}
                  </Badge>
                  <p className="flex-1 text-sm">{a.message}</p>
                  {a.equipment && (
                    <Link
                      href={`/equipos/${a.equipmentId}`}
                      className="inline-flex items-center gap-1.5 border border-line px-3 py-1.5 text-xs whitespace-nowrap hover:border-accent hover:text-accent"
                    >
                      Abrir {a.equipment.code}
                      <Icon name="flecha" className="size-3.5" />
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Panel
          icono="proyeccion"
          titulo="Flota disponible los próximos 7 días"
          descripcion="Según los turnos ya programados, sin ningún mantenimiento de por medio"
          acciones={
            <Link
              href="/proyeccion"
              className="inline-flex items-center gap-1.5 text-xs underline hover:text-accent"
            >
              Ver proyección
              <Icon name="flecha" className="size-3.5" />
            </Link>
          }
        >
          <DisponibilidadPorDia dias={disponibilidad} />
        </Panel>

        <Panel icono="turnos" titulo="Próximos turnos" descripcion="Abra uno para asignar o cerrarlo">
          {turnos.length === 0 ? (
            <Vacio
              accion={
                <Link
                  href="/turnos"
                  className="inline-flex items-center gap-2 border border-line px-3 py-2 text-sm hover:border-accent hover:text-accent"
                >
                  <Icon name="mas" className="size-4" />
                  Crear turno
                </Link>
              }
            >
              No hay turnos programados desde hoy.
            </Vacio>
          ) : (
            <ul className="divide-y divide-line">
              {turnos.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/turnos/${t.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-canvas"
                  >
                    <span>
                      <span className="block font-mono text-sm">
                        {formatIsoDate(toIsoDate(t.date))}
                      </span>
                      <span className="block text-xs text-muted">
                        {JORNADA[t.journey]} · {formatHoras(t.plannedHours)} h ·{' '}
                        {t._count.assignments} asignaciones
                      </span>
                    </span>
                    <Badge tono={ESTADO_TURNO[t.status].tono}>
                      {ESTADO_TURNO[t.status].label}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        icono="equipos"
        titulo="Flota"
        descripcion="Horómetro contra el umbral que bloquea cada unidad"
        acciones={
          <Link
            href="/equipos"
            className="inline-flex items-center gap-1.5 text-xs underline hover:text-accent"
          >
            Ver detalle
            <Icon name="flecha" className="size-3.5" />
          </Link>
        }
        className="mt-6"
      >
        <div className={tabla.wrapper}>
          <table className={tabla.table}>
            <thead>
              <tr>
                <th scope="col" className={tabla.th}>Equipo</th>
                <th scope="col" className={tabla.th}>Tipo</th>
                <th scope="col" className={tabla.th}>Estado</th>
                <th scope="col" className={tabla.th}>Uso del ciclo</th>
                <th scope="col" className={`${tabla.th} text-right`}>Horómetro</th>
                <th scope="col" className={`${tabla.th} text-right`}>Umbral</th>
              </tr>
            </thead>
            <tbody>
              {equipos.map((e) => (
                <tr key={e.id}>
                  <td className={tabla.td}>
                    <Link href={`/equipos/${e.id}`} className="font-mono hover:text-accent">
                      {e.code}
                    </Link>
                  </td>
                  <td className={`${tabla.td} text-muted`}>{e.type.name}</td>
                  <td className={tabla.td}>
                    <Badge tono={ESTADO_EQUIPO[e.status].tono}>
                      {ESTADO_EQUIPO[e.status].label}
                    </Badge>
                  </td>
                  <td className={tabla.td}>
                    <BarraHorometro
                      actual={Number(e.currentHours)}
                      umbral={Number(e.nextMaintenanceHours)}
                    />
                  </td>
                  <td className={tabla.num}>{formatHoras(e.currentHours)}</td>
                  <td className={`${tabla.num} text-muted`}>
                    {formatHoras(e.nextMaintenanceHours)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

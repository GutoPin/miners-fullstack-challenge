import Link from 'next/link';

import { Badge, Encabezado, Panel, Vacio, tabla } from '@/src/components/ui';
import {
  ESTADO_EQUIPO,
  ESTADO_TURNO,
  JORNADA,
  formatHoras,
} from '@/src/components/format';
import { prisma } from '@/src/db/prisma';
import { formatIsoDate, toIsoDate, toOperationalDate } from '@/src/services/dates';

export const dynamic = 'force-dynamic';

export default async function TableroPage() {
  const hoy = new Date(`${toOperationalDate(new Date())}T00:00:00.000Z`);

  const [equipos, turnos] = await Promise.all([
    prisma.equipment.findMany({ include: { type: true }, orderBy: { code: 'asc' } }),
    prisma.shift.findMany({
      where: { date: { gte: hoy } },
      include: { _count: { select: { assignments: true } } },
      orderBy: [{ date: 'asc' }, { journey: 'asc' }],
      take: 6,
    }),
  ]);

  const porEstado = equipos.reduce<Record<string, number>>((acc, e) => {
    acc[e.status] = (acc[e.status] ?? 0) + 1;
    return acc;
  }, {});

  // "Cerca del umbral" = le queda menos del 10 % de su intervalo. Es el aviso barato que
  // se ve de un vistazo; la proyección real de 7 días llega en su propia pantalla.
  const cerca = equipos.filter((e) => {
    const faltan = Number(e.nextMaintenanceHours) - Number(e.currentHours);
    return e.status === 'AVAILABLE' && faltan > 0 && faltan <= Number(e.nextMaintenanceHours) * 0.1;
  });

  return (
    <>
      <Encabezado
        titulo="Tablero"
        descripcion="Estado de la flota y turnos programados. Las reglas se validan en el servidor: lo que se ve aquí es el resultado, no una copia."
      />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Panel titulo="Flota por estado">
          <dl className="grid grid-cols-2 divide-line sm:grid-cols-4 sm:divide-x">
            {(['AVAILABLE', 'BLOCKED', 'IN_MAINTENANCE', 'OUT_OF_SERVICE'] as const).map((s) => (
              <div key={s} className="border-b border-line px-4 py-5 sm:border-b-0">
                <dd className="font-mono text-3xl font-medium">{porEstado[s] ?? 0}</dd>
                <dt className="mt-1 text-xs text-muted">{ESTADO_EQUIPO[s].label}</dt>
              </div>
            ))}
          </dl>

          <div className="border-t border-line px-4 py-4">
            <p className="rotulo">Cerca del umbral</p>
            {cerca.length === 0 ? (
              <p className="mt-2 text-sm text-muted">
                Ningún equipo disponible está a menos del 10 % de su umbral.
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {cerca.map((e) => (
                  <li key={e.id} className="text-sm">
                    <Link href={`/equipos/${e.id}`} className="font-mono hover:text-accent">
                      {e.code}
                    </Link>{' '}
                    <span className="text-muted">
                      {formatHoras(e.currentHours)} de {formatHoras(e.nextMaintenanceHours)} h ·
                      faltan{' '}
                      {formatHoras(Number(e.nextMaintenanceHours) - Number(e.currentHours))} h
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>

        <Panel titulo="Próximos turnos">
          {turnos.length === 0 ? (
            <Vacio>
              No hay turnos programados. <Link href="/turnos" className="underline">Crear turno</Link>
            </Vacio>
          ) : (
            <ul className="divide-y divide-line">
              {turnos.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="font-mono text-sm">{formatIsoDate(toIsoDate(t.date))}</p>
                    <p className="text-xs text-muted">
                      {JORNADA[t.journey]} · {formatHoras(t.plannedHours)} h ·{' '}
                      {t._count.assignments} asignaciones
                    </p>
                  </div>
                  <Badge tono={ESTADO_TURNO[t.status].tono}>{ESTADO_TURNO[t.status].label}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel titulo="Flota" className="mt-6">
        <div className={tabla.wrapper}>
          <table className={tabla.table}>
            <thead>
              <tr>
                <th className={tabla.th}>Equipo</th>
                <th className={tabla.th}>Tipo</th>
                <th className={tabla.th}>Estado</th>
                <th className={`${tabla.th} text-right`}>Horómetro</th>
                <th className={`${tabla.th} text-right`}>Umbral</th>
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

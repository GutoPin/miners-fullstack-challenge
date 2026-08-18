import Link from 'next/link';

import { JORNADA, formatHoras } from '@/src/components/format';
import { Badge, Encabezado, Panel, Vacio, tabla } from '@/src/components/ui';
import type { Violation } from '@/src/domain/rules/violation';
import { prisma } from '@/src/db/prisma';
import { formatIsoDate, toIsoDate, toOperationalDate } from '@/src/services/dates';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Auditoría · MineOps' };

const ORIGEN: Record<string, string> = {
  SHIFT_CLOSE: 'Cierre de turno',
  MAINTENANCE: 'Mantenimiento',
  MANUAL_ADJUSTMENT: 'Ajuste manual',
  INITIAL_LOAD: 'Carga inicial',
};

export default async function AuditoriaPage() {
  const [excepciones, movimientos] = await Promise.all([
    prisma.assignmentOverride.findMany({
      include: {
        authorizedBy: true,
        assignment: { include: { equipment: true, operator: true, shift: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.hourmeterEntry.findMany({
      include: { equipment: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  ]);

  return (
    <>
      <Encabezado
        titulo="Auditoría"
        descripcion="Quién forzó qué y con qué motivo, y todo movimiento del horómetro con su origen. Si algo se saltó una regla o cambió una cifra, tiene que poder rastrearse hasta aquí."
      />

      <dl className="mb-6 grid grid-cols-2 border border-line bg-surface sm:grid-cols-3">
        {[
          { t: 'Excepciones firmadas', v: excepciones.length },
          { t: 'Movimientos de horómetro', v: movimientos.length },
          {
            t: 'Equipos con movimiento',
            v: new Set(movimientos.map((h) => h.equipmentId)).size,
          },
        ].map((c) => (
          <div key={c.t} className="border-r border-b border-line px-4 py-4 last:border-r-0">
            <dd className="font-mono text-2xl font-medium">{c.v}</dd>
            <dt className="mt-1 text-xs text-muted">{c.t}</dt>
          </div>
        ))}
      </dl>

      <Panel
        titulo={`Excepciones autorizadas (${excepciones.length})`}
        descripcion="Reglas que un supervisor decidió saltarse, con su motivo"
      >
        {excepciones.length === 0 ? (
          <Vacio>
            No se ha forzado ninguna asignación. Cuando un supervisor autorice una excepción,
            aquí queda su nombre, el motivo y las reglas que se saltaron.
          </Vacio>
        ) : (
          <ul className="divide-y divide-line">
            {excepciones.map((o) => {
              // snapshot frozen the day it was signed, immune to later rule changes
              const saltadas = (o.violatedRules as unknown as Violation[]) ?? [];

              return (
                <li key={o.id} className="px-4 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tono="bloqueo">Forzada</Badge>
                    <span className="font-mono text-sm">{o.assignment.equipment.code}</span>
                    <span className="text-sm text-muted">
                      · {o.assignment.operator.fullName} · turno del{' '}
                      {formatIsoDate(toIsoDate(o.assignment.shift.date))} (
                      {JORNADA[o.assignment.shift.journey]})
                    </span>
                  </div>

                  <p className="mt-2 text-sm">
                    <span className="text-muted">Autorizó</span>{' '}
                    <strong>{o.authorizedBy.name}</strong>{' '}
                    <span className="text-muted">
                      el {formatIsoDate(toOperationalDate(o.createdAt))}:
                    </span>{' '}
                    {o.reason}
                  </p>

                  {saltadas.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-xs text-muted">
                      {saltadas.map((v) => (
                        <li key={v.code}>
                          <span className="font-mono">{v.code}</span> — {v.message}
                        </li>
                      ))}
                    </ul>
                  )}

                  <Link
                    href={`/turnos/${o.assignment.shiftId}`}
                    className="mt-2 inline-block text-xs underline hover:text-accent"
                  >
                    Ver el turno
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel
        titulo="Bitácora de horómetro"
        descripcion="Últimos 100 movimientos, del más reciente al más antiguo"
        className="mt-6"
      >
        {movimientos.length === 0 ? (
          <Vacio>Sin movimientos registrados.</Vacio>
        ) : (
          <div className={tabla.wrapper}>
            <table className={tabla.table}>
              <thead>
                <tr>
                  <th scope="col" className={tabla.th}>Fecha</th>
                  <th scope="col" className={tabla.th}>Equipo</th>
                  <th scope="col" className={tabla.th}>Origen</th>
                  <th scope="col" className={`${tabla.th} text-right`}>Antes</th>
                  <th scope="col" className={`${tabla.th} text-right`}>Movimiento</th>
                  <th scope="col" className={`${tabla.th} text-right`}>Después</th>
                  <th scope="col" className={tabla.th}>Nota</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((h) => (
                  <tr key={h.id}>
                    <td className={`${tabla.td} font-mono whitespace-nowrap`}>
                      {formatIsoDate(toOperationalDate(h.createdAt))}
                    </td>
                    <td className={tabla.td}>
                      <Link href={`/equipos/${h.equipmentId}`} className="font-mono hover:text-accent">
                        {h.equipment.code}
                      </Link>
                    </td>
                    <td className={tabla.td}>{ORIGEN[h.source] ?? h.source}</td>
                    <td className={`${tabla.num} text-muted`}>{formatHoras(h.hoursBefore)}</td>
                    <td className={tabla.num}>+{formatHoras(h.hoursDelta)}</td>
                    <td className={tabla.num}>{formatHoras(h.hoursAfter)}</td>
                    <td className={`${tabla.td} text-xs text-muted`}>{h.note ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-line px-4 py-3 text-xs text-muted">
          Ninguna cifra del horómetro cambia sin dejar su asiento aquí, y el asiento se
          escribe en la misma transacción que mueve el saldo.
        </p>
      </Panel>
    </>
  );
}

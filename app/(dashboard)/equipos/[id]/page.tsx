import Link from 'next/link';
import { notFound } from 'next/navigation';

import { auth } from '@/src/auth';

import { ESTADO_EQUIPO, formatHoras } from '@/src/components/format';
import { Badge, BarraHorometro, Encabezado, Panel, Vacio, tabla } from '@/src/components/ui';
import { prisma } from '@/src/db/prisma';
import { formatIsoDate, toOperationalDate } from '@/src/services/dates';
import { RegistrarMantenimiento } from './register-maintenance-form';

export const dynamic = 'force-dynamic';

const ORIGEN: Record<string, string> = {
  SHIFT_CLOSE: 'Cierre de turno',
  MAINTENANCE: 'Mantenimiento',
  MANUAL_ADJUSTMENT: 'Ajuste manual',
  INITIAL_LOAD: 'Carga inicial',
};

export default async function EquipoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const puedeOperar = session?.user.role === 'PLANNER' || session?.user.role === 'SUPERVISOR';

  const equipo = await prisma.equipment.findUnique({
    where: { id },
    include: {
      type: true,
      maintenances: { orderBy: { performedAt: 'desc' } },
      hourmeterEntries: { orderBy: { createdAt: 'desc' }, take: 50 },
    },
  });

  if (!equipo) notFound();

  const actual = Number(equipo.currentHours);
  const umbral = Number(equipo.nextMaintenanceHours);
  const intervalo =
    equipo.maintenanceIntervalOverride ?? equipo.type.maintenanceIntervalHours;

  // El saldo debe ser la suma del libro mayor. Si no cuadra, el dato está mal y hay que
  // verlo, no esconderlo.
  const sumaLedger = equipo.hourmeterEntries.reduce((t, h) => t + Number(h.hoursDelta), 0);
  const cuadra = equipo.hourmeterEntries.length < 50 && Math.abs(sumaLedger - actual) < 0.005;

  return (
    <>
      <Encabezado
        titulo={equipo.code}
        descripcion={`${equipo.type.name} · intervalo de ${intervalo} h${
          equipo.maintenanceIntervalOverride ? ' (propio de esta unidad)' : ' (heredado del tipo)'
        }`}
        acciones={
          <Link href="/equipos" className="text-sm text-muted underline hover:text-accent">
            Volver a equipos
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel titulo="Estado" className="lg:col-span-1">
          <div className="space-y-4 px-4 py-4">
            <Badge tono={ESTADO_EQUIPO[equipo.status].tono}>
              {ESTADO_EQUIPO[equipo.status].label}
            </Badge>

            <div>
              <p className="font-mono text-3xl font-medium">{formatHoras(actual)} h</p>
              <p className="mt-1 text-xs text-muted">
                Umbral de bloqueo en {formatHoras(umbral)} h
              </p>
              <div className="mt-2">
                <BarraHorometro actual={actual} umbral={umbral} />
              </div>
            </div>

            <dl className="space-y-1 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Faltan</dt>
                <dd className="font-mono">{formatHoras(Math.max(0, umbral - actual))} h</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Servicios registrados</dt>
                <dd className="font-mono">{equipo.maintenances.length}</dd>
              </div>
            </dl>
          </div>
        </Panel>

        <Panel titulo="Historial de mantenimientos" className="lg:col-span-2">
          {equipo.maintenances.length === 0 ? (
            <Vacio>Este equipo todavía no tiene mantenimientos registrados.</Vacio>
          ) : (
            <div className={tabla.wrapper}>
              <table className={tabla.table}>
                <thead>
                  <tr>
                    <th scope="col" className={tabla.th}>Fecha</th>
                    <th scope="col" className={`${tabla.th} text-right`}>Horómetro</th>
                    <th scope="col" className={`${tabla.th} text-right`}>Umbral</th>
                    <th scope="col" className={`${tabla.th} text-right`}>Atraso</th>
                    <th scope="col" className={`${tabla.th} text-right`}>Nuevo umbral</th>
                    <th scope="col" className={tabla.th}>Responsable</th>
                  </tr>
                </thead>
                <tbody>
                  {equipo.maintenances.map((m) => (
                    <tr key={m.id}>
                      <td className={`${tabla.td} font-mono`}>
                        {formatIsoDate(toOperationalDate(m.performedAt))}
                      </td>
                      <td className={tabla.num}>{formatHoras(m.hoursAtService)}</td>
                      <td className={`${tabla.num} text-muted`}>{formatHoras(m.thresholdHours)}</td>
                      <td
                        className={`${tabla.num} ${Number(m.overdueHours) > 0 ? 'text-amber-800' : 'text-muted'}`}
                      >
                        {formatHoras(m.overdueHours)}
                      </td>
                      <td className={tabla.num}>{formatHoras(m.nextThresholdHours)}</td>
                      <td className={`${tabla.td} text-muted`}>
                        {m.responsible}
                        {m.notes && <span className="block text-xs">{m.notes}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="border-t border-line px-4 py-3 text-xs text-muted">
            El nuevo umbral se ancla al umbral anterior más el intervalo, no al horómetro
            real: así el atraso no corre la ventana de mantenimiento hacia adelante.
          </p>
        </Panel>
      </div>

      {puedeOperar && equipo.status !== 'OUT_OF_SERVICE' && (
        <Panel titulo="Registrar mantenimiento" className="mt-6">
          <RegistrarMantenimiento
            equipmentId={equipo.id}
            code={equipo.code}
            currentHours={actual}
            threshold={umbral}
            interval={intervalo}
          />
        </Panel>
      )}

      <Panel titulo="Bitácora de horómetro" className="mt-6">
        {equipo.hourmeterEntries.length === 0 ? (
          <Vacio>Sin movimientos registrados.</Vacio>
        ) : (
          <div className={tabla.wrapper}>
            <table className={tabla.table}>
              <thead>
                <tr>
                  <th scope="col" className={tabla.th}>Fecha</th>
                  <th scope="col" className={tabla.th}>Origen</th>
                  <th scope="col" className={`${tabla.th} text-right`}>Antes</th>
                  <th scope="col" className={`${tabla.th} text-right`}>Movimiento</th>
                  <th scope="col" className={`${tabla.th} text-right`}>Después</th>
                  <th scope="col" className={tabla.th}>Nota</th>
                </tr>
              </thead>
              <tbody>
                {equipo.hourmeterEntries.map((h) => (
                  <tr key={h.id}>
                    <td className={`${tabla.td} font-mono whitespace-nowrap`}>
                      {formatIsoDate(toOperationalDate(h.createdAt))}
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
          {cuadra
            ? `La suma de los movimientos (${formatHoras(sumaLedger)} h) es igual al horómetro actual: el saldo es reconstruible desde el libro mayor.`
            : 'Se muestran los últimos 50 movimientos; el total del libro mayor puede exceder lo listado.'}
        </p>
      </Panel>
    </>
  );
}

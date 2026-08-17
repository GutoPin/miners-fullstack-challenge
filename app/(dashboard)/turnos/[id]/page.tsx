import Link from 'next/link';
import { notFound } from 'next/navigation';

import { auth } from '@/src/auth';
import {
  ESTADO_ASIGNACION,
  ESTADO_EQUIPO,
  ESTADO_TURNO,
  JORNADA,
  diasHasta,
  formatHoras,
} from '@/src/components/format';
import { Badge, Encabezado, Panel, Vacio, tabla } from '@/src/components/ui';
import { prisma } from '@/src/db/prisma';
import { formatIsoDate, toIsoDate } from '@/src/services/dates';
import { AsignarForm } from './assign-form';
import { CancelarAsignacion } from './cancel-assignment';
import { CerrarTurnoForm } from './close-shift-form';

export const dynamic = 'force-dynamic';

export default async function TurnoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const rol = session?.user.role;
  const puedeOperar = rol === 'PLANNER' || rol === 'SUPERVISOR';

  const [turno, equipos, operadores] = await Promise.all([
    prisma.shift.findUnique({
      where: { id },
      include: {
        assignments: {
          include: { equipment: { include: { type: true } }, operator: true, override: { include: { authorizedBy: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    }),
    prisma.equipment.findMany({ include: { type: true }, orderBy: { code: 'asc' } }),
    prisma.operator.findMany({
      where: { active: true },
      include: { certifications: { include: { equipmentType: true } } },
      orderBy: { code: 'asc' },
    }),
  ]);

  if (!turno) notFound();

  const vigentes = turno.assignments.filter((a) => a.status !== 'CANCELLED');
  const enRiesgo = vigentes.filter((a) => a.status === 'AT_RISK');
  const planificado = turno.status === 'PLANNED';

  return (
    <>
      <Encabezado
        titulo={`Turno del ${formatIsoDate(toIsoDate(turno.date))} · ${JORNADA[turno.journey]}`}
        descripcion={`Duración planificada de ${formatHoras(turno.plannedHours)} h. Cada asignación hereda esas horas y al cerrar se comparan contra las reales.`}
        acciones={
          <div className="flex items-center gap-3">
            <Badge tono={ESTADO_TURNO[turno.status].tono}>{ESTADO_TURNO[turno.status].label}</Badge>
            <Link href="/turnos" className="text-sm text-muted underline hover:text-accent">
              Volver a turnos
            </Link>
          </div>
        }
      />

      <Panel titulo={`Asignaciones (${vigentes.length})`}>
        {turno.assignments.length === 0 ? (
          <Vacio>Este turno todavía no tiene asignaciones.</Vacio>
        ) : (
          <div className={tabla.wrapper}>
            <table className={tabla.table}>
              <thead>
                <tr>
                  <th scope="col" className={tabla.th}>Equipo</th>
                  <th scope="col" className={tabla.th}>Operador</th>
                  <th scope="col" className={tabla.th}>Estado</th>
                  <th scope="col" className={`${tabla.th} text-right`}>Planificadas</th>
                  <th scope="col" className={`${tabla.th} text-right`}>Reales</th>
                  <th scope="col" className={tabla.th}>Observaciones</th>
                  {planificado && puedeOperar && <th scope="col" className={tabla.th}></th>}
                </tr>
              </thead>
              <tbody>
                {turno.assignments.map((a) => (
                  <tr key={a.id} className={a.override ? 'bg-red-50/40' : undefined}>
                    <td className={`${tabla.td} font-mono`}>
                      <Link href={`/equipos/${a.equipmentId}`} className="hover:text-accent">
                        {a.equipment.code}
                      </Link>
                    </td>
                    <td className={tabla.td}>{a.operator.fullName}</td>
                    <td className={tabla.td}>
                      <Badge tono={ESTADO_ASIGNACION[a.status].tono}>
                        {ESTADO_ASIGNACION[a.status].label}
                      </Badge>
                    </td>
                    <td className={`${tabla.num} text-muted`}>{formatHoras(a.plannedHours)}</td>
                    <td className={tabla.num}>
                      {a.actualHours === null ? '—' : formatHoras(a.actualHours)}
                    </td>
                    <td className={`${tabla.td} text-xs text-muted`}>
                      {a.override && (
                        <span className="block font-medium text-red-800">
                          Forzada por {a.override.authorizedBy.name}: {a.override.reason}
                        </span>
                      )}
                      {a.riskReason && !a.override && <span className="block">{a.riskReason}</span>}
                      {a.varianceNote && <span className="block">Desvío: {a.varianceNote}</span>}
                      {!a.override && !a.riskReason && !a.varianceNote && '—'}
                    </td>
                    {planificado && puedeOperar && (
                      <td className={`${tabla.td} text-right`}>
                        {a.status !== 'CANCELLED' && (
                          <CancelarAsignacion
                            assignmentId={a.id}
                            etiqueta={`${a.operator.fullName} en ${a.equipment.code}`}
                          />
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {planificado && puedeOperar && (
        <Panel titulo="Nueva asignación" className="mt-6">
          <AsignarForm
            shiftId={turno.id}
            plannedHours={Number(turno.plannedHours)}
            esSupervisor={rol === 'SUPERVISOR'}
            equipos={equipos.map((e) => ({
              id: e.id,
              code: e.code,
              typeName: e.type.name,
              estado: ESTADO_EQUIPO[e.status].label,
              currentHours: Number(e.currentHours),
              nextMaintenanceHours: Number(e.nextMaintenanceHours),
            }))}
            operadores={operadores.map((o) => ({
              id: o.id,
              code: o.code,
              fullName: o.fullName,
              certificaciones:
                o.certifications.length === 0
                  ? 'sin certificaciones'
                  : o.certifications
                      .map((c) => {
                        const dias = diasHasta(c.expiresAt);
                        return `${c.equipmentType.code} ${dias < 0 ? 'vencida' : `${dias} d`}`;
                      })
                      .join(' · '),
            }))}
          />
        </Panel>
      )}

      {planificado && puedeOperar && (
        <Panel titulo="Cerrar turno" className="mt-6">
          {enRiesgo.length > 0 ? (
            <p className="px-4 py-4 text-sm text-amber-900">
              Hay {enRiesgo.length}{' '}
              {enRiesgo.length === 1 ? 'asignación en riesgo' : 'asignaciones en riesgo'} sin
              resolver. Reasigne el equipo o cancele la asignación antes de cerrar: el sistema
              no cierra en silencio algo que alguien tiene que decidir.
            </p>
          ) : vigentes.length === 0 ? (
            <Vacio>Sin asignaciones que cerrar.</Vacio>
          ) : (
            <CerrarTurnoForm
              shiftId={turno.id}
              filas={vigentes.map((a) => ({
                id: a.id,
                equipmentCode: a.equipment.code,
                operatorName: a.operator.fullName,
                plannedHours: Number(a.plannedHours),
                currentHours: Number(a.equipment.currentHours),
                nextMaintenanceHours: Number(a.equipment.nextMaintenanceHours),
              }))}
            />
          )}
        </Panel>
      )}

      {!planificado && (
        <p className="mt-6 text-sm text-muted">
          El turno está {ESTADO_TURNO[turno.status].label.toLowerCase()}: las horas ya se
          sumaron al horómetro y no se puede volver a cerrar ni modificar sus asignaciones.
        </p>
      )}
    </>
  );
}

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
import { Aviso, Badge, Encabezado, Panel, Vacio, boton, tabla } from '@/src/components/ui';
import { prisma } from '@/src/db/prisma';
import { formatIsoDate, toIsoDate } from '@/src/services/dates';
import { AsignarForm } from './assign-form';
import { CancelarAsignacion } from './cancel-assignment';
import { CerrarTurnoForm } from './close-shift-form';
import { Proceso } from './proceso';

export const dynamic = 'force-dynamic';

export default async function TurnoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ nuevo?: string }>;
}) {
  const { id } = await params;
  const { nuevo } = await searchParams;
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
  const horasPlan = vigentes.reduce((t, a) => t + Number(a.plannedHours), 0);

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

      <dl className="mb-6 grid grid-cols-2 border border-line bg-surface sm:grid-cols-4">
        {[
          { t: 'Asignaciones vigentes', v: String(vigentes.length) },
          { t: 'En riesgo', v: String(enRiesgo.length) },
          { t: 'Horas planificadas', v: `${formatHoras(horasPlan)} h` },
          { t: 'Canceladas', v: String(turno.assignments.length - vigentes.length) },
        ].map((c) => (
          <div key={c.t} className="border-r border-b border-line px-4 py-3 last:border-r-0">
            <dd className="font-mono text-xl font-medium">{c.v}</dd>
            <dt className="mt-0.5 text-xs text-muted">{c.t}</dt>
          </div>
        ))}
      </dl>

      {nuevo && (
        <Aviso tono="ok" titulo="Turno creado." className="mb-6">
          Ya puede asignar equipos y operadores. Cada asignación hereda las{' '}
          {formatHoras(turno.plannedHours)} h de duración del turno.
        </Aviso>
      )}

      {planificado && puedeOperar && (
        <Proceso asignadas={vigentes.length} enRiesgo={enRiesgo.length} />
      )}

      {!puedeOperar && (
        <Aviso tono="neutro" titulo="Su rol es de solo consulta." className="mb-6">
          Puede revisar las asignaciones y el estado del turno. Crear asignaciones, cancelarlas
          o cerrar el turno requiere el rol de planificador o supervisor.
        </Aviso>
      )}

      <Panel
        id="asignaciones"
        titulo={`Asignaciones (${vigentes.length} vigentes)`}
        descripcion="Qué equipo opera quién en este turno"
        className="scroll-mt-6"
      >
        {turno.assignments.length === 0 ? (
          <Vacio
            accion={
              planificado && puedeOperar ? (
                <a href="#asignar" className={boton.secundario}>
                  Crear la primera asignación
                </a>
              ) : undefined
            }
          >
            Este turno todavía no tiene asignaciones.
          </Vacio>
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
                  {planificado && puedeOperar && <th scope="col" className={tabla.th}>Acción</th>}
                </tr>
              </thead>
              <tbody>
                {turno.assignments.map((a) => (
                  <tr
                    key={a.id}
                    className={a.status === 'AT_RISK' ? 'bg-amber-50/60' : undefined}
                  >
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
                    <td className={`${tabla.td} max-w-sm text-xs text-muted`}>
                      {a.override && (
                        <span className="block font-medium text-red-800">
                          Forzada por {a.override.authorizedBy.name}: {a.override.reason}
                        </span>
                      )}
                      {/* an override already prints its reason above; printing both repeats it */}
                      {a.riskReason && !a.override && (
                        <span className="block text-amber-900">{a.riskReason}</span>
                      )}
                      {a.varianceNote && <span className="block">Desvío: {a.varianceNote}</span>}
                      {!a.override && !a.riskReason && !a.varianceNote && '—'}
                    </td>
                    {planificado && puedeOperar && (
                      <td className={tabla.td}>
                        {a.status !== 'CANCELLED' ? (
                          <CancelarAsignacion
                            assignmentId={a.id}
                            etiqueta={`${a.operator.fullName} en ${a.equipment.code}`}
                          />
                        ) : (
                          <span className="text-xs text-muted">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {enRiesgo.length > 0 && (
          <div className="border-t border-line px-4 py-3 text-xs text-muted">
            Las filas ámbar son asignaciones que nacieron bien y se rompieron después: el
            equipo se bloqueó al cruzar su umbral, o un supervisor firmó una excepción.
            Cancélelas o libere el equipo con un mantenimiento para poder cerrar el turno.
          </div>
        )}
      </Panel>

      {planificado && puedeOperar && (
        <Panel
          id="asignar"
          titulo="Nueva asignación"
          descripcion="Se valida contra las 12 reglas antes de guardar"
          className="mt-6 scroll-mt-6"
        >
          <AsignarForm
            shiftId={turno.id}
            plannedHours={Number(turno.plannedHours)}
            esSupervisor={rol === 'SUPERVISOR'}
            equipos={equipos.map((e) => ({
              id: e.id,
              code: e.code,
              typeName: e.type.name,
              estado: ESTADO_EQUIPO[e.status].label,
              disponible: e.status === 'AVAILABLE',
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
        <Panel
          id="cerrar"
          titulo="Cerrar turno"
          descripcion="Registra las horas reales y las suma al horómetro de cada equipo"
          className="mt-6 scroll-mt-6"
        >
          {enRiesgo.length > 0 ? (
            <Aviso
              tono="aviso"
              titulo={`Falta resolver ${enRiesgo.length} ${enRiesgo.length === 1 ? 'asignación en riesgo' : 'asignaciones en riesgo'}.`}
              className="m-4"
            >
              <p>
                {enRiesgo.map((a) => a.equipment.code).join(', ')}. Cancele la asignación o
                registre el mantenimiento del equipo: el turno no se cierra en silencio con
                algo que alguien tiene que decidir.
              </p>
              <a href="#asignaciones" className="mt-2 inline-block text-sm underline">
                Ir a las asignaciones
              </a>
            </Aviso>
          ) : vigentes.length === 0 ? (
            <Vacio
              accion={
                <a href="#asignar" className={boton.secundario}>
                  Crear una asignación
                </a>
              }
            >
              No hay nada que cerrar: este turno no tiene asignaciones vigentes.
            </Vacio>
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
        <Aviso
          tono="neutro"
          titulo={`Turno ${ESTADO_TURNO[turno.status].label.toLowerCase()}.`}
          className="mt-6"
        >
          Las horas reales ya se sumaron al horómetro de cada equipo y quedaron asentadas en la{' '}
          <Link href="/auditoria" className="underline hover:text-accent">
            bitácora
          </Link>
          . Un turno cerrado no se vuelve a cerrar ni admite cambios en sus asignaciones.
        </Aviso>
      )}
    </>
  );
}

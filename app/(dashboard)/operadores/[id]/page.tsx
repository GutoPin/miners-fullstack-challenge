import Link from 'next/link';
import { notFound } from 'next/navigation';

import { auth } from '@/src/auth';
import {
  ESTADO_ASIGNACION,
  JORNADA,
  diasHasta,
  formatHoras,
} from '@/src/components/format';
import { Aviso, Badge, Encabezado, Panel, Vacio, tabla } from '@/src/components/ui';
import { prisma } from '@/src/db/prisma';
import { formatIsoDate, toIsoDate } from '@/src/services/dates';
import {
  CambiarSituacion,
  OtorgarCertificacion,
  RevocarCertificacion,
} from './certifications-form';

export const dynamic = 'force-dynamic';

/** 30 days ahead: still enough time to process a renewal */
const AVISO_DIAS = 30;

export default async function OperadorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const puedeOperar = session?.user.role === 'PLANNER' || session?.user.role === 'SUPERVISOR';

  const [operador, tipos] = await Promise.all([
    prisma.operator.findUnique({
      where: { id },
      include: {
        certifications: { include: { equipmentType: true }, orderBy: { expiresAt: 'desc' } },
        assignments: {
          include: { equipment: true, shift: true },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    }),
    prisma.equipmentType.findMany({ orderBy: { code: 'asc' } }),
  ]);

  if (!operador) notFound();

  // the engine reads the certification with the furthest expiry per type; the profile shows
  // the same thing, so what is displayed here is what will be applied at assignment time
  const vigentePorTipo = new Map<string, (typeof operador.certifications)[number]>();
  for (const c of operador.certifications) {
    const previa = vigentePorTipo.get(c.equipmentTypeId);
    if (!previa || c.expiresAt > previa.expiresAt) vigentePorTipo.set(c.equipmentTypeId, c);
  }

  const habilitados = tipos.filter((t) => {
    const c = vigentePorTipo.get(t.id);
    return c !== undefined && diasHasta(c.expiresAt) >= 0;
  });

  return (
    <>
      <Encabezado
        titulo={operador.fullName}
        descripcion={`${operador.code} · documento ${operador.document}`}
        acciones={
          <div className="flex items-center gap-3">
            <Badge tono={operador.active ? 'ok' : 'neutro'}>
              {operador.active ? 'Activo' : 'Inactivo'}
            </Badge>
            <Link href="/operadores" className="text-sm text-muted underline hover:text-accent">
              Volver a operadores
            </Link>
          </div>
        }
      />

      {habilitados.length === 0 && (
        <Aviso tono="aviso" titulo="No puede recibir ninguna asignación." className="mb-6">
          No tiene ninguna certificación vigente a día de hoy, así que la regla 3 rechazará
          cualquier turno que se le intente asignar. Un supervisor puede autorizar la excepción
          dejando constancia, o se le puede otorgar la certificación aquí abajo.
        </Aviso>
      )}

      <dl className="mb-6 grid grid-cols-2 border border-line bg-surface sm:grid-cols-4">
        {[
          { t: 'Equipos que puede operar', v: String(habilitados.length) },
          { t: 'Certificaciones registradas', v: String(operador.certifications.length) },
          {
            t: 'Asignaciones vigentes',
            v: String(
              operador.assignments.filter((a) => a.status === 'ACTIVE' || a.status === 'AT_RISK')
                .length,
            ),
          },
          { t: 'Asignaciones históricas', v: String(operador.assignments.length) },
        ].map((c) => (
          <div key={c.t} className="border-r border-b border-line px-4 py-4 last:border-r-0">
            <dd className="font-mono text-2xl font-medium">{c.v}</dd>
            <dt className="mt-1 text-xs text-muted">{c.t}</dt>
          </div>
        ))}
      </dl>

      <Panel
        icono="operadores"
        titulo="Qué puede operar"
        descripcion="Un tipo habilita todos los equipos de ese tipo, y se evalúa contra la fecha del turno"
      >
        <ul className="divide-y divide-line">
          {tipos.map((t) => {
            const cert = vigentePorTipo.get(t.id);
            const dias = cert ? diasHasta(cert.expiresAt) : null;
            const vigente = dias !== null && dias >= 0;

            return (
              <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <span className="min-w-40 flex-1">
                  <span className="block text-sm font-medium">{t.name}</span>
                  <span className="font-mono text-xs text-muted">{t.code}</span>
                </span>

                <span className="flex-1">
                  {cert === undefined ? (
                    <Badge tono="neutro">Sin certificación</Badge>
                  ) : (
                    <>
                      <Badge tono={vigente ? (dias <= AVISO_DIAS ? 'aviso' : 'ok') : 'bloqueo'}>
                        {vigente ? 'Habilitado' : 'No habilitado'}
                      </Badge>
                      <span className="mt-1 block text-xs text-muted">
                        {vigente
                          ? `Vence el ${formatIsoDate(toIsoDate(cert.expiresAt))} · ${dias} días`
                          : `Venció el ${formatIsoDate(toIsoDate(cert.expiresAt))}`}
                        {cert.documentRef && ` · certificado ${cert.documentRef}`}
                      </span>
                    </>
                  )}
                </span>

                {puedeOperar && vigente && (
                  <RevocarCertificacion
                    operatorId={operador.id}
                    equipmentTypeId={t.id}
                    tipoNombre={t.name}
                  />
                )}
              </li>
            );
          })}
        </ul>

        <p className="border-t border-line px-4 py-3 text-xs text-muted">
          Revocar no borra el registro: adelanta el vencimiento a ayer, así el operador deja de
          estar habilitado desde hoy y los turnos ya validados conservan las fechas que eran
          ciertas cuando se aprobaron.
        </p>
      </Panel>

      {puedeOperar && (
        <Panel
          icono="mas"
          titulo="Otorgar o renovar certificación"
          descripcion="Habilita al operador para un tipo de equipo entre dos fechas"
          className="mt-6"
        >
          <OtorgarCertificacion
            operatorId={operador.id}
            tipos={tipos.map((t) => ({ id: t.id, code: t.code, name: t.name }))}
          />
        </Panel>
      )}

      {puedeOperar && (
        <Panel icono="bloqueado" titulo="Situación del operador" className="mt-6">
          <CambiarSituacion operatorId={operador.id} activo={operador.active} />
        </Panel>
      )}

      <Panel
        icono="turnos"
        titulo="Historial de asignaciones"
        descripcion="Últimas 20, de la más reciente a la más antigua"
        className="mt-6"
      >
        {operador.assignments.length === 0 ? (
          <Vacio>Este operador todavía no ha sido asignado a ningún turno.</Vacio>
        ) : (
          <div className={tabla.wrapper}>
            <table className={tabla.table}>
              <thead>
                <tr>
                  <th scope="col" className={tabla.th}>Turno</th>
                  <th scope="col" className={tabla.th}>Jornada</th>
                  <th scope="col" className={tabla.th}>Equipo</th>
                  <th scope="col" className={tabla.th}>Estado</th>
                  <th scope="col" className={`${tabla.th} text-right`}>Planificadas</th>
                  <th scope="col" className={`${tabla.th} text-right`}>Reales</th>
                </tr>
              </thead>
              <tbody>
                {operador.assignments.map((a) => (
                  <tr key={a.id}>
                    <td className={`${tabla.td} font-mono whitespace-nowrap`}>
                      <Link href={`/turnos/${a.shiftId}`} className="hover:text-accent">
                        {formatIsoDate(toIsoDate(a.shift.date))}
                      </Link>
                    </td>
                    <td className={tabla.td}>{JORNADA[a.shift.journey]}</td>
                    <td className={tabla.td}>
                      <Link
                        href={`/equipos/${a.equipmentId}`}
                        className="font-mono hover:text-accent"
                      >
                        {a.equipment.code}
                      </Link>
                    </td>
                    <td className={tabla.td}>
                      <Badge tono={ESTADO_ASIGNACION[a.status].tono}>
                        {ESTADO_ASIGNACION[a.status].label}
                      </Badge>
                    </td>
                    <td className={`${tabla.num} text-muted`}>{formatHoras(a.plannedHours)}</td>
                    <td className={tabla.num}>
                      {a.actualHours === null ? '—' : formatHoras(a.actualHours)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ESTADO_TURNO, JORNADA, diasHasta, formatHoras } from '@/src/components/format';
import { Icon } from '@/src/components/icons';
import { BotonEnviar } from '@/src/components/submit-button';
import { Aviso, Badge, Encabezado, Panel, Vacio, campo, tabla } from '@/src/components/ui';
import { auth, requireRole } from '@/src/auth';
import { prisma } from '@/src/db/prisma';
import type { Journey } from '@/src/domain/types';
import { createShift } from '@/src/services/create-shift';
import { formatIsoDate, toIsoDate, toOperationalDate } from '@/src/services/dates';
import { ServiceError } from '@/src/services/errors';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Turnos · MineOps' };

async function crearTurno(formData: FormData) {
  'use server';

  let error: string | null = null;
  let creado: string | null = null;

  try {
    // the server check is the guarantee; hiding the form is only convenience
    await requireRole('PLANNER', 'SUPERVISOR');

    const turno = await createShift({
      date: String(formData.get('date') ?? ''),
      journey: String(formData.get('journey') ?? 'DAY') as Journey,
      plannedHours: Number(formData.get('plannedHours') ?? 12),
    });

    creado = turno.id;
  } catch (e) {
    if (!(e instanceof ServiceError)) throw e;
    error = e.message;
  }

  if (error) redirect(`/turnos?error=${encodeURIComponent(error)}`);

  revalidatePath('/turnos');
  // straight to the new shift: a shift is created in order to assign to it
  redirect(`/turnos/${creado}?nuevo=1`);
}

/** 'Hoy' reads faster than a date when deciding which shift to open */
function relativo(dias: number): string | null {
  if (dias === 0) return 'Hoy';
  if (dias === 1) return 'Mañana';
  if (dias === -1) return 'Ayer';
  return null;
}

export default async function TurnosPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  // real guard lives in the server action
  const session = await auth();
  const puedeCrear = session?.user.role === 'PLANNER' || session?.user.role === 'SUPERVISOR';

  const turnos = await prisma.shift.findMany({
    include: {
      assignments: {
        include: { equipment: true, operator: true },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: [{ date: 'desc' }, { journey: 'asc' }],
    take: 30,
  });

  const abiertos = turnos.filter((t) => t.status === 'PLANNED').length;

  return (
    <>
      <Encabezado
        titulo="Turnos"
        descripcion="Un turno por fecha y jornada. La duración planificada es la que hereda cada asignación y la que se compara contra las horas reales al cerrar."
      />

      {puedeCrear && (
        <Panel
          titulo="Nuevo turno"
          descripcion="Al crearlo se abre directamente para asignar equipos"
          className="mb-6"
        >
          <form action={crearTurno} className="flex flex-wrap items-end gap-4 px-4 py-4">
            <label className="block">
              <span className="rotulo">Fecha</span>
              <input
                type="date"
                name="date"
                required
                defaultValue={toOperationalDate(new Date())}
                className={`mt-1.5 ${campo.numero}`}
              />
            </label>

            <label className="block">
              <span className="rotulo">Jornada</span>
              <select name="journey" className={`mt-1.5 ${campo.input}`}>
                <option value="DAY">Día (07:00 a 19:00)</option>
                <option value="NIGHT">Noche (19:00 a 07:00)</option>
              </select>
            </label>

            <label className="block">
              <span className="rotulo">Duración (h)</span>
              <input
                type="number"
                name="plannedHours"
                min={1}
                max={24}
                step={0.5}
                defaultValue={12}
                className={`mt-1.5 w-28 ${campo.numero}`}
              />
            </label>

            <BotonEnviar pendiente="Creando…" icono="mas">
              Crear turno
            </BotonEnviar>
          </form>

          {error && (
            <div role="alert" className="border-t border-red-700/40">
              <Aviso tono="bloqueo">{error}</Aviso>
            </div>
          )}
        </Panel>
      )}

      <Panel
        titulo="Programación"
        descripcion={`${turnos.length} últimos turnos · ${abiertos} sin cerrar`}
      >
        {turnos.length === 0 ? (
          <Vacio>
            No hay turnos registrados. Cree el primero con el formulario de arriba: fecha,
            jornada y duración.
          </Vacio>
        ) : (
          <div className={tabla.wrapper}>
            <table className={tabla.table}>
              <thead>
                <tr>
                  <th scope="col" className={tabla.th}>Fecha</th>
                  <th scope="col" className={tabla.th}>Jornada</th>
                  <th scope="col" className={`${tabla.th} text-right`}>Duración</th>
                  <th scope="col" className={tabla.th}>Estado</th>
                  <th scope="col" className={tabla.th}>Asignaciones</th>
                  <th scope="col" className={tabla.th}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {turnos.map((t) => {
                  const cuando = relativo(diasHasta(t.date));
                  const vigentes = t.assignments.filter((a) => a.status !== 'CANCELLED');
                  const enRiesgo = vigentes.filter((a) => a.status === 'AT_RISK');

                  return (
                    <tr key={t.id}>
                      <td className={`${tabla.td} whitespace-nowrap`}>
                        <Link
                          href={`/turnos/${t.id}`}
                          className="font-mono hover:text-accent"
                        >
                          {formatIsoDate(toIsoDate(t.date))}
                        </Link>
                        {cuando && (
                          <span className="ml-2 text-xs font-medium text-accent">{cuando}</span>
                        )}
                      </td>
                      <td className={tabla.td}>{JORNADA[t.journey]}</td>
                      <td className={tabla.num}>{formatHoras(t.plannedHours)} h</td>
                      <td className={tabla.td}>
                        <Badge tono={ESTADO_TURNO[t.status].tono}>
                          {ESTADO_TURNO[t.status].label}
                        </Badge>
                      </td>
                      <td className={`${tabla.td} max-w-md`}>
                        {vigentes.length === 0 ? (
                          <span className="text-sm text-muted">Sin asignaciones</span>
                        ) : (
                          <>
                            <span className="text-sm">
                              {vigentes.length}{' '}
                              {vigentes.length === 1 ? 'asignación' : 'asignaciones'}
                            </span>
                            {enRiesgo.length > 0 && (
                              <span className="ml-2 text-xs text-amber-800">
                                · {enRiesgo.length} en riesgo
                              </span>
                            )}
                            <span className="mt-0.5 block truncate text-xs text-muted">
                              {vigentes.map((a) => a.equipment.code).join(', ')}
                            </span>
                          </>
                        )}
                      </td>
                      <td className={tabla.td}>
                        <Link
                          href={`/turnos/${t.id}`}
                          className="inline-flex items-center gap-1.5 border border-line px-3 py-1.5 text-xs whitespace-nowrap hover:border-accent hover:text-accent"
                        >
                          {t.status === 'PLANNED' ? 'Asignar o cerrar' : 'Ver detalle'}
                          <Icon name="flecha" className="size-3.5" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

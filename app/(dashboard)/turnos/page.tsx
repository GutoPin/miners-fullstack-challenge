import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ESTADO_TURNO, JORNADA, formatHoras } from '@/src/components/format';
import { Badge, Encabezado, Panel, Vacio, tabla } from '@/src/components/ui';
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

  try {
    // El rol se comprueba en el servidor. Que el formulario no se dibuje para un VIEWER
    // es comodidad; esto es la garantía.
    await requireRole('PLANNER', 'SUPERVISOR');

    await createShift({
      date: String(formData.get('date') ?? ''),
      journey: String(formData.get('journey') ?? 'DAY') as Journey,
      plannedHours: Number(formData.get('plannedHours') ?? 12),
    });
  } catch (e) {
    if (!(e instanceof ServiceError)) throw e;
    error = e.message;
  }

  if (error) redirect(`/turnos?error=${encodeURIComponent(error)}`);

  revalidatePath('/turnos');
  redirect('/turnos');
}

export default async function TurnosPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  // Ocultar el formulario a quien no puede crear es cortesía; la guarda real está dentro
  // de la Server Action.
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

  return (
    <>
      <Encabezado
        titulo="Turnos"
        descripcion="Un turno por fecha y jornada. La duración planificada es la que hereda cada asignación y la que se compara contra las horas reales al cerrar."
      />

      {puedeCrear && (
        <Panel titulo="Nuevo turno" className="mb-6">
          <form action={crearTurno} className="flex flex-wrap items-end gap-4 px-4 py-4">
            <label className="block">
              <span className="rotulo">Fecha</span>
              <input
                type="date"
                name="date"
                required
                defaultValue={toOperationalDate(new Date())}
                className="mt-1.5 block border border-line bg-canvas px-3 py-2 font-mono text-sm"
              />
            </label>

            <label className="block">
              <span className="rotulo">Jornada</span>
              <select
                name="journey"
                className="mt-1.5 block border border-line bg-canvas px-3 py-2 text-sm"
              >
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
                className="mt-1.5 block w-28 border border-line bg-canvas px-3 py-2 font-mono text-sm"
              />
            </label>

            <button
              type="submit"
              className="bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-accent"
            >
              Crear turno
            </button>
          </form>

          {error && (
            <p className="border-t border-red-700/40 bg-red-50 px-4 py-3 text-sm text-red-900">
              {error}
            </p>
          )}
        </Panel>
      )}

      <Panel titulo="Programación">
        {turnos.length === 0 ? (
          <Vacio>No hay turnos registrados.</Vacio>
        ) : (
          <div className={tabla.wrapper}>
            <table className={tabla.table}>
              <thead>
                <tr>
                  <th className={tabla.th}>Fecha</th>
                  <th className={tabla.th}>Jornada</th>
                  <th className={`${tabla.th} text-right`}>Duración</th>
                  <th className={tabla.th}>Estado</th>
                  <th className={tabla.th}>Asignaciones</th>
                </tr>
              </thead>
              <tbody>
                {turnos.map((t) => (
                  <tr key={t.id}>
                    <td className={`${tabla.td} font-mono whitespace-nowrap`}>
                      <Link href={`/turnos/${t.id}`} className="hover:text-accent">
                        {formatIsoDate(toIsoDate(t.date))}
                      </Link>
                    </td>
                    <td className={tabla.td}>{JORNADA[t.journey]}</td>
                    <td className={tabla.num}>{formatHoras(t.plannedHours)} h</td>
                    <td className={tabla.td}>
                      <Badge tono={ESTADO_TURNO[t.status].tono}>
                        {ESTADO_TURNO[t.status].label}
                      </Badge>
                    </td>
                    <td className={tabla.td}>
                      {t.assignments.length === 0 ? (
                        <span className="text-sm text-muted">Sin asignaciones</span>
                      ) : (
                        <ul className="space-y-0.5 text-sm">
                          {t.assignments.map((a) => (
                            <li key={a.id}>
                              <span className="font-mono">{a.equipment.code}</span>
                              <span className="text-muted"> · {a.operator.fullName}</span>
                              {a.status === 'AT_RISK' && (
                                <span className="ml-2 text-xs text-amber-800">
                                  en riesgo: {a.riskReason}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <p className="mt-3 text-xs text-muted">
        Abra un turno para asignar equipos, resolver asignaciones en riesgo y cerrarlo con las
        horas reales.
      </p>
    </>
  );
}

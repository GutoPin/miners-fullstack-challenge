import Link from 'next/link';

import { DisponibilidadPorDia, MargenVsConsumo } from '@/src/components/charts';
import { ESTADO_EQUIPO, JORNADA, formatHoras } from '@/src/components/format';
import { Aviso, Badge, Encabezado, Panel, Vacio, tabla } from '@/src/components/ui';
import type { EquipmentStatus } from '@/src/domain/types';
import { formatIsoDate, toOperationalDate } from '@/src/services/dates';
import { getProjection, type ProjectionRow } from '@/src/services/get-projection';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Proyección 7 días · MineOps' };

const DIAS = 7;

/** a unit counts as stopped from the day it crosses, and from day zero if it already is */
function detenidoEl(fila: ProjectionRow, dia: string): boolean {
  if (fila.status !== 'AVAILABLE') return true;
  if (fila.projection.status === 'ALREADY_BLOCKED') return true;
  return fila.projection.status === 'WILL_CROSS' && fila.projection.crossesOn <= dia;
}

export default async function ProyeccionPage() {
  const hoy = new Date();
  const filas = await getProjection(DIAS, hoy);

  const desde = toOperationalDate(hoy);
  const hasta = toOperationalDate(new Date(hoy.getTime() + DIAS * 86_400_000));

  // only equipment with work scheduled is a projection; the rest is present state, and the
  // fleet screen already tells it. Listing a blocked unit with no shifts as "exceeded" here
  // adds a red row to a screen about the coming week without adding a decision to take.
  const enProyeccion = filas.filter((f) => f.plannedShifts > 0);
  const sinCarga = filas.filter((f) => f.plannedShifts === 0);

  const cruzan = enProyeccion.filter((f) => f.projection.status === 'WILL_CROSS');
  const bloqueados = enProyeccion.filter((f) => f.projection.status === 'ALREADY_BLOCKED');

  const ventana = Array.from({ length: DIAS }, (_, i) =>
    toOperationalDate(new Date(hoy.getTime() + i * 86_400_000)),
  );

  const disponibilidad = ventana.map((fecha) => {
    const detenidos = filas.filter((f) => detenidoEl(f, fecha)).length;
    return { fecha, detenidos, disponibles: filas.length - detenidos };
  });

  const conCarga = enProyeccion.map((f) => ({
    code: f.code,
    margen: Math.max(0, f.projection.hoursRemaining),
    consumo: f.plannedHours,
    cruza: f.projection.status !== 'SAFE',
  }));

  return (
    <>
      <Encabezado
        titulo="Proyección a 7 días"
        descripcion={`Qué equipos van a alcanzar su mantenimiento entre el ${formatIsoDate(desde)} y el ${formatIsoDate(hasta)}. No sale de mirar el estado actual: simula turno a turno las horas planificadas de lo ya programado.`}
      />

      {cruzan.length + bloqueados.length === 0 ? (
        <Aviso tono="ok" titulo="Ningún equipo alcanza su umbral esta semana." className="mb-6">
          Con los turnos programados hoy, los {enProyeccion.length} equipos con carga llegan al{' '}
          {formatIsoDate(hasta)} sin cruzar su umbral de mantenimiento.
        </Aviso>
      ) : (
        <Aviso
          tono="aviso"
          titulo={`${cruzan.length + bloqueados.length} de ${enProyeccion.length} equipos con carga quedan fuera de servicio en la ventana.`}
          className="mb-6"
        >
          {bloqueados.length > 0 && (
            <>
              {bloqueados.length === 1 ? 'Ya está bloqueado' : 'Ya están bloqueados'}{' '}
              <strong>{bloqueados.map((f) => f.code).join(', ')}</strong>: necesitan
              mantenimiento para volver a operar.{' '}
            </>
          )}
          {cruzan.length > 0 && (
            <>
              {cruzan.length === 1 ? 'Cruza el umbral' : 'Cruzan el umbral'}{' '}
              <strong>{cruzan.map((f) => f.code).join(', ')}</strong>. Programar el servicio
              antes evita que el equipo se detenga a mitad de turno.
            </>
          )}
        </Aviso>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          titulo="Flota disponible por día"
          descripcion="Capacidad que queda cada día si no se hace ningún mantenimiento"
        >
          <DisponibilidadPorDia dias={disponibilidad} />
        </Panel>

        <Panel
          titulo="Margen contra carga programada"
          descripcion="Horas que le quedan al equipo frente a las que ya tiene comprometidas"
        >
          {conCarga.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted">
              Ningún equipo tiene turnos programados en la ventana, así que no hay consumo
              que proyectar.
            </p>
          ) : (
            <MargenVsConsumo filas={conCarga} />
          )}
        </Panel>
      </div>

      <Panel
        icono="proyeccion"
        titulo={`Detalle por equipo (${enProyeccion.length} con carga)`}
        descripcion="Solo los equipos con turnos programados en la ventana: son los únicos que hay algo que proyectar"
        className="mt-6"
      >
        {enProyeccion.length === 0 ? (
          <Vacio>
            Ningún equipo tiene turnos programados entre el {formatIsoDate(desde)} y el{' '}
            {formatIsoDate(hasta)}, así que no hay consumo de horas que simular.
          </Vacio>
        ) : (
        <div className={tabla.wrapper}>
          <table className={tabla.table}>
            <thead>
              <tr>
                <th scope="col" className={tabla.th}>Equipo</th>
                <th scope="col" className={tabla.th}>Tipo</th>
                <th scope="col" className={`${tabla.th} text-right`}>Horómetro</th>
                <th scope="col" className={`${tabla.th} text-right`}>Umbral</th>
                <th scope="col" className={`${tabla.th} text-right`}>Faltan</th>
                <th scope="col" className={tabla.th}>Cruza el</th>
                <th scope="col" className={tabla.th}>En turno</th>
                <th scope="col" className={`${tabla.th} text-right`}>Turnos</th>
                <th scope="col" className={tabla.th}>Situación</th>
              </tr>
            </thead>
            <tbody>
              {enProyeccion.map((f) => {
                const p = f.projection;
                const dias =
                  p.status === 'WILL_CROSS'
                    ? Math.round(
                        (Date.parse(`${p.crossesOn}T00:00:00Z`) -
                          Date.parse(`${desde}T00:00:00Z`)) /
                          86_400_000,
                      )
                    : null;

                return (
                  <tr key={f.equipmentId}>
                    <td className={tabla.td}>
                      <Link href={`/equipos/${f.equipmentId}`} className="font-mono hover:text-accent">
                        {f.code}
                      </Link>
                    </td>
                    <td className={`${tabla.td} text-muted`}>{f.typeName}</td>
                    <td className={tabla.num}>{formatHoras(f.currentHours)}</td>
                    <td className={`${tabla.num} text-muted`}>
                      {formatHoras(f.nextMaintenanceHours)}
                    </td>
                    <td className={tabla.num}>{formatHoras(p.hoursRemaining)}</td>
                    <td className={`${tabla.td} font-mono`}>
                      {p.status === 'WILL_CROSS' ? formatIsoDate(p.crossesOn) : '—'}
                    </td>
                    <td className={tabla.td}>
                      {p.status === 'WILL_CROSS' ? (
                        <>
                          {JORNADA[p.crossesInShift]}{' '}
                          <span className="text-xs text-muted">
                            (hora {formatHoras(p.hoursIntoShift)})
                          </span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className={`${tabla.num} text-muted`}>{f.plannedShifts}</td>
                    <td className={tabla.td}>
                      {p.status === 'ALREADY_BLOCKED' && (
                        <Badge tono="bloqueo">Ya superó el umbral</Badge>
                      )}
                      {p.status === 'WILL_CROSS' && (
                        <Badge tono={dias !== null && dias <= 2 ? 'bloqueo' : 'aviso'}>
                          {dias === 0
                            ? 'Cruza hoy'
                            : dias === 1
                              ? 'Cruza mañana'
                              : `Cruza en ${dias} días`}
                        </Badge>
                      )}
                      {p.status === 'SAFE' && <Badge tono="ok">Sin riesgo esta semana</Badge>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}

        <div className="space-y-1 border-t border-line px-4 py-3 text-xs text-muted">
          <p>
            <strong>Método:</strong> se parte del horómetro actual y se suman, en orden
            cronológico, las horas planificadas de cada turno programado con asignación
            vigente. El turno noche de un día se computa después del turno día del mismo día.
          </p>
          <p>
            <strong>Hora del turno:</strong> indica en qué hora de la jornada se cruza el
            umbral, que es lo que permite decidir si conviene acortar el turno o reprogramarlo.
          </p>
          <p>
            <strong>Faltan:</strong> horas de operación que le quedan al equipo desde su
            horómetro actual hasta el umbral, en las tres situaciones.
          </p>
        </div>
      </Panel>

      {sinCarga.length > 0 && (
        <Panel
          icono="equipos"
          titulo={`Sin turnos programados (${sinCarga.length})`}
          descripcion="No entran en la proyección porque no tienen horas que consumir esta semana"
          className="mt-6"
        >
          <ul className="divide-y divide-line">
            {sinCarga.map((f) => (
              <li key={f.equipmentId} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <Link
                  href={`/equipos/${f.equipmentId}`}
                  className="w-20 font-mono text-sm hover:text-accent"
                >
                  {f.code}
                </Link>
                <Badge tono={ESTADO_EQUIPO[f.status as EquipmentStatus].tono}>
                  {ESTADO_EQUIPO[f.status as EquipmentStatus].label}
                </Badge>
                <span className="text-xs text-muted">
                  {formatHoras(f.currentHours)} de {formatHoras(f.nextMaintenanceHours)} h del
                  umbral
                  {f.status === 'BLOCKED' &&
                    ' · necesita mantenimiento para volver a estar disponible'}
                  {f.status === 'AVAILABLE' &&
                    ' · disponible, pero nadie le ha asignado turnos en la ventana'}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}

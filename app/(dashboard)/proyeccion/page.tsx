import Link from 'next/link';

import { JORNADA, formatHoras } from '@/src/components/format';
import { Badge, Encabezado, Panel, tabla } from '@/src/components/ui';
import { formatIsoDate, toOperationalDate } from '@/src/services/dates';
import { getProjection } from '@/src/services/get-projection';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Proyección 7 días · MineOps' };

const DIAS = 7;

export default async function ProyeccionPage() {
  const hoy = new Date();
  const filas = await getProjection(DIAS, hoy);

  const desde = toOperationalDate(hoy);
  const hasta = toOperationalDate(new Date(hoy.getTime() + DIAS * 86_400_000));

  return (
    <>
      <Encabezado
        titulo="Proyección a 7 días"
        descripcion={`Qué equipos van a alcanzar su mantenimiento entre el ${formatIsoDate(desde)} y el ${formatIsoDate(hasta)}. No sale de mirar el estado actual: simula turno a turno las horas planificadas de lo ya programado.`}
      />

      <Panel>
        <div className={tabla.wrapper}>
          <table className={tabla.table}>
            <thead>
              <tr>
                <th className={tabla.th}>Equipo</th>
                <th className={tabla.th}>Tipo</th>
                <th className={`${tabla.th} text-right`}>Horómetro</th>
                <th className={`${tabla.th} text-right`}>Umbral</th>
                <th className={`${tabla.th} text-right`}>Faltan</th>
                <th className={tabla.th}>Cruza el</th>
                <th className={tabla.th}>En turno</th>
                <th className={`${tabla.th} text-right`}>Turnos</th>
                <th className={tabla.th}>Situación</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
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
    </>
  );
}

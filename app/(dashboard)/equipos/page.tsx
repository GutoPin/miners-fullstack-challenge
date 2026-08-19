import Link from 'next/link';

import { auth } from '@/src/auth';
import { ESTADO_EQUIPO, formatHoras } from '@/src/components/format';
import { Aviso, Badge, BarraHorometro, Encabezado, Panel, tabla } from '@/src/components/ui';
import { prisma } from '@/src/db/prisma';
import type { EquipmentStatus } from '@/src/domain/types';
import { NuevoEquipo } from './new-equipment-modal';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Equipos · MineOps' };

const ESTADOS: EquipmentStatus[] = [
  'AVAILABLE',
  'BLOCKED',
  'IN_MAINTENANCE',
  'OUT_OF_SERVICE',
];

export default async function EquiposPage() {
  const [session, equipos, tipos] = await Promise.all([
    auth(),
    prisma.equipment.findMany({
      include: { type: true, _count: { select: { maintenances: true } } },
      orderBy: { code: 'asc' },
    }),
    prisma.equipmentType.findMany({ orderBy: { code: 'asc' } }),
  ]);

  const puedeOperar = session?.user.role === 'PLANNER' || session?.user.role === 'SUPERVISOR';

  const porEstado = equipos.reduce<Record<string, number>>((acc, e) => {
    acc[e.status] = (acc[e.status] ?? 0) + 1;
    return acc;
  }, {});

  const bloqueados = equipos.filter((e) => e.status === 'BLOCKED');

  return (
    <>
      <Encabezado
        titulo="Equipos"
        descripcion="Horómetro, umbral de mantenimiento y estado. Un equipo se bloquea solo al alcanzar su umbral; se libera registrando el mantenimiento."
        acciones={
          puedeOperar ? (
            <NuevoEquipo
              tipos={tipos.map((t) => ({
                id: t.id,
                code: t.code,
                name: t.name,
                maintenanceIntervalHours: t.maintenanceIntervalHours,
              }))}
            />
          ) : undefined
        }
      />

      <dl className="mb-6 grid grid-cols-2 border border-line bg-surface sm:grid-cols-4">
        {ESTADOS.map((s) => (
          <div key={s} className="border-r border-b border-line px-4 py-4 last:border-r-0">
            <dd className="font-mono text-2xl font-medium">{porEstado[s] ?? 0}</dd>
            <dt className="mt-1 text-xs text-muted">{ESTADO_EQUIPO[s].label}</dt>
          </div>
        ))}
      </dl>

      {bloqueados.length > 0 && (
        <Aviso
          tono="bloqueo"
          titulo={`${bloqueados.length} ${bloqueados.length === 1 ? 'equipo bloqueado' : 'equipos bloqueados'} por horómetro.`}
          className="mb-6"
        >
          {bloqueados.map((e, i) => (
            <span key={e.id}>
              {i > 0 && ', '}
              <Link href={`/equipos/${e.id}`} className="font-mono underline">
                {e.code}
              </Link>
            </span>
          ))}
          . No se pueden asignar a ningún turno hasta que se registre su mantenimiento.
        </Aviso>
      )}

      <Panel titulo="Flota" descripcion="La barra compara el horómetro con el umbral de cada unidad">
        <div className={tabla.wrapper}>
          <table className={tabla.table}>
            <thead>
              <tr>
                <th scope="col" className={tabla.th}>Código</th>
                <th scope="col" className={tabla.th}>Tipo</th>
                <th scope="col" className={tabla.th}>Estado</th>
                <th scope="col" className={tabla.th}>Uso del ciclo</th>
                <th scope="col" className={`${tabla.th} text-right`}>Horómetro</th>
                <th scope="col" className={`${tabla.th} text-right`}>Umbral</th>
                <th scope="col" className={`${tabla.th} text-right`}>Faltan</th>
                <th scope="col" className={`${tabla.th} text-right`}>Servicios</th>
              </tr>
            </thead>
            <tbody>
              {equipos.map((e) => {
                const actual = Number(e.currentHours);
                const umbral = Number(e.nextMaintenanceHours);
                const faltan = umbral - actual;

                return (
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
                    <td className={tabla.td}>
                      <BarraHorometro actual={actual} umbral={umbral} />
                    </td>
                    <td className={tabla.num}>{formatHoras(actual)}</td>
                    <td className={`${tabla.num} text-muted`}>{formatHoras(umbral)}</td>
                    <td className={`${tabla.num} ${faltan <= 0 ? 'text-red-800' : ''}`}>
                      {faltan <= 0 ? `+${formatHoras(-faltan)}` : formatHoras(faltan)}
                    </td>
                    <td className={`${tabla.num} text-muted`}>{e._count.maintenances}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="border-t border-line px-4 py-3 text-xs text-muted">
          &laquo;Faltan&raquo; es la diferencia entre el umbral y el horómetro. En rojo y con
          signo <span className="font-mono">+</span>, las horas operadas por encima del umbral.
          La franja ámbar de la barra es el último 10 % del ciclo y la marca vertical es el
          umbral que bloquea la unidad.
        </p>
      </Panel>
    </>
  );
}

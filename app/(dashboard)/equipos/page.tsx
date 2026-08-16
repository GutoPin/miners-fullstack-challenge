import Link from 'next/link';

import { ESTADO_EQUIPO, formatHoras } from '@/src/components/format';
import { Badge, BarraHorometro, Encabezado, Panel, tabla } from '@/src/components/ui';
import { prisma } from '@/src/db/prisma';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Equipos · MineOps' };

export default async function EquiposPage() {
  const equipos = await prisma.equipment.findMany({
    include: { type: true, _count: { select: { maintenances: true } } },
    orderBy: { code: 'asc' },
  });

  return (
    <>
      <Encabezado
        titulo="Equipos"
        descripcion="Horómetro, umbral de mantenimiento y estado. Un equipo se bloquea solo al alcanzar su umbral; se libera registrando el mantenimiento."
      />

      <Panel>
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
      </Panel>

      <p className="mt-3 text-xs text-muted">
        &laquo;Faltan&raquo; es la diferencia entre el umbral y el horómetro. En rojo y con
        signo <span className="font-mono">+</span>, las horas operadas por encima del umbral.
      </p>
    </>
  );
}

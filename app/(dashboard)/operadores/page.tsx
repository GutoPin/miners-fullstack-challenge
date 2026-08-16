import { diasHasta } from '@/src/components/format';
import { Badge, Encabezado, Panel, Vacio, tabla } from '@/src/components/ui';
import { prisma } from '@/src/db/prisma';
import { formatIsoDate, toIsoDate } from '@/src/services/dates';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Operadores · MineOps' };

/** Aviso a 30 días: es el plazo con el que una renovación todavía se puede gestionar. */
const AVISO_DIAS = 30;

export default async function OperadoresPage() {
  const operadores = await prisma.operator.findMany({
    include: {
      certifications: { include: { equipmentType: true }, orderBy: { expiresAt: 'desc' } },
    },
    orderBy: { code: 'asc' },
  });

  return (
    <>
      <Encabezado
        titulo="Operadores"
        descripcion="Certificaciones por tipo de equipo y su vencimiento. La vigencia se evalúa contra la fecha del turno, no contra hoy: por eso una certificación vigente hoy puede rechazar un turno de la próxima semana."
      />

      <Panel>
        <div className={tabla.wrapper}>
          <table className={tabla.table}>
            <thead>
              <tr>
                <th scope="col" className={tabla.th}>Código</th>
                <th scope="col" className={tabla.th}>Operador</th>
                <th scope="col" className={tabla.th}>Documento</th>
                <th scope="col" className={tabla.th}>Situación</th>
                <th scope="col" className={tabla.th}>Certificaciones</th>
              </tr>
            </thead>
            <tbody>
              {operadores.map((o) => (
                <tr key={o.id}>
                  <td className={`${tabla.td} font-mono`}>{o.code}</td>
                  <td className={`${tabla.td} font-medium`}>{o.fullName}</td>
                  <td className={`${tabla.td} font-mono text-muted`}>{o.document}</td>
                  <td className={tabla.td}>
                    <Badge tono={o.active ? 'ok' : 'neutro'}>
                      {o.active ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </td>
                  <td className={tabla.td}>
                    {o.certifications.length === 0 ? (
                      <span className="text-sm text-muted">
                        Sin certificaciones: no puede recibir asignaciones.
                      </span>
                    ) : (
                      <ul className="space-y-1.5">
                        {o.certifications.map((c) => {
                          const dias = diasHasta(c.expiresAt);
                          const tono = dias < 0 ? 'bloqueo' : dias <= AVISO_DIAS ? 'aviso' : 'ok';
                          const detalle =
                            dias < 0
                              ? `venció el ${formatIsoDate(toIsoDate(c.expiresAt))}`
                              : `vence el ${formatIsoDate(toIsoDate(c.expiresAt))} · ${dias} días`;

                          return (
                            <li key={c.id} className="flex flex-wrap items-center gap-2">
                              <Badge tono={tono}>{c.equipmentType.name}</Badge>
                              <span className="text-xs text-muted">{detalle}</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {operadores.length === 0 && <Vacio>No hay operadores registrados.</Vacio>}
      </Panel>
    </>
  );
}

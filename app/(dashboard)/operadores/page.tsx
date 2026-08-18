import { diasHasta } from '@/src/components/format';
import { Aviso, Badge, Encabezado, Panel, Vacio, tabla } from '@/src/components/ui';
import { prisma } from '@/src/db/prisma';
import { formatIsoDate, toIsoDate } from '@/src/services/dates';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Operadores · MineOps' };

/** 30 days ahead: still enough time to process a renewal */
const AVISO_DIAS = 30;

export default async function OperadoresPage() {
  const operadores = await prisma.operator.findMany({
    include: {
      certifications: { include: { equipmentType: true }, orderBy: { expiresAt: 'desc' } },
    },
    orderBy: { code: 'asc' },
  });

  const certificaciones = operadores.flatMap((o) =>
    o.certifications.map((c) => ({ operador: o.fullName, dias: diasHasta(c.expiresAt) })),
  );
  const vencidas = certificaciones.filter((c) => c.dias < 0);
  const porVencer = certificaciones.filter((c) => c.dias >= 0 && c.dias <= AVISO_DIAS);
  const sinCertificar = operadores.filter((o) => o.certifications.length === 0);

  return (
    <>
      <Encabezado
        titulo="Operadores"
        descripcion="Certificaciones por tipo de equipo y su vencimiento. La vigencia se evalúa contra la fecha del turno, no contra hoy: por eso una certificación vigente hoy puede rechazar un turno de la próxima semana."
      />

      <dl className="mb-6 grid grid-cols-2 border border-line bg-surface sm:grid-cols-4">
        {[
          { t: 'Operadores', v: operadores.length },
          { t: 'Certificaciones vigentes', v: certificaciones.length - vencidas.length },
          { t: `Vencen en ${AVISO_DIAS} días`, v: porVencer.length },
          { t: 'Vencidas', v: vencidas.length },
        ].map((c) => (
          <div key={c.t} className="border-r border-b border-line px-4 py-4 last:border-r-0">
            <dd className="font-mono text-2xl font-medium">{c.v}</dd>
            <dt className="mt-1 text-xs text-muted">{c.t}</dt>
          </div>
        ))}
      </dl>

      {(vencidas.length > 0 || sinCertificar.length > 0) && (
        <Aviso tono="aviso" titulo="Hay operadores que no pueden recibir ciertas asignaciones." className="mb-6">
          {vencidas.length > 0 && (
            <>
              {vencidas.length}{' '}
              {vencidas.length === 1 ? 'certificación vencida' : 'certificaciones vencidas'}: el
              sistema rechaza la asignación al tipo de equipo correspondiente, y un supervisor
              puede autorizarla dejando constancia.{' '}
            </>
          )}
          {sinCertificar.length > 0 && (
            <>
              {sinCertificar.map((o) => o.fullName).join(', ')} no{' '}
              {sinCertificar.length === 1 ? 'tiene' : 'tienen'} ninguna certificación
              registrada.
            </>
          )}
        </Aviso>
      )}

      <Panel titulo="Plantilla" descripcion="Los días indicados se cuentan desde hoy">
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

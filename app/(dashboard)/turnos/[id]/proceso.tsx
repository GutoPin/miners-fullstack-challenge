import { Icon, type NombreIcono } from '@/src/components/icons';
import { IrAPanel } from '@/src/components/jump-link';

/**
 * What a planned shift still needs, in the order it needs it. A shift screen shows three
 * panels at once and nothing says which one is the user's turn; this strip does, and each
 * step jumps to its own panel and drops the cursor in its first field.
 */
type Estado = 'hecho' | 'actual' | 'pendiente';

const ESTILO: Record<Estado, { caja: string; numero: string; etiqueta: string }> = {
  hecho: {
    caja: 'border-emerald-700/30 bg-emerald-50',
    numero: 'bg-emerald-700 text-white',
    etiqueta: 'Listo',
  },
  actual: {
    caja: 'border-accent bg-amber-50',
    numero: 'bg-accent text-white',
    etiqueta: 'Le toca',
  },
  pendiente: {
    caja: 'border-line bg-surface',
    numero: 'bg-line text-muted',
    etiqueta: 'Después',
  },
};

export function Proceso({ asignadas, enRiesgo }: { asignadas: number; enRiesgo: number }) {
  const pasos: {
    titulo: string;
    detalle: string;
    objetivo: string;
    icono: NombreIcono;
    estado: Estado;
  }[] = [
    {
      titulo: 'Asignar',
      detalle:
        asignadas === 0
          ? 'Todavía no hay ningún equipo asignado a este turno.'
          : `${asignadas} ${asignadas === 1 ? 'asignación vigente' : 'asignaciones vigentes'}. Puede agregar más.`,
      objetivo: 'asignar',
      icono: 'mas',
      estado: asignadas === 0 ? 'actual' : 'hecho',
    },
    {
      titulo: 'Resolver riesgos',
      detalle:
        enRiesgo > 0
          ? `${enRiesgo} ${enRiesgo === 1 ? 'asignación quedó en riesgo' : 'asignaciones quedaron en riesgo'} y bloquean el cierre.`
          : 'Ninguna asignación quedó en riesgo.',
      objetivo: asignadas === 0 ? 'asignar' : 'asignaciones',
      icono: 'alerta',
      estado: enRiesgo > 0 ? 'actual' : asignadas === 0 ? 'pendiente' : 'hecho',
    },
    {
      titulo: 'Cerrar turno',
      detalle:
        asignadas === 0
          ? 'Necesita al menos una asignación vigente.'
          : enRiesgo > 0
            ? 'Disponible cuando no queden asignaciones en riesgo.'
            : 'Registre las horas reales y súmelas al horómetro.',
      objetivo: 'cerrar',
      icono: 'visto',
      estado: asignadas > 0 && enRiesgo === 0 ? 'actual' : 'pendiente',
    },
  ];

  return (
    <section aria-label="Estado del turno" className="mb-6">
      <ol className="grid gap-3 sm:grid-cols-3">
        {pasos.map((p, i) => {
          const s = ESTILO[p.estado];

          return (
            <li key={p.titulo}>
              <IrAPanel
                objetivo={p.objetivo}
                className={`group flex h-full gap-3 border p-3 hover:border-accent ${s.caja}`}
              >
                <span
                  aria-hidden
                  className={`flex size-6 shrink-0 items-center justify-center text-xs font-semibold ${s.numero}`}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-medium">{p.titulo}</span>
                    <span className="rotulo">{s.etiqueta}</span>
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">{p.detalle}</span>
                </span>
                <Icon
                  name={p.estado === 'actual' ? p.icono : 'flecha'}
                  className={`mt-0.5 size-4 shrink-0 ${
                    p.estado === 'actual'
                      ? 'text-accent'
                      : 'text-muted opacity-0 transition-opacity group-hover:opacity-100'
                  }`}
                />
              </IrAPanel>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Rule 11 made visible: every reason a rejection has, with its severity and what to do. */
import type { Violation } from '../domain/rules/violation';
import { Badge } from './ui';

const SEVERIDAD = {
  HARD: { etiqueta: 'No autorizable', tono: 'bloqueo' as const },
  OVERRIDABLE: { etiqueta: 'Autorizable por supervisor', tono: 'aviso' as const },
  WARNING: { etiqueta: 'Advertencia', tono: 'taller' as const },
};

export function PanelViolaciones({
  mensaje,
  violations,
}: {
  mensaje: string;
  violations: Violation[];
}) {
  if (violations.length === 0) {
    return (
      <p className="border border-red-700/40 bg-red-50 px-4 py-3 text-sm text-red-900">
        {mensaje}
      </p>
    );
  }

  return (
    <div className="border border-red-700/40 bg-red-50/60">
      <p className="border-b border-red-700/20 px-4 py-2.5 text-sm font-medium text-red-900">
        {mensaje}
      </p>

      <ul className="divide-y divide-red-700/15">
        {violations.map((v) => (
          <li key={v.code} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tono={SEVERIDAD[v.severity].tono}>{v.code}</Badge>
              <span className="text-xs text-muted">{SEVERIDAD[v.severity].etiqueta}</span>
            </div>
            <p className="mt-1.5 text-sm">{v.message}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

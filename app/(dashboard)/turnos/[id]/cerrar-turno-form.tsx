'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { postJson, type ApiError } from '@/src/components/api';
import { formatHoras } from '@/src/components/format';
import { PanelViolaciones } from '@/src/components/panel-violaciones';
import { tabla } from '@/src/components/ui';

export interface FilaCierre {
  id: string;
  equipmentCode: string;
  operatorName: string;
  plannedHours: number;
  currentHours: number;
  nextMaintenanceHours: number;
}

/** Los mismos umbrales que aplica el servidor (REGLAS-NEGOCIO §3). */
const DESVIO_HORAS = 2;
const DESVIO_RELATIVO = 0.25;

export function CerrarTurnoForm({ shiftId, filas }: { shiftId: string; filas: FilaCierre[] }) {
  const router = useRouter();
  const [horas, setHoras] = useState<Record<string, number>>(
    Object.fromEntries(filas.map((f) => [f.id, f.plannedHours])),
  );
  const [notas, setNotas] = useState<Record<string, string>>({});
  const [error, setError] = useState<ApiError | null>(null);
  const [enviando, setEnviando] = useState(false);

  function desvioGrande(fila: FilaCierre) {
    const variacion = (horas[fila.id] ?? fila.plannedHours) - fila.plannedHours;
    return (
      Math.abs(variacion) > DESVIO_HORAS ||
      (fila.plannedHours > 0 && Math.abs(variacion) / fila.plannedHours > DESVIO_RELATIVO)
    );
  }

  const faltaNota = filas.some((f) => desvioGrande(f) && !(notas[f.id] ?? '').trim());

  async function cerrar() {
    setEnviando(true);
    setError(null);

    const res = await postJson(`/api/shifts/${shiftId}/close`, { actualHours: horas, notes: notas });

    setEnviando(false);

    if (res.ok) router.refresh();
    else setError(res.error);
  }

  return (
    <div>
      <div className={tabla.wrapper}>
        <table className={tabla.table}>
          <thead>
            <tr>
              <th className={tabla.th}>Equipo</th>
              <th className={tabla.th}>Operador</th>
              <th className={`${tabla.th} text-right`}>Planificadas</th>
              <th className={`${tabla.th} text-right`}>Reales</th>
              <th className={tabla.th}>Impacto en el horómetro</th>
              <th className={tabla.th}>Nota del desvío</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const reales = horas[f.id] ?? f.plannedHours;
              const despues = f.currentHours + reales;
              const bloquea = despues >= f.nextMaintenanceHours;

              return (
                <tr key={f.id}>
                  <td className={`${tabla.td} font-mono`}>{f.equipmentCode}</td>
                  <td className={tabla.td}>{f.operatorName}</td>
                  <td className={`${tabla.num} text-muted`}>{formatHoras(f.plannedHours)}</td>
                  <td className={tabla.td}>
                    <input
                      type="number"
                      min={0.5}
                      max={24}
                      step={0.5}
                      value={reales}
                      onChange={(e) =>
                        setHoras({ ...horas, [f.id]: Number(e.target.value) })
                      }
                      className="w-24 border border-line bg-canvas px-2 py-1.5 text-right font-mono text-sm"
                    />
                  </td>
                  <td className={`${tabla.td} text-xs`}>
                    {/* Ver la consecuencia antes de confirmarla es el punto de esta pantalla. */}
                    {formatHoras(f.currentHours)} → {formatHoras(despues)} h
                    {bloquea && (
                      <strong className="ml-1 text-red-800">· quedará BLOQUEADO</strong>
                    )}
                  </td>
                  <td className={tabla.td}>
                    {desvioGrande(f) ? (
                      <input
                        required
                        value={notas[f.id] ?? ''}
                        onChange={(e) => setNotas({ ...notas, [f.id]: e.target.value })}
                        placeholder="Obligatoria: explique el desvío"
                        className="w-64 border border-amber-700/50 bg-amber-50 px-2 py-1.5 text-sm"
                      />
                    ) : (
                      <input
                        value={notas[f.id] ?? ''}
                        onChange={(e) => setNotas({ ...notas, [f.id]: e.target.value })}
                        placeholder="Opcional"
                        className="w-64 border border-line bg-canvas px-2 py-1.5 text-sm"
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 border-t border-line px-4 py-4">
        {error && <PanelViolaciones mensaje={error.message} violations={error.violations} />}

        {faltaNota && (
          <p className="text-sm text-amber-900">
            Hay desvíos mayores a {DESVIO_HORAS} h o al {DESVIO_RELATIVO * 100} % sin
            justificar. Sin la nota el dato se ensucia y nadie puede auditarlo después.
          </p>
        )}

        <button
          type="button"
          disabled={enviando || faltaNota}
          onClick={() => void cerrar()}
          className="bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-accent disabled:opacity-40"
        >
          {enviando ? 'Cerrando…' : 'Cerrar turno y sumar horas al horómetro'}
        </button>
      </div>
    </div>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { postJson, type ApiError } from '@/src/components/api';
import { formatHoras } from '@/src/components/format';
import { PanelViolaciones } from '@/src/components/violations-panel';
import { Aviso, boton, tabla } from '@/src/components/ui';

export interface FilaCierre {
  id: string;
  equipmentCode: string;
  operatorName: string;
  plannedHours: number;
  currentHours: number;
  nextMaintenanceHours: number;
}

/** same thresholds the server applies */
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

  const reales = (f: FilaCierre) => horas[f.id] ?? f.plannedHours;

  function desvioGrande(fila: FilaCierre) {
    const variacion = reales(fila) - fila.plannedHours;
    return (
      Math.abs(variacion) > DESVIO_HORAS ||
      (fila.plannedHours > 0 && Math.abs(variacion) / fila.plannedHours > DESVIO_RELATIVO)
    );
  }

  const faltaNota = filas.some((f) => desvioGrande(f) && !(notas[f.id] ?? '').trim());
  const totalHoras = filas.reduce((t, f) => t + reales(f), 0);
  const seBloquean = filas.filter((f) => f.currentHours + reales(f) >= f.nextMaintenanceHours);

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
              <th scope="col" className={tabla.th}>Equipo</th>
              <th scope="col" className={tabla.th}>Operador</th>
              <th scope="col" className={`${tabla.th} text-right`}>Planificadas</th>
              <th scope="col" className={`${tabla.th} text-right`}>Reales</th>
              <th scope="col" className={tabla.th}>Impacto en el horómetro</th>
              <th scope="col" className={tabla.th}>Nota del desvío</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const h = reales(f);
              const despues = f.currentHours + h;
              const bloquea = despues >= f.nextMaintenanceHours;

              return (
                <tr key={f.id} className={bloquea ? 'bg-red-50/50' : undefined}>
                  <td className={`${tabla.td} font-mono`}>{f.equipmentCode}</td>
                  <td className={tabla.td}>{f.operatorName}</td>
                  <td className={`${tabla.num} text-muted`}>{formatHoras(f.plannedHours)}</td>
                  <td className={tabla.td}>
                    <input
                      type="number"
                      // without a name, a screen reader announces twelve identical boxes
                      aria-label={`Horas reales de ${f.equipmentCode}`}
                      min={0.5}
                      max={24}
                      step={0.5}
                      value={h}
                      onChange={(e) =>
                        setHoras({ ...horas, [f.id]: Number(e.target.value) })
                      }
                      className="w-24 border border-line bg-canvas px-2 py-2 text-right font-mono text-sm"
                    />
                  </td>
                  <td className={`${tabla.td} text-xs`}>
                    {/* seeing the consequence before confirming is the point of this screen */}
                    {formatHoras(f.currentHours)} → {formatHoras(despues)} h
                    {bloquea && (
                      <strong className="ml-1 text-red-800">· quedará BLOQUEADO</strong>
                    )}
                  </td>
                  <td className={tabla.td}>
                    <input
                      required={desvioGrande(f)}
                      autoComplete="off"
                      aria-label={`Nota del desvío de ${f.equipmentCode}`}
                      value={notas[f.id] ?? ''}
                      onChange={(e) => setNotas({ ...notas, [f.id]: e.target.value })}
                      placeholder={
                        desvioGrande(f) ? 'Obligatoria: explique el desvío' : 'Opcional'
                      }
                      className={`w-64 px-2 py-2 text-sm ${
                        desvioGrande(f)
                          ? 'border border-amber-700/50 bg-amber-50'
                          : 'border border-line bg-canvas'
                      }`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 border-t border-line px-4 py-4">
        <Aviso tono={seBloquean.length > 0 ? 'aviso' : 'neutro'} titulo="Al cerrar, esto pasa:">
          <ul className="list-disc space-y-0.5 pl-4">
            <li>
              Se suman <strong>{formatHoras(totalHoras)} h</strong> repartidas entre{' '}
              {filas.length} {filas.length === 1 ? 'equipo' : 'equipos'}, cada una con su
              asiento en la bitácora.
            </li>
            <li>
              {seBloquean.length === 0
                ? 'Ningún equipo alcanza su umbral con estas horas.'
                : `Quedan BLOQUEADOS ${seBloquean.map((f) => f.equipmentCode).join(', ')} por alcanzar su umbral, y sus asignaciones futuras pasan a EN RIESGO.`}
            </li>
            <li>El turno queda cerrado: no se vuelve a cerrar ni admite cambios.</li>
          </ul>
        </Aviso>

        {error && (
          <div role="alert">
            <PanelViolaciones mensaje={error.message} violations={error.violations} />
          </div>
        )}

        {faltaNota && (
          <Aviso tono="aviso" titulo="Faltan notas de desvío.">
            Hay diferencias mayores a {DESVIO_HORAS} h o al {DESVIO_RELATIVO * 100} % entre las
            horas planificadas y las reales. Sin la nota el dato pierde valor para reportería y
            nadie puede auditarlo después.
          </Aviso>
        )}

        <button
          type="button"
          disabled={enviando || faltaNota}
          onClick={() => void cerrar()}
          className={boton.primario}
        >
          {enviando ? 'Cerrando…' : 'Cerrar turno y sumar horas al horómetro'}
        </button>
      </div>
    </div>
  );
}

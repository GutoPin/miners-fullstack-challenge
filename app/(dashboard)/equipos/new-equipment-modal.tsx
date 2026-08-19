'use client';

import { useActionState, useState } from 'react';

import { formatHoras } from '@/src/components/format';
import { Icon } from '@/src/components/icons';
import { Modal } from '@/src/components/modal';
import { BotonEnviar } from '@/src/components/submit-button';
import { Aviso, boton, campo } from '@/src/components/ui';
import { crearEquipo } from './actions';
import type { EstadoAccion } from '../operadores/actions';

export interface TipoConIntervalo {
  id: string;
  code: string;
  name: string;
  maintenanceIntervalHours: number;
}

/** mirrors nextThreshold() anchored at zero, only to preview the number the server will fix */
function primerUmbral(horas: number, intervalo: number): number {
  if (!(intervalo > 0)) return 0;
  return Math.max(intervalo, Math.ceil((horas + 1) / intervalo) * intervalo);
}

export function NuevoEquipo({ tipos }: { tipos: TipoConIntervalo[] }) {
  const [abierto, setAbierto] = useState(false);
  const [typeId, setTypeId] = useState(tipos[0]?.id ?? '');
  const [horas, setHoras] = useState(0);
  const [intervalo, setIntervalo] = useState('');
  // closing belongs to the action's own continuation, not to an effect watching its result
  const [estado, accion] = useActionState<EstadoAccion, FormData>(async (previo, formData) => {
    const resultado = await crearEquipo(previo, formData);
    if (resultado.ok) setAbierto(false);
    return resultado;
  }, {});

  const tipo = tipos.find((t) => t.id === typeId);
  const intervaloReal = intervalo ? Number(intervalo) : (tipo?.maintenanceIntervalHours ?? 0);
  const umbral = primerUmbral(horas, intervaloReal);

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className={boton.primario}>
        <Icon name="mas" />
        Nuevo equipo
      </button>

      {estado.ok && !abierto && (
        <Aviso tono="ok" className="mt-4">
          {estado.ok}
        </Aviso>
      )}

      <Modal
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        titulo="Nuevo equipo"
        descripcion="El horómetro con el que entra la unidad define su primer umbral de mantenimiento."
      >
        <form action={accion} className="space-y-5 px-5 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="rotulo">Código</span>
              <input
                name="code"
                required
                autoFocus
                autoComplete="off"
                spellCheck={false}
                placeholder="CAM-004"
                className={`mt-1.5 ${campo.input} font-mono uppercase`}
              />
            </label>

            <label className="block">
              <span className="rotulo">Tipo de equipo</span>
              <select
                name="typeId"
                required
                value={typeId}
                onChange={(e) => setTypeId(e.target.value)}
                className={`mt-1.5 ${campo.input}`}
              >
                {tipos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.code}) · cada {t.maintenanceIntervalHours} h
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="rotulo">Horómetro inicial</span>
              <input
                type="number"
                name="currentHours"
                min={0}
                step={0.5}
                required
                value={horas}
                onChange={(e) => setHoras(Number(e.target.value))}
                className={`mt-1.5 w-full ${campo.numero}`}
              />
            </label>

            <label className="block">
              <span className="rotulo">Intervalo propio (h)</span>
              <input
                type="number"
                name="maintenanceIntervalOverride"
                min={1}
                step={1}
                value={intervalo}
                onChange={(e) => setIntervalo(e.target.value)}
                placeholder={`Hereda ${tipo?.maintenanceIntervalHours ?? 0} h del tipo`}
                className={`mt-1.5 w-full ${campo.input} text-right font-mono`}
              />
            </label>
          </div>

          <Aviso tono="neutro" titulo="Al registrarlo, esto pasa:">
            <ul className="list-disc space-y-0.5 pl-4">
              <li>
                La unidad nace <strong>DISPONIBLE</strong> con {formatHoras(horas)} h y se
                bloqueará al alcanzar <strong>{formatHoras(umbral)} h</strong>, el primer
                múltiplo de {intervaloReal} h por delante de su horómetro.
              </li>
              <li>
                Se asienta un movimiento <span className="font-mono">INITIAL_LOAD</span> en la
                bitácora: ninguna cifra de horómetro entra al sistema sin su registro.
              </li>
            </ul>
          </Aviso>

          {estado.error && (
            <div role="alert">
              <Aviso tono="bloqueo">{estado.error}</Aviso>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
            <button type="button" onClick={() => setAbierto(false)} className={boton.secundario}>
              Cancelar
            </button>
            <BotonEnviar pendiente="Registrando…" icono="visto">
              Registrar equipo
            </BotonEnviar>
          </div>
        </form>
      </Modal>
    </>
  );
}

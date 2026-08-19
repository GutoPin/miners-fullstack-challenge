'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { postJson, type ApiError } from '@/src/components/api';
import { PanelViolaciones } from '@/src/components/violations-panel';
import { formatHoras } from '@/src/components/format';
import { Icon, Spinner } from '@/src/components/icons';
import { Aviso, BarraHorometro, boton, campo } from '@/src/components/ui';
import type { Violation } from '@/src/domain/rules/violation';

export interface OpcionEquipo {
  id: string;
  code: string;
  typeName: string;
  estado: string;
  disponible: boolean;
  currentHours: number;
  nextMaintenanceHours: number;
}

export interface OpcionOperador {
  id: string;
  code: string;
  fullName: string;
  /** certification summary, to decide before submitting */
  certificaciones: string;
}

const MOTIVO_MINIMO = 15;

export function AsignarForm({
  shiftId,
  plannedHours,
  equipos,
  operadores,
  esSupervisor,
}: {
  shiftId: string;
  plannedHours: number;
  equipos: OpcionEquipo[];
  operadores: OpcionOperador[];
  esSupervisor: boolean;
}) {
  const router = useRouter();
  const [equipmentId, setEquipmentId] = useState('');
  const [operatorId, setOperatorId] = useState('');
  const [horas, setHoras] = useState(plannedHours);
  const [error, setError] = useState<ApiError | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [pidiendoMotivo, setPidiendoMotivo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  // the preview is stored with the pair that produced it, so a stale result hides itself
  const [previa, setPrevia] = useState<{
    clave: string;
    violations: Violation[] | 'error';
  } | null>(null);
  const clave = `${operatorId}|${equipmentId}`;
  const completo = Boolean(operatorId && equipmentId);
  const resuelta = previa?.clave === clave ? previa.violations : null;
  // derived, not stored: a pair with no answer yet is a pair still being checked
  const comprobando = completo && resuelta === null;

  // server-side preview; the delay debounces the selects and `cancelado` drops late answers
  useEffect(() => {
    if (!operatorId || !equipmentId) return;

    let cancelado = false;

    const t = setTimeout(async () => {
      const res = await postJson<{ violations: Violation[] }>('/api/assignments/validate', {
        shiftId,
        operatorId,
        equipmentId,
      });

      if (cancelado) return;

      setPrevia({
        clave: `${operatorId}|${equipmentId}`,
        violations: res.ok ? res.data.violations : 'error',
      });
    }, 300);

    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [shiftId, operatorId, equipmentId]);

  const equipo = equipos.find((e) => e.id === equipmentId);
  const operador = operadores.find((o) => o.id === operatorId);
  const disponibles = equipos.filter((e) => e.disponible);
  const detenidos = equipos.filter((e) => !e.disponible);
  const certificados = operadores.filter((o) => o.certificaciones !== 'sin certificaciones');
  const sinCertificar = operadores.filter((o) => o.certificaciones === 'sin certificaciones');

  async function enviar(override?: string) {
    setEnviando(true);
    setError(null);
    setExito(null);

    const etiqueta = `${operador?.fullName ?? 'el operador'} en ${equipo?.code ?? 'el equipo'}`;

    const res = await postJson('/api/assignments', {
      shiftId,
      equipmentId,
      operatorId,
      plannedHours: horas,
      ...(override ? { override: { reason: override } } : {}),
    });

    setEnviando(false);

    if (res.ok) {
      setExito(
        override
          ? `Asignación creada con excepción firmada: ${etiqueta}, ${formatHoras(horas)} h. Queda EN RIESGO y hay que resolverla antes de cerrar el turno.`
          : `Asignación creada: ${etiqueta}, ${formatHoras(horas)} h. Ya aparece en la tabla de arriba.`,
      );
      setPrevia(null);
      setEquipmentId('');
      setOperatorId('');
      setMotivo('');
      setPidiendoMotivo(false);
      router.refresh();
      return;
    }

    setError(res.error);
    setPidiendoMotivo(false);
  }

  const puedeForzar = esSupervisor && error?.canBeOverridden === true;

  return (
    <div className="px-4 py-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void enviar();
        }}
        className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] sm:items-end"
      >
        <label className="block">
          <span className="rotulo">Operador</span>
          <select
            required
            value={operatorId}
            onChange={(e) => setOperatorId(e.target.value)}
            className={`mt-1.5 ${campo.input}`}
          >
            <option value="">Seleccione un operador…</option>
            <optgroup label="Con certificaciones registradas">
              {certificados.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.fullName} ({o.code}) · {o.certificaciones}
                </option>
              ))}
            </optgroup>
            {sinCertificar.length > 0 && (
              <optgroup label="Sin certificaciones: serán rechazados">
                {sinCertificar.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.fullName} ({o.code})
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>

        <label className="block">
          <span className="rotulo">Equipo</span>
          <select
            required
            value={equipmentId}
            onChange={(e) => setEquipmentId(e.target.value)}
            className={`mt-1.5 ${campo.input}`}
          >
            <option value="">Seleccione un equipo…</option>
            <optgroup label="Disponibles">
              {disponibles.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.code} · {e.typeName} · {formatHoras(e.currentHours)}/
                  {formatHoras(e.nextMaintenanceHours)} h
                </option>
              ))}
            </optgroup>
            {detenidos.length > 0 && (
              <optgroup label="No disponibles: requieren excepción de supervisor">
                {detenidos.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.code} · {e.typeName} · {e.estado}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>

        <label className="block">
          <span className="rotulo">Horas</span>
          <input
            type="number"
            min={0.5}
            // the shift is the ceiling: the server rejects anything past the journey
            max={plannedHours}
            step={0.5}
            value={horas}
            onChange={(e) => setHoras(Number(e.target.value))}
            className={`mt-1.5 w-24 ${campo.numero}`}
          />
        </label>

        <button
          type="submit"
          disabled={enviando || !equipmentId || !operatorId}
          className={boton.primario}
        >
          {enviando ? <Spinner /> : <Icon name="visto" />}
          {enviando ? 'Guardando…' : 'Validar y asignar'}
        </button>
      </form>

      <p className="mt-2 text-xs text-muted">
        Las horas vienen de la duración del turno ({formatHoras(plannedHours)} h) y se pueden
        reducir, nunca superar: un equipo no opera más allá de la jornada a la que se le asignó.
        La validación definitiva corre en el servidor al guardar.
      </p>

      {/* hint only: the server still validates */}
      {equipo && (
        <div className="mt-3 flex flex-wrap items-center gap-3 border border-line bg-canvas px-3 py-2 text-xs">
          <span className="font-mono">{equipo.code}</span>
          <span className="text-muted">{equipo.estado}</span>
          <BarraHorometro
            actual={equipo.currentHours}
            umbral={equipo.nextMaintenanceHours}
          />
          <span className="text-muted">
            {formatHoras(equipo.currentHours)} de {formatHoras(equipo.nextMaintenanceHours)} h
            del umbral · quedan{' '}
            {formatHoras(Math.max(0, equipo.nextMaintenanceHours - equipo.currentHours))} h
          </span>
        </div>
      )}

      {/* its own role="status" announces it; nesting it in the live region below double-reads */}
      {exito && (
        <Aviso tono="ok" className="mt-4">
          {exito}
        </Aviso>
      )}

      {/* the preview appears on its own, so polite; a submit rejection is an alert */}
      <div aria-live="polite">
        {!error && comprobando && (
          <p className="mt-4 border border-line bg-canvas px-3 py-2 text-sm text-muted">
            Comprobando las reglas con esta combinación…
          </p>
        )}

        {!error && resuelta === 'error' && (
          <Aviso tono="neutro" className="mt-4">
            No se pudo hacer la comprobación previa. Puede enviar igual: la validación que
            decide corre en el servidor al guardar.
          </Aviso>
        )}

        {!error && Array.isArray(resuelta) && resuelta.length > 0 && (
          <div className="mt-4">
            <PanelViolaciones
              mensaje={`Validación previa: ${resuelta.length} ${resuelta.length === 1 ? 'regla incumplida' : 'reglas incumplidas'} con esta combinación. Todavía no se ha guardado nada.`}
              violations={resuelta}
            />
          </div>
        )}

        {!error && Array.isArray(resuelta) && resuelta.length === 0 && (
          <Aviso tono="ok" className="mt-4">
            Validación previa: sin problemas. La comprobación definitiva se repite al asignar,
            sobre el equipo bloqueado en la base.
          </Aviso>
        )}
      </div>

      {error && (
        <div role="alert" className="mt-4 space-y-3">
          <PanelViolaciones mensaje={error.message} violations={error.violations} />

          {error.canBeOverridden && !esSupervisor && (
            <Aviso tono="neutro">
              Todas las reglas incumplidas son autorizables, pero firmar una excepción es
              atribución del supervisor. Pídale que la autorice o elija otra combinación.
            </Aviso>
          )}

          {puedeForzar && !pidiendoMotivo && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setPidiendoMotivo(true)}
                className={boton.excepcion}
              >
                <Icon name="bloqueado" />
                Forzar con autorización
              </button>
              <span className="text-xs text-muted">
                Como supervisor puede autorizar estas reglas dejando constancia del motivo.
              </span>
            </div>
          )}

          {puedeForzar && pidiendoMotivo && (
            <div className="border border-accent/50 bg-amber-50 p-4">
              <label className="block">
                <span className="rotulo">Motivo de la excepción</span>
                <textarea
                  rows={3}
                  autoComplete="off"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ej.: Frente 4 sin unidad de reemplazo; se traslada a taller al cierre del turno."
                  className={`mt-1.5 ${campo.input} bg-surface`}
                />
              </label>

              <p className="mt-1 text-xs text-muted">
                Mínimo {MOTIVO_MINIMO} caracteres ({motivo.trim().length}). Queda registrado
                con su nombre en la auditoría y la asignación nace <strong>en riesgo</strong>.
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={motivo.trim().length < MOTIVO_MINIMO || enviando}
                  onClick={() => void enviar(motivo.trim())}
                  className={boton.peligro}
                >
                  {enviando ? <Spinner /> : <Icon name="visto" />}
                  {enviando ? 'Autorizando…' : 'Autorizar y asignar'}
                </button>
                <button
                  type="button"
                  onClick={() => setPidiendoMotivo(false)}
                  className={boton.secundario}
                >
                  <Icon name="cerrar" />
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { postJson, type ApiError } from '@/src/components/api';
import { PanelViolaciones } from '@/src/components/panel-violaciones';
import { formatHoras } from '@/src/components/format';
import type { Violation } from '@/src/domain/rules/violation';

export interface OpcionEquipo {
  id: string;
  code: string;
  typeName: string;
  estado: string;
  currentHours: number;
  nextMaintenanceHours: number;
}

export interface OpcionOperador {
  id: string;
  code: string;
  fullName: string;
  /** Resumen de sus certificaciones, para decidir antes de enviar. */
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
  const [motivo, setMotivo] = useState('');
  const [pidiendoMotivo, setPidiendoMotivo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  // La previa se guarda junto con la combinación que la produjo: así, al cambiar de
  // operador o equipo, el resultado viejo deja de mostrarse solo, sin tener que limpiarlo.
  const [previa, setPrevia] = useState<{ clave: string; violations: Violation[] } | null>(null);
  const clave = `${operatorId}|${equipmentId}`;
  const previaActual = previa?.clave === clave ? previa.violations : null;

  // Validación previa contra el servidor: en cuanto hay operador y equipo se pregunta qué
  // pasaría. El retardo evita una petición por cada cambio del selector, y el `cancelado`
  // descarta respuestas que llegan tarde y pisarían un resultado más nuevo.
  useEffect(() => {
    if (!operatorId || !equipmentId) return;

    let cancelado = false;

    const t = setTimeout(async () => {
      const res = await postJson<{ violations: Violation[] }>('/api/assignments/validate', {
        shiftId,
        operatorId,
        equipmentId,
      });

      if (!cancelado && res.ok) {
        setPrevia({ clave: `${operatorId}|${equipmentId}`, violations: res.data.violations });
      }
    }, 300);

    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [shiftId, operatorId, equipmentId]);

  const equipo = equipos.find((e) => e.id === equipmentId);

  async function enviar(override?: string) {
    setEnviando(true);
    setError(null);

    const res = await postJson('/api/assignments', {
      shiftId,
      equipmentId,
      operatorId,
      plannedHours: horas,
      ...(override ? { override: { reason: override } } : {}),
    });

    setEnviando(false);

    if (res.ok) {
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
        className="flex flex-wrap items-end gap-4"
      >
        <label className="block">
          <span className="rotulo">Operador</span>
          <select
            required
            value={operatorId}
            onChange={(e) => setOperatorId(e.target.value)}
            className="mt-1.5 block w-72 border border-line bg-canvas px-3 py-2 text-sm"
          >
            <option value="">Seleccione…</option>
            {operadores.map((o) => (
              <option key={o.id} value={o.id}>
                {o.fullName} ({o.code}) · {o.certificaciones}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="rotulo">Equipo</span>
          <select
            required
            value={equipmentId}
            onChange={(e) => setEquipmentId(e.target.value)}
            className="mt-1.5 block w-72 border border-line bg-canvas px-3 py-2 text-sm"
          >
            <option value="">Seleccione…</option>
            {equipos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.code} · {e.typeName} · {e.estado}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="rotulo">Horas</span>
          <input
            type="number"
            min={1}
            max={24}
            step={0.5}
            value={horas}
            onChange={(e) => setHoras(Number(e.target.value))}
            className="mt-1.5 block w-24 border border-line bg-canvas px-3 py-2 font-mono text-sm"
          />
        </label>

        <button
          type="submit"
          disabled={enviando || !equipmentId || !operatorId}
          className="bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-accent disabled:opacity-40"
        >
          {enviando ? 'Validando…' : 'Validar y asignar'}
        </button>
      </form>

      {/* El estado del equipo se ve antes de enviar; la validación real igual la hace el
          servidor, esto solo evita chocar de gusto. */}
      {equipo && (
        <p className="mt-3 text-xs text-muted">
          {equipo.code}: {equipo.estado} · {formatHoras(equipo.currentHours)} de{' '}
          {formatHoras(equipo.nextMaintenanceHours)} h del umbral.
        </p>
      )}

      {/* La previa aparece sola al cambiar los selectores: `polite` la lee sin interrumpir
          lo que el usuario esté haciendo. El rechazo del envío sí es `alert`. */}
      <div aria-live="polite">
        {!error && previaActual && previaActual.length > 0 && (
          <div className="mt-4">
            <PanelViolaciones
              mensaje={`Validación previa: ${previaActual.length} ${previaActual.length === 1 ? 'regla incumplida' : 'reglas incumplidas'} con esta combinación.`}
              violations={previaActual}
            />
          </div>
        )}

        {!error && previaActual?.length === 0 && (
          <p className="mt-4 border border-emerald-700/30 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Validación previa: sin problemas. La comprobación definitiva se repite al asignar,
            sobre el equipo bloqueado en la base.
          </p>
        )}
      </div>

      {error && (
        <div role="alert" className="mt-4 space-y-3">
          <PanelViolaciones mensaje={error.message} violations={error.violations} />

          {error.canBeOverridden && !esSupervisor && (
            <p className="text-sm text-muted">
              Todas las reglas incumplidas son autorizables, pero se necesita un supervisor
              para firmar la excepción.
            </p>
          )}

          {puedeForzar && !pidiendoMotivo && (
            <button
              type="button"
              onClick={() => setPidiendoMotivo(true)}
              className="border border-accent px-4 py-2 text-sm font-medium text-accent hover:bg-accent hover:text-white"
            >
              Forzar con autorización
            </button>
          )}

          {puedeForzar && pidiendoMotivo && (
            <div className="border border-accent/50 bg-amber-50 p-4">
              <label className="block">
                <span className="rotulo">Motivo de la excepción</span>
                <textarea
                  rows={3}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ej.: Frente 4 sin unidad de reemplazo; se traslada a taller al cierre del turno."
                  className="mt-1.5 w-full border border-line bg-surface px-3 py-2 text-sm"
                />
              </label>

              <p className="mt-1 text-xs text-muted">
                Mínimo {MOTIVO_MINIMO} caracteres ({motivo.trim().length}). Queda registrado
                con su nombre en la auditoría y la asignación nace <strong>en riesgo</strong>.
              </p>

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={motivo.trim().length < MOTIVO_MINIMO || enviando}
                  onClick={() => void enviar(motivo.trim())}
                  className="bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                >
                  Autorizar y asignar
                </button>
                <button
                  type="button"
                  onClick={() => setPidiendoMotivo(false)}
                  className="px-4 py-2 text-sm text-muted underline"
                >
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

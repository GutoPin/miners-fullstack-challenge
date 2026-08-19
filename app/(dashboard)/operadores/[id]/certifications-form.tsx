'use client';

import { useActionState } from 'react';

import { Icon } from '@/src/components/icons';
import { BotonEnviar } from '@/src/components/submit-button';
import { Aviso, boton, campo } from '@/src/components/ui';
import {
  cambiarSituacion,
  otorgarCertificacion,
  revocarCertificacion,
  type EstadoAccion,
} from '../actions';

export interface TipoDisponible {
  id: string;
  code: string;
  name: string;
}

const HOY = () => new Date().toISOString().slice(0, 10);
const EN_UN_ANIO = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
};

/** Grant or renew: a renewal is just another row, and the latest expiry is the one that rules. */
export function OtorgarCertificacion({
  operatorId,
  tipos,
}: {
  operatorId: string;
  tipos: TipoDisponible[];
}) {
  const [estado, accion] = useActionState<EstadoAccion, FormData>(otorgarCertificacion, {});

  return (
    <form action={accion} className="px-4 py-4">
      <input type="hidden" name="operatorId" value={operatorId} />

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1.4fr)_auto_auto_minmax(0,1fr)_auto] sm:items-end">
        <label className="block">
          <span className="rotulo">Tipo de equipo</span>
          <select name="equipmentTypeId" required className={`mt-1.5 ${campo.input}`}>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.code})
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="rotulo">Emitida</span>
          <input
            type="date"
            name="issuedAt"
            required
            defaultValue={HOY()}
            className={`mt-1.5 ${campo.input} font-mono`}
          />
        </label>

        <label className="block">
          <span className="rotulo">Vence</span>
          <input
            type="date"
            name="expiresAt"
            required
            defaultValue={EN_UN_ANIO()}
            className={`mt-1.5 ${campo.input} font-mono`}
          />
        </label>

        <label className="block">
          <span className="rotulo">N.º de certificado</span>
          <input
            name="documentRef"
            autoComplete="off"
            placeholder="Opcional"
            className={`mt-1.5 ${campo.input}`}
          />
        </label>

        <BotonEnviar pendiente="Guardando…" icono="mas">
          Otorgar
        </BotonEnviar>
      </div>

      <p className="mt-2 text-xs text-muted">
        Para renovar una certificación por vencer, otorgue una nueva del mismo tipo: manda la de
        vencimiento más lejano y la anterior queda en el historial.
      </p>

      <div aria-live="polite">
        {estado.ok && (
          <Aviso tono="ok" className="mt-3">
            {estado.ok}
          </Aviso>
        )}
        {estado.error && (
          <div role="alert" className="mt-3">
            <Aviso tono="bloqueo">{estado.error}</Aviso>
          </div>
        )}
      </div>
    </form>
  );
}

/** Revoking expires the certification instead of deleting it, so the record keeps its history. */
export function RevocarCertificacion({
  operatorId,
  equipmentTypeId,
  tipoNombre,
}: {
  operatorId: string;
  equipmentTypeId: string;
  tipoNombre: string;
}) {
  const [estado, accion] = useActionState<EstadoAccion, FormData>(revocarCertificacion, {});

  return (
    <form action={accion}>
      <input type="hidden" name="operatorId" value={operatorId} />
      <input type="hidden" name="equipmentTypeId" value={equipmentTypeId} />
      <input type="hidden" name="tipoNombre" value={tipoNombre} />

      <button
        type="submit"
        className="inline-flex items-center gap-1.5 border border-line px-3 py-1.5 text-xs whitespace-nowrap hover:border-red-700 hover:text-red-800"
      >
        <Icon name="cerrar" className="size-3.5" />
        Revocar
      </button>

      {estado.error && (
        <p role="alert" className="mt-1 text-xs text-red-800">
          {estado.error}
        </p>
      )}
    </form>
  );
}

/** Deactivating keeps the operator out of new assignments without touching the existing ones. */
export function CambiarSituacion({
  operatorId,
  activo,
}: {
  operatorId: string;
  activo: boolean;
}) {
  const [estado, accion] = useActionState<EstadoAccion, FormData>(cambiarSituacion, {});

  return (
    <form action={accion} className="px-4 py-4">
      <input type="hidden" name="operatorId" value={operatorId} />
      {/* an unchecked checkbox sends nothing, which is exactly "deactivate" */}
      {!activo && <input type="checkbox" name="activo" defaultChecked hidden readOnly />}

      <p className="text-sm">
        {activo
          ? 'Está activo: puede recibir nuevas asignaciones si tiene certificación vigente.'
          : 'Está inactivo: no puede recibir nuevas asignaciones.'}
      </p>

      <button type="submit" className={`${boton.secundario} mt-3`}>
        <Icon name={activo ? 'bloqueado' : 'visto'} />
        {activo ? 'Marcar como inactivo' : 'Reactivar operador'}
      </button>

      <div aria-live="polite">
        {estado.ok && (
          <Aviso tono="ok" className="mt-3">
            {estado.ok}
          </Aviso>
        )}
        {estado.error && (
          <div role="alert" className="mt-3">
            <Aviso tono="bloqueo">{estado.error}</Aviso>
          </div>
        )}
      </div>
    </form>
  );
}

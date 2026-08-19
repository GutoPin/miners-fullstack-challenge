'use server';

import { revalidatePath } from 'next/cache';

import { requireRole } from '@/src/auth';
import { createOperator, type CertificationInput } from '@/src/services/create-operator';
import { ServiceError } from '@/src/services/errors';
import {
  grantCertification,
  revokeCertification,
  setOperatorActive,
} from '@/src/services/operator-certifications';

/** what `useActionState` carries back into the form; `ok` is what the screen announces */
export interface EstadoAccion {
  error?: string;
  ok?: string;
}

/**
 * A Server Action is a public endpoint: the role is checked here, not in the component that
 * decided whether to render the button. Errors are returned instead of thrown so the modal
 * can show them without navigating away and losing what the user typed.
 */
async function ejecutar(accion: () => Promise<string>): Promise<EstadoAccion> {
  try {
    await requireRole('PLANNER', 'SUPERVISOR');
    const ok = await accion();
    revalidatePath('/operadores');
    return { ok };
  } catch (error) {
    if (!(error instanceof ServiceError)) throw error;
    return { error: error.message };
  }
}

/** the form emits one checkbox and two dates per equipment type, keyed by its id */
function certificacionesDe(formData: FormData): CertificationInput[] {
  return formData
    .getAll('tipo')
    .map(String)
    .filter((id) => formData.get(`cert-${id}`) === 'on')
    .map((id) => ({
      equipmentTypeId: id,
      issuedAt: String(formData.get(`emitida-${id}`) ?? ''),
      expiresAt: String(formData.get(`vence-${id}`) ?? ''),
      documentRef: String(formData.get(`documento-${id}`) ?? ''),
    }));
}

export async function crearOperador(
  _previo: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return ejecutar(async () => {
    const operador = await createOperator({
      code: String(formData.get('code') ?? ''),
      fullName: String(formData.get('fullName') ?? ''),
      document: String(formData.get('document') ?? ''),
      certifications: certificacionesDe(formData),
    });

    return `${operador.fullName} (${operador.code}) quedó registrado.`;
  });
}

export async function otorgarCertificacion(
  _previo: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const operatorId = String(formData.get('operatorId') ?? '');

  return ejecutar(async () => {
    await grantCertification(operatorId, {
      equipmentTypeId: String(formData.get('equipmentTypeId') ?? ''),
      issuedAt: String(formData.get('issuedAt') ?? ''),
      expiresAt: String(formData.get('expiresAt') ?? ''),
      documentRef: String(formData.get('documentRef') ?? ''),
    });

    revalidatePath(`/operadores/${operatorId}`);
    return 'Certificación registrada. Ya puede recibir asignaciones de ese tipo de equipo.';
  });
}

export async function revocarCertificacion(
  _previo: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const operatorId = String(formData.get('operatorId') ?? '');
  const nombre = String(formData.get('tipoNombre') ?? 'ese tipo de equipo');

  return ejecutar(async () => {
    await revokeCertification(operatorId, String(formData.get('equipmentTypeId') ?? ''));
    revalidatePath(`/operadores/${operatorId}`);
    return `Certificación de ${nombre} revocada: vence ayer, así que ya no habilita turnos desde hoy. El registro anterior se conserva.`;
  });
}

export async function cambiarSituacion(
  _previo: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const operatorId = String(formData.get('operatorId') ?? '');
  const activo = formData.get('activo') === 'on';

  return ejecutar(async () => {
    await setOperatorActive(operatorId, activo);
    revalidatePath(`/operadores/${operatorId}`);
    return activo
      ? 'El operador vuelve a estar activo y puede recibir asignaciones.'
      : 'El operador queda inactivo. Sus asignaciones ya creadas no cambian.';
  });
}

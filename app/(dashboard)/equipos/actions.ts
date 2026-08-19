'use server';

import { revalidatePath } from 'next/cache';

import { requireRole } from '@/src/auth';
import { createEquipment } from '@/src/services/create-equipment';
import { ServiceError } from '@/src/services/errors';
import type { EstadoAccion } from '../operadores/actions';

/** the role is checked here because a Server Action is reachable without the button */
export async function crearEquipo(
  _previo: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  try {
    const usuario = await requireRole('PLANNER', 'SUPERVISOR');
    const intervalo = String(formData.get('maintenanceIntervalOverride') ?? '').trim();

    const equipo = await createEquipment({
      code: String(formData.get('code') ?? ''),
      typeId: String(formData.get('typeId') ?? ''),
      currentHours: Number(formData.get('currentHours') ?? 0),
      maintenanceIntervalOverride: intervalo ? Number(intervalo) : null,
      createdById: usuario.id,
    });

    revalidatePath('/equipos');
    revalidatePath('/');

    return {
      ok: `${equipo.code} quedó registrado con ${Number(equipo.currentHours)} h y primer umbral en ${Number(equipo.nextMaintenanceHours)} h.`,
    };
  } catch (error) {
    if (!(error instanceof ServiceError)) throw error;
    return { error: error.message };
  }
}

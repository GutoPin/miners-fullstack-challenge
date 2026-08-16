import { z } from 'zod';

import { errorResponse, logJson, parseBody, requireRole, traza } from '@/app/api/http';
import { createAssignment } from '@/src/services/create-assignment';

export const dynamic = 'force-dynamic';

const schema = z.object({
  shiftId: z.string().min(1, 'indique el turno'),
  operatorId: z.string().min(1, 'indique el operador'),
  equipmentId: z.string().min(1, 'indique el equipo'),
  plannedHours: z
    .number('las horas planificadas deben ser un número')
    .positive('las horas planificadas deben ser mayores que cero')
    .max(24, 'un turno no puede planificar más de 24 horas')
    .optional(),
  override: z
    .object({
      reason: z.string().min(15, 'el motivo debe tener al menos 15 caracteres'),
    })
    .optional(),
});

export async function POST(request: Request) {
  const t = traza(request, 'assignment.create');
  let userId: string | undefined;

  try {
    ({ id: userId } = await requireRole('PLANNER', 'SUPERVISOR'));
    const input = parseBody(schema, await request.json());

    const { assignment, warnings, forced } = await createAssignment({ ...input, userId });

    // Una asignación forzada es una excepción autorizada: queda en el log además de en
    // `AssignmentOverride`, porque el log es lo que se revisa cuando algo salió mal.
    logJson({
      ...t,
      userId,
      outcome: forced ? 'forced' : 'created',
      assignmentId: assignment.id,
      shiftId: input.shiftId,
      equipmentId: input.equipmentId,
      operatorId: input.operatorId,
      warnings: warnings.map((w) => w.code),
    });

    return Response.json({ assignment, warnings, forced }, { status: 201 });
  } catch (error) {
    return errorResponse(error, { ...t, userId });
  }
}

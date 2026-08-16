import { z } from 'zod';

import { errorResponse, parseBody, requireRole } from '@/app/api/http';
import { createAssignment } from '@/src/services/create-assignment';

export const dynamic = 'force-dynamic';

const schema = z.object({
  shiftId: z.string().min(1, 'indique el turno'),
  operatorId: z.string().min(1, 'indique el operador'),
  equipmentId: z.string().min(1, 'indique el equipo'),
  plannedHours: z.number().positive().max(24).optional(),
  override: z
    .object({
      reason: z.string().min(15, 'el motivo debe tener al menos 15 caracteres'),
    })
    .optional(),
});

export async function POST(request: Request) {
  try {
    const { id: userId } = await requireRole('PLANNER', 'SUPERVISOR');
    const input = parseBody(schema, await request.json());

    const { assignment, warnings, forced } = await createAssignment({ ...input, userId });

    return Response.json({ assignment, warnings, forced }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

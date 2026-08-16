import { z } from 'zod';

import { errorResponse, logJson, parseBody, requireRole, traza } from '@/app/api/http';
import { closeShift } from '@/src/services/close-shift';

export const dynamic = 'force-dynamic';

const schema = z.object({
  // Claves = id de asignación. Sin dato, se cierran con las horas planificadas.
  actualHours: z
    .record(z.string(), z.number('las horas reales deben ser un número'))
    .optional(),
  notes: z.record(z.string(), z.string('la nota debe ser un texto')).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = traza(request, 'shift.close');
  let userId: string | undefined;

  try {
    ({ id: userId } = await requireRole('PLANNER', 'SUPERVISOR'));
    const { id } = await params;
    const input = parseBody(schema, await request.json().catch(() => ({})));

    const result = await closeShift({ ...input, shiftId: id, userId });

    logJson({
      ...t,
      userId,
      outcome: 'closed',
      shiftId: id,
      assignments: result.closedAssignments,
      blockedEquipment: result.blockedEquipment,
      assignmentsAtRisk: result.assignmentsAtRisk,
    });

    return Response.json(result);
  } catch (error) {
    return errorResponse(error, { ...t, userId });
  }
}

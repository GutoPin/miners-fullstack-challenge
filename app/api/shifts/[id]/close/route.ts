import { z } from 'zod';

import { errorResponse, parseBody, requireRole } from '@/app/api/http';
import { closeShift } from '@/src/services/close-shift';

export const dynamic = 'force-dynamic';

const schema = z.object({
  // Claves = id de asignación. Sin dato, se cierran con las horas planificadas.
  actualHours: z.record(z.string(), z.number()).optional(),
  notes: z.record(z.string(), z.string()).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: userId } = await requireRole('PLANNER', 'SUPERVISOR');
    const { id } = await params;
    const input = parseBody(schema, await request.json().catch(() => ({})));

    const result = await closeShift({ ...input, shiftId: id, userId });

    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

import { z } from 'zod';

import { errorResponse, parseBody, requireRole } from '@/app/api/http';
import { registerMaintenance } from '@/src/services/register-maintenance';

export const dynamic = 'force-dynamic';

const schema = z.object({
  equipmentId: z.string().min(1, 'indique el equipo'),
  hoursAtService: z.number().nonnegative('el horómetro no puede ser negativo'),
  responsible: z.string().min(1, 'indique quién ejecutó el mantenimiento'),
  performedAt: z.coerce.date().optional(),
  notes: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const { id: userId } = await requireRole('PLANNER', 'SUPERVISOR');
    const input = parseBody(schema, await request.json());

    const result = await registerMaintenance({ ...input, userId });

    return Response.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

import { z } from 'zod';

import { errorResponse, logJson, parseBody, requireRole, traza } from '@/app/api/http';
import { cancelAssignment } from '@/src/services/cancel-assignment';

export const dynamic = 'force-dynamic';

const schema = z.object({ reason: z.string().optional() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = traza(request, 'assignment.cancel');
  let userId: string | undefined;

  try {
    ({ id: userId } = await requireRole('PLANNER', 'SUPERVISOR'));
    const { id } = await params;
    const input = parseBody(schema, await request.json().catch(() => ({})));

    const result = await cancelAssignment({ ...input, assignmentId: id });

    logJson({ ...t, userId, outcome: 'cancelled', assignmentId: id });

    return Response.json(result);
  } catch (error) {
    return errorResponse(error, { ...t, userId });
  }
}

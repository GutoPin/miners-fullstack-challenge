import { z } from 'zod';

import { errorResponse, parseBody, requireRole } from '@/app/api/http';
import { cancelAssignment } from '@/src/services/cancel-assignment';

export const dynamic = 'force-dynamic';

const schema = z.object({ reason: z.string().optional() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole('PLANNER', 'SUPERVISOR');
    const { id } = await params;
    const input = parseBody(schema, await request.json().catch(() => ({})));

    return Response.json(await cancelAssignment({ ...input, assignmentId: id }));
  } catch (error) {
    return errorResponse(error);
  }
}

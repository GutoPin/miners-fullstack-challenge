import { z } from 'zod';

import { errorResponse, parseBody, requireSession, traza } from '@/app/api/http';
import { prisma } from '@/src/db/prisma';
import { previewAssignment } from '@/src/services/assignment-context';

export const dynamic = 'force-dynamic';

const schema = z.object({
  shiftId: z.string().min(1, 'indique el turno'),
  operatorId: z.string().min(1, 'indique el operador'),
  equipmentId: z.string().min(1, 'indique el equipo'),
});

/**
 * Preview: says what would happen without writing anything. Runs the same rule engine as
 * creation, so the UI never carries its own copy of the rules. It does not replace the
 * check in `POST /api/assignments`, which runs again over the locked row.
 */
export async function POST(request: Request) {
  // read only: no log line on success, or the log fills with keystrokes
  const t = traza(request, 'assignment.validate');

  try {
    await requireSession();
    const input = parseBody(schema, await request.json());

    return Response.json(await previewAssignment(prisma, input));
  } catch (error) {
    return errorResponse(error, t);
  }
}

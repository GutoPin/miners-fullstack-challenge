import { z } from 'zod';

import { errorResponse, parseBody, requireSession } from '@/app/api/http';
import { prisma } from '@/src/db/prisma';
import { previewAssignment } from '@/src/services/assignment-context';

export const dynamic = 'force-dynamic';

const schema = z.object({
  shiftId: z.string().min(1),
  operatorId: z.string().min(1),
  equipmentId: z.string().min(1),
});

/**
 * Validación previa: dice qué pasaría, sin escribir nada. Corre el **mismo** motor de
 * reglas que la creación, así que la interfaz no tiene su propia versión de las reglas.
 * No sustituye a la validación de `POST /api/assignments`: entre esta consulta y el envío
 * el estado puede cambiar, y la garantía se toma con la fila bloqueada.
 */
export async function POST(request: Request) {
  try {
    await requireSession();
    const input = parseBody(schema, await request.json());

    return Response.json(await previewAssignment(prisma, input));
  } catch (error) {
    return errorResponse(error);
  }
}

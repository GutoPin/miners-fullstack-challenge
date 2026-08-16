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
 * Validación previa: dice qué pasaría, sin escribir nada. Corre el **mismo** motor de
 * reglas que la creación, así que la interfaz no tiene su propia versión de las reglas.
 * No sustituye a la validación de `POST /api/assignments`: entre esta consulta y el envío
 * el estado puede cambiar, y la garantía se toma con la fila bloqueada.
 */
export async function POST(request: Request) {
  // Solo lee: no deja línea de log en el caso feliz, o el log se llenaría de tecleo.
  const t = traza(request, 'assignment.validate');

  try {
    await requireSession();
    const input = parseBody(schema, await request.json());

    return Response.json(await previewAssignment(prisma, input));
  } catch (error) {
    return errorResponse(error, t);
  }
}

import { errorResponse } from '@/app/api/http';
import { getProjection } from '@/src/services/get-projection';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const days = Number(new URL(request.url).searchParams.get('days') ?? 7);
    const ventana = Number.isFinite(days) && days > 0 && days <= 30 ? days : 7;

    return Response.json({ days: ventana, equipment: await getProjection(ventana) });
  } catch (error) {
    return errorResponse(error);
  }
}

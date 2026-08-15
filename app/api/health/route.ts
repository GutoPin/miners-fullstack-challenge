import { prisma } from '@/src/db/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: 'ok', db: 'up', time: new Date().toISOString() });
  } catch {
    return Response.json({ status: 'error', db: 'down' }, { status: 503 });
  }
}

import { prisma } from '@/src/db/prisma';

export const dynamic = 'force-dynamic';

/**
 * Health check: proves the database answers, not just that the process is alive. The
 * keep-alive workflow calls it every 6 h. It reports the deployed commit because Vercel
 * keeps serving the previous deployment when a build fails, so an `ok` without a version
 * cannot tell "online" from "running what I pushed".
 */
export async function GET() {
  const version = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local';

  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: 'ok', db: 'up', version, time: new Date().toISOString() });
  } catch {
    return Response.json({ status: 'error', db: 'down', version }, { status: 503 });
  }
}

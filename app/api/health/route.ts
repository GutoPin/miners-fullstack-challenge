import { prisma } from '@/src/db/prisma';

export const dynamic = 'force-dynamic';

/**
 * Latido del servicio: comprueba que la base responde, no solo que el proceso está vivo.
 * Lo consulta el workflow de keep-alive cada 6 h para que Neon no se enfríe.
 *
 * Devuelve el commit desplegado porque "¿está en línea?" y "¿está en línea la versión que
 * subí?" son preguntas distintas: Vercel sigue sirviendo el despliegue anterior cuando un
 * build falla, así que un `ok` sin versión no distingue una cosa de la otra.
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

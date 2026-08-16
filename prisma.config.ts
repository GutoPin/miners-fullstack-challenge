import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Conexión DIRECTA, sin pooler: las migraciones abren transacciones largas y
    // PgBouncer en modo transacción no las soporta. En local es la misma cadena que
    // DATABASE_URL; en Neon son dos distintas.
    url: env('MIGRATE_DATABASE_URL'),
  },
});
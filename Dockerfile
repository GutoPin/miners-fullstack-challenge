# Imagen de la app. Multi-stage: lo que se construye (código fuente, caché de Next) no
# viaja a la imagen final.
#
# Sirve para levantar el proyecto entero con `docker compose up --build` sin instalar nada
# en la máquina, y como plan B de despliegue: cualquier plataforma que corra contenedores
# puede publicarla cambiando solo variables de entorno (`docs/DEPLOY.md` §6).

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
# `postinstall` corre `prisma generate`; por eso el esquema tiene que estar antes del ci.
# La URL no se usa para generar, pero `prisma.config.ts` la lee: un valor cualquiera basta.
ENV MIGRATE_DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV MIGRATE_DATABASE_URL=postgresql://build:build@localhost:5432/build
# `build:app` es `next build` a secas. El `build` normal aplica migraciones, y durante la
# construcción de la imagen todavía no hay base de datos contra la cual aplicarlas.
RUN npx prisma generate && npm run build:app

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Salida `standalone`: Next deja un servidor con solo las dependencias que rastreó. No hace
# falta copiar `node_modules` ni el código fuente; las migraciones y el seed los ejecuta el
# servicio `migrate` de docker-compose.yml, que usa la etapa `builder`.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]

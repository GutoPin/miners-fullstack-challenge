# Multi-stage production image: source and build cache stay out of the final layer.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
# postinstall runs prisma generate, which reads this url but never connects
ENV MIGRATE_DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV MIGRATE_DATABASE_URL=postgresql://build:build@localhost:5432/build
ENV BUILD_STANDALONE=1
# build:app is next build alone: no database to migrate against at image build time
RUN npx prisma generate && npm run build:app

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# standalone ships its own traced dependencies; migrations and seed run in the migrate service
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]

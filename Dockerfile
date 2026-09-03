FROM node:22-alpine AS base

# Native build toolchain (bcrypt / optional better-sqlite3 for one-shot SQLite→PG migration)
RUN apk add --no-cache python3 make g++

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Self-hosted pdf.js worker (no CDN) for in-site PDF viewing
RUN node scripts/copy-pdf-worker.mjs

# Rebuild better-sqlite3 for alpine (used only by migrate-sqlite-to-pg.mjs)
RUN npm rebuild better-sqlite3 \
 && if [ -d node_modules/@prisma/adapter-better-sqlite3/node_modules/better-sqlite3 ]; then \
      npm rebuild better-sqlite3 --prefix node_modules/@prisma/adapter-better-sqlite3; \
    fi || true

# Dummy URL is enough for `prisma generate` (no live DB at image build time)
ENV DATABASE_URL="postgresql://sochi:sochi@127.0.0.1:5432/sochi_portal?schema=public"
RUN npx prisma generate

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=1536"
# Нет Postgres в builder — не ходим в БД при prerender (см. isNextBuildPhase)
ENV SKIP_DB_AT_BUILD=1
RUN npm run build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/certs ./certs

RUN mkdir -p /app/data /app/.next/cache /app/public/uploads /app/public/uploads/covers /app/certs \
 && chmod +x /app/scripts/docker-entrypoint.sh \
 && chown -R node:node /app/data /app/.next /app/public /app/scripts /app/certs \
 && (rm -f /app/.env || true)

USER node

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
CMD ["node", "server.js"]

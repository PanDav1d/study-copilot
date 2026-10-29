# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

FROM base AS deps
# Toolchain only as a fallback in case no prebuilt better-sqlite3 binary matches.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN DATABASE_URL=file:/tmp/build.db pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN DATABASE_URL=file:/tmp/build.db AUTH_SECRET=build-time-placeholder-secret-0000000000 pnpm build

FROM base AS runner
ENV NODE_ENV=production TZ=Europe/Berlin PORT=3000 \
    DATABASE_URL=file:/data/study.db UPLOAD_DIR=/data/uploads
COPY --from=build /app /app
RUN mkdir -p /data && chown -R node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
# Apply pending migrations, then start the server.
CMD ["sh", "-c", "pnpm prisma migrate deploy && pnpm start"]

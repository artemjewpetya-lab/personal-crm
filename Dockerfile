# syntax=docker/dockerfile:1

# Production image of the app. CI builds it on every push to main
# (.github/workflows/deploy.yml); the server only pulls and runs it.
# The same image applies the migrations: node scripts/migrate.mts

ARG NODE_IMAGE=node:24.22.0-slim

FROM ${NODE_IMAGE} AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1 \
    NEXT_BUILD_STANDALONE=1
RUN corepack enable
WORKDIR /app

# Dependencies first: this layer is reused while the lockfile stays the same.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile

COPY . .
# The database client reads DATABASE_URL when its module loads, and the build
# loads every route. Nothing connects during the build, so a placeholder is enough.
RUN DATABASE_URL=postgresql://build:build@build-placeholder:5432/build pnpm build

# Next.js bundles drizzle-orm into the app, so the standalone output has no copy
# of it, but the migration script imports it. Take the version from the lockfile.
RUN mkdir -p /migrate-deps && cp -rL node_modules/drizzle-orm /migrate-deps/


FROM ${NODE_IMAGE} AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /migrate-deps/drizzle-orm ./node_modules/drizzle-orm
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --from=build --chown=node:node /app/scripts/migrate.mts ./scripts/migrate.mts

USER node
EXPOSE 3000

# Commit SHA of this build, reported by /health. Set last so it does not
# invalidate the cached layers above.
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}

CMD ["node", "server.js"]

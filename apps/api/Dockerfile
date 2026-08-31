FROM node:26.8.1-alpine3.23@sha256:871eb674ad6e692c91330a8959f1ce2f80ba3f445cdc54e306869d2ea265e42d AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts/db-migrate.mjs ./scripts/db-migrate.mjs
COPY db/migrations ./db/migrations

RUN npm ci
RUN npm run build
RUN find apps/api/dist packages/*/dist -type f \
  \( -name "*.test.js" -o -name "*.spec.js" -o -name "*.d.ts" -o -name "*.tsbuildinfo" -o -name "*.js.map" \) \
  -delete

FROM node:26.8.1-alpine3.23@sha256:871eb674ad6e692c91330a8959f1ce2f80ba3f445cdc54e306869d2ea265e42d AS production-deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/application/package.json ./packages/application/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/domain/package.json ./packages/domain/package.json
COPY packages/infra-postgres/package.json ./packages/infra-postgres/package.json
COPY packages/shared/package.json ./packages/shared/package.json

RUN npm ci --omit=dev --workspace @grantledger/api --include-workspace-root=false \
  && rm -f node_modules/.package-lock.json

FROM node:26.8.1-alpine3.23@sha256:871eb674ad6e692c91330a8959f1ce2f80ba3f445cdc54e306869d2ea265e42d AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache --upgrade "libcrypto3>=3.5.7-r0" "libssl3>=3.5.7-r0"

COPY --from=build /app/package.json ./package.json
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/packages/application/package.json ./packages/application/package.json
COPY --from=build /app/packages/application/dist ./packages/application/dist
COPY --from=build /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=build /app/packages/domain/package.json ./packages/domain/package.json
COPY --from=build /app/packages/domain/dist ./packages/domain/dist
COPY --from=build /app/packages/infra-postgres/package.json ./packages/infra-postgres/package.json
COPY --from=build /app/packages/infra-postgres/dist ./packages/infra-postgres/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/scripts/db-migrate.mjs ./scripts/db-migrate.mjs
COPY --from=build /app/db/migrations ./db/migrations

RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-v1.22.22 \
  /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg \
  && node --version \
  && ! command -v npm \
  && ! command -v npx \
  && ! command -v corepack \
  && ! command -v yarn \
  && ! command -v yarnpkg \
  && test ! -d /usr/local/lib/node_modules/npm \
  && test ! -d /usr/local/lib/node_modules/corepack \
  && test ! -d /opt/yarn-v1.22.22 \
  && test ! -e /app/package-lock.json \
  && test ! -e /app/node_modules/.package-lock.json \
  && test -z "$(find /app/apps /app/packages -type f \( -name '*.test.js' -o -name '*.spec.js' -o -name '*.d.ts' -o -name '*.tsbuildinfo' -o -name '*.js.map' \) -print -quit)" \
  && node -e 'for (const name of ["vitest", "eslint", "typescript", "tsx"]) { try { require.resolve(name); throw new Error(name + " must not be resolvable"); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; } } require.resolve("stripe");' \
  && test -f /app/scripts/db-migrate.mjs \
  && test -n "$(find /app/db/migrations -type f -print -quit)" \
  && chown -R node:node /app
USER node

EXPOSE 3000
CMD ["node", "apps/api/dist/server.js"]

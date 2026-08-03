FROM node:26.5.1-alpine3.23@sha256:2a633e101381371ba148c7c212bf447c00cd267d814b708a9fe52c4984204729 AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages

RUN npm ci
RUN npm run build
RUN find apps/worker/dist packages/*/dist -type f \
  \( -name "*.test.js" -o -name "*.spec.js" -o -name "*.d.ts" -o -name "*.tsbuildinfo" -o -name "*.js.map" \) \
  -delete

FROM node:26.5.1-alpine3.23@sha256:2a633e101381371ba148c7c212bf447c00cd267d814b708a9fe52c4984204729 AS production-deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/worker/package.json ./apps/worker/package.json
COPY packages/application/package.json ./packages/application/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/domain/package.json ./packages/domain/package.json
COPY packages/infra-postgres/package.json ./packages/infra-postgres/package.json
COPY packages/shared/package.json ./packages/shared/package.json

RUN npm ci --omit=dev --workspace @grantledger/worker --include-workspace-root=false \
  && rm -f node_modules/.package-lock.json

FROM node:26.5.1-alpine3.23@sha256:2a633e101381371ba148c7c212bf447c00cd267d814b708a9fe52c4984204729 AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache --upgrade "libcrypto3>=3.5.7-r0" "libssl3>=3.5.7-r0"

COPY --from=build /app/package.json ./package.json
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=build /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=build /app/apps/worker/dist ./apps/worker/dist
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
  && node -e 'for (const name of ["vitest", "eslint", "typescript", "tsx", "stripe"]) { try { require.resolve(name); throw new Error(name + " must not be resolvable"); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; } }' \
  && test ! -e /app/node_modules/stripe \
  && test ! -e /app/scripts/db-migrate.mjs \
  && test ! -d /app/db/migrations \
  && chown -R node:node /app
USER node

EXPOSE 9464
CMD ["node", "apps/worker/dist/main.js"]

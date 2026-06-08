FROM node:22.22.3-alpine3.23@sha256:968df39aedcea65eeb078fb336ed7191baf48f972b4479711397108be0966920 AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts/db-migrate.mjs ./scripts/db-migrate.mjs
COPY db/migrations ./db/migrations

RUN npm ci
RUN npm run build
RUN npm prune --omit=dev

FROM node:22.22.3-alpine3.23@sha256:968df39aedcea65eeb078fb336ed7191baf48f972b4479711397108be0966920 AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
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

RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
  && node --version \
  && ! command -v npm \
  && ! command -v npx \
  && test ! -d /usr/local/lib/node_modules/npm \
  && test ! -e /app/package-lock.json \
  && chown -R node:node /app
USER node

EXPOSE 3000
CMD ["node", "apps/api/dist/server.js"]

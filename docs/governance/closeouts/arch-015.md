# ARCH-015 Closeout

## Delivery
- Main PR: #85
- Result: merged (squash) into `main` on 2026-02-26
- Objective delivered: PostgreSQL persistence foundation with tenant isolation hardening

## Governance
- Issue: #72 closed
- Project V2
  - PR #85: Status=Done, Priority=P2, Area=data, Type=architecture, Wave=Wave 5, Risk=medium
  - Issue #72: Status=Done, Priority=P2, Area=data, Type=architecture, Wave=Wave 5, Risk=medium

## Technical Scope Delivered
- Added `@grantledger/infra-postgres` package with adapters:
  - subscription repository
  - invoice repository
  - invoice job store
  - idempotency store
- Added migration baseline and runner:
  - `db/migrations/0001_arch_015_core_tables.sql`
  - `scripts/db-migrate.mjs`
- Added local postgres runtime support:
  - `docker-compose.yml`
  - root scripts: `db:up`, `db:down`, `db:migrate`
- Wired API/worker for optional postgres mode (`PERSISTENCE_DRIVER=postgres`)
- Added tenant isolation integration tests for postgres adapters

## Validation Evidence
- `npm run typecheck`
- `npm run test`
- `npm run quality:gate`
- `npm run db:up` failed in this environment due Docker daemon unavailable; therefore `test:pg` execution is pending runtime environment readiness.

## Residual Risks / Follow-up
- Enable Docker daemon in target environment and run:
  - `DATABASE_URL=postgresql://grantledger:grantledger@localhost:5432/grantledger npm run db:migrate`
  - `DATABASE_URL=postgresql://grantledger:grantledger@localhost:5432/grantledger RUN_PG_TESTS=1 npm run test:pg`
- ARCH-016 will continue worker lease orchestration improvements and production execution model hardening.

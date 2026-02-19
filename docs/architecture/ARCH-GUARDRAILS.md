# ARCH-000 Guardrails

Related tracker: `ARCH-TRACKER.md`

## Why these guardrails exist

The project already claims strong architectural principles. These guardrails ensure implementation stays faithful to that promise.

## Layer Boundaries (non-negotiable)

### Domain (`/packages/domain`)

Allowed:

- Entities, value objects, invariants, state machines, pure domain rules
- Domain errors and domain events
  Not allowed:
- HTTP concerns
- SDK/provider imports
- Repository/DB implementation details
- Transport parsing/validation logic for external inputs

### Application (`/packages/application`)

Allowed:

- Use case orchestration
- Ports (repository/provider interfaces)
- Transaction and idempotency orchestration
- Audit/event flow coordination
  Not allowed:
- Framework-specific transport code
- Provider SDK concrete adapters

### API/Infra (`/apps/api`)

Allowed:

- Request parsing and boundary validation
- Dependency wiring
- Error mapping to HTTP response shape
- Concrete adapters (Stripe, DB, queue, etc.)
  Not allowed:
- Core business invariants and state transitions

## Validation Standard

- Boundary inputs must be validated via schema-first approach (Zod).
- TS types should be inferred from schemas where applicable.
- Avoid scattered manual null-check chains in handlers.

## Date/Time Standard

- Persist in UTC.
- Use centralized temporal utilities (Luxon-based).
- Do not spread raw `Date` calculations across business logic.

## Error Standard

- Use standardized app/domain errors.
- Convert to API responses through one centralized mapper.
- Response shape must be consistent and trace-friendly.

## Idempotency Standard

- Use one generic idempotency executor (no copy/paste orchestration).
- Use deterministic fingerprinting and explicit conflict behavior.
- Reuse across subscriptions, invoices, and webhooks.

## i18n Standard

- Message keys over hardcoded final strings.
- Start with `en_US` map and preserve extension path.

## PR Rules for Architecture Hardening

- One child issue per PR.
- No unrelated feature expansion in architecture PRs.
- Keep PR small enough for high-quality review.
- Required ARCH docs update timing:
  - at issue start (`IN_PROGRESS` + scope/branch)
  - before merge (`DONE` + PR link + merged SHA + residual risks)
- Mandatory gates before merge:
  - `npm run typecheck`
  - `npm run build`
  - `npm run lint`

## Required Files per ARCH Issue

- `ARCH-TRACKER.md`
- `IMPROVEMENT-ROADMAP.md`
- `docs/adr/*` (when architectural decision changed)

When no ADR change is required, the PR must include explicit justification.

## Review Checklist

- Is logic in the correct layer?
- Is validation centralized at boundary?
- Is date/time policy followed?
- Are errors standardized and mapped once?
- Is idempotency reused instead of duplicated?
- Is change documented in ADR/tracker if architectural?

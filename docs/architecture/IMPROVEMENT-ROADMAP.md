# GrantLedger Architecture Improvement Roadmap

## Context

This roadmap tracks architecture hardening as a continuous stream running in parallel with feature delivery.

Canonical references:

- Tracker: `docs/architecture/ARCH-TRACKER.md`
- Guardrails: `docs/architecture/ARCH-GUARDRAILS.md`
- Boundary decision: `docs/adr/ADR-005-domain-vs-application-boundary.md`

## Progress Snapshot

- ARCH-001 completed (`#31`)
- ARCH-002 completed (`#32`)
- ARCH-003 in progress (`#30`, branch `chore/arch-003-schema-first-zod`)

## Target Architecture Principles

- Domain contains pure business invariants and state transitions.
- Application contains use-case orchestration, ports, idempotency flow, and audit coordination.
- API/infra contains request parsing, dependency wiring, transport mapping, and adapters.
- External SDKs remain isolated at infrastructure edges.
- Canonical contracts/events are explicit and versioned.

## Current Prioritized Sequence

1. ARCH-003: Schema-first validation with Zod (in progress)
2. ARCH-004: Time strategy with Luxon + UTC policy
3. ARCH-005: Standardized exception model and API response mapper
4. ARCH-006: Generic idempotency executor
5. ARCH-007: i18n foundation (`en_US`)

## Current Execution Focus (ARCH-003)

- Introduce canonical Zod schemas in `packages/contracts/src/schemas`.
- Infer API payload types using `z.infer`.
- Validate boundary inputs in API handlers and webhook envelope.
- Preserve existing behavior and response compatibility.

## Delivery Strategy

- One architecture issue per PR.
- Keep architecture PRs focused and reviewable.
- No unrelated business scope mixed into ARCH PRs.
- Required gates per PR:
  - `npm run typecheck`
  - `npm run build`
  - `npm run lint`

## Mandatory Governance Workflow (Always)

### Start of issue

- Mark issue as `IN_PROGRESS` in `ARCH-TRACKER.md`.
- Register issue link, branch name, and planned scope.
- Update roadmap focus/dependencies.
- Create ADR draft when new architectural decision is needed.

### End of issue (before merge)

- Mark issue as `DONE` in `ARCH-TRACKER.md`.
- Register PR link and merged SHA.
- Update roadmap next step and residual risks.
- Finalize ADR changes or explicitly register `No ADR change required`.

## Success Criteria for ARCH Stream

- No core business logic concentrated in monolithic modules.
- Layer boundaries are clear and reviewable.
- Validation, time policy, and error mapping are standardized.
- Idempotency orchestration is generic and reusable.
- Governance docs stay synchronized with code and PR lifecycle.

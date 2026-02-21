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
- ARCH-003 completed (`#34`, merge `dc7404d`)
- ARCH-004 completed (`#37`, merge `46e6804`)
- ARCH-005 completed (`#40`, merge `b72ef69`)
- ARCH-006 completed (`#43`, merge `0706202`)

## Target Architecture Principles

- Domain contains pure business invariants and state transitions.
- Application contains use-case orchestration, ports, idempotency flow, and audit coordination.
- API/infra contains request parsing, dependency wiring, transport mapping, and adapters.
- External SDKs remain isolated at infrastructure edges.
- Canonical contracts/events are explicit and versioned.

## Current Prioritized Sequence

1. ARCH-007: i18n foundation (`en_US`)

## Next execution focus: ARCH-007

- Build i18n baseline structure and message catalog strategy.
- Keep runtime compatibility while introducing translation layer boundaries.
- Reuse standardized error contract for localized message mapping in future steps.

## Delivery Strategy

- One architecture issue per PR.
- Keep architecture PRs focused and reviewable.
- No unrelated business scope mixed into ARCH PRs.
- Required gates per PR:
  - `npm run typecheck`
  - `npm run build`
  - `npm run lint`
  - `npm run test`

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

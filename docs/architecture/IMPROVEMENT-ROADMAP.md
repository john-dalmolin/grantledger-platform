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
- ARCH-007 completed (`#46`, merge `64e2d3d`)
- ARCH-008 completed (`#49`, merge `bef4fbc`)
- ARCH-009 in progress (`#52`, branch `chore/arch-009-invoice-idempotent-rollout`)

## Target Architecture Principles

- Domain contains pure business invariants and state transitions.
- Application contains use-case orchestration, ports, idempotency flow, and audit coordination.
- API/infra contains request parsing, dependency wiring, transport mapping, and adapters.
- External SDKs remain isolated at infrastructure edges.
- Canonical contracts/events are explicit and versioned.

## Current Prioritized Sequence

1. ARCH-009: invoice idempotent use-case rollout (application + API + worker) (in progress)
2. ARCH-010: billing orchestration hardening follow-up (placeholder)

## Next execution focus: ARCH-009

- Reuse the stateful idempotency model (`processing/completed/failed`) in invoice async orchestration.
- Introduce async invoice enqueue boundary with `Idempotency-Key` and `202 Accepted + jobId`.
- Add worker-driven job lifecycle (`queued` -> `processing` -> `completed`/`failed`) and status endpoint.
- Apply cycle-key + input-hash fingerprinting for invoice enqueue idempotency and deterministic replay.
- Register ARCH-010 as the next placeholder stream after ARCH-009 closeout.

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

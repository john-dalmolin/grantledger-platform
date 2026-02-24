# ADR-015: Invoice Async Operational Readiness (Observability + Replay Controls)

- Status: Proposed
- Date: 2026-02-23
- Deciders: Platform Team

## Context

ARCH-009 and ARCH-010 delivered async invoice orchestration, retry semantics, and dead-letter behavior.
To run this safely in production-like operations, we still need stronger operational visibility and controlled replay procedures.

## Decision

We will harden operations for async invoice flow with:

- structured operational signals (queue depth, processing latency, retry count, terminal-failure rate),
- safe replay/reprocess controls with deterministic guardrails,
- explicit operator runbook guidance for failure handling and diagnostics.

Public API/application contracts introduced in ARCH-009/010 must remain backward-compatible.

## Consequences

### Positive

- Better incident detection and diagnosis.
- Safer manual/controlled recovery paths.
- Lower operational uncertainty in async invoice lifecycle.

### Trade-offs

- Additional instrumentation complexity.
- More explicit operational policy to maintain.

## Guardrails

- No breaking change to enqueue/status API contracts.
- Replay operations must preserve idempotency safety.
- Metrics/logs must be actionable for on-call and postmortem analysis.

## Follow-up

- Mark this ADR as `Accepted` when ARCH-011 is merged.

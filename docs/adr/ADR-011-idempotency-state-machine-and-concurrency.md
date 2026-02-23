# ADR-011: Idempotency State Machine and Concurrency Strategy

- Status: Proposed
- Date: 2026-02-21
- Deciders: Platform Team

## Context

Current idempotency behavior supports replay and conflict detection, but does not model execution lifecycle states.
Without explicit state transitions, concurrent requests can race and produce ambiguous outcomes.

## Decision

Adopt a stateful idempotency model for application orchestration:

- `processing`: request reserved and currently executing.
- `completed`: request successfully executed and response stored for replay.
- `failed`: execution failed; same payload can retry safely.

Additional decisions:

- Keep `processWithIdempotency(...)` as compatibility wrapper.
- Introduce canonical async executor with pluggable fingerprint strategy.
- Keep webhook flow key-based in this stage (no payload fingerprint conflict for webhook dedup).

## Consequences

### Positive

- Deterministic behavior for concurrent requests.
- Explicit retry semantics after failures.
- Reusable idempotency foundation across use-cases.

### Trade-offs

- Slightly more complex store contract and state transitions.
- Existing in-memory adapters need migration to lifecycle-aware records.

## Guardrails

- Same key + different fingerprint must return conflict.
- Same key in `processing` must return `IDEMPOTENCY_IN_PROGRESS`.
- Same key in `failed` with same fingerprint may retry.

## Follow-up

- Mark this ADR as `Accepted` when ARCH-008 is merged.
- Implement full invoice idempotent orchestration in ARCH-009 using this model.

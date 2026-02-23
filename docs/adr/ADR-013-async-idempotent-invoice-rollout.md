# ADR-013: Async Idempotent Invoice Rollout

- Status: Proposed
- Date: 2026-02-23
- Deciders: Platform Team

## Context

ARCH-008 finalized the reusable idempotency foundation and shared helpers, but invoice generation is still missing a production-like asynchronous orchestration path.
The platform needs a consistent invoice flow across application, API, and worker boundaries with deterministic behavior under retries and concurrency.

## Decision

Adopt an async invoice generation model with explicit job lifecycle and API idempotency boundary:

- API enqueue endpoint requires `Idempotency-Key` and returns `202 Accepted` with `jobId`.
- Worker claims and processes queued jobs using application use-cases.
- Job lifecycle states are: `queued`, `processing`, `completed`, `failed`.
- Enqueue idempotency fingerprint uses invoice cycle key plus input hash.
- Processing idempotency is isolated per job (`scope: invoice.process`) to avoid duplicate side effects.

## Consequences

### Positive

- Deterministic replay for API clients without duplicate invoice generation.
- Clear separation of concerns between transport enqueue, application orchestration, and worker execution.
- Testable asynchronous pipeline without requiring external queue infrastructure in this phase.

### Trade-offs

- In-memory job store is not durable across process restarts.
- Operational concerns like distributed workers, queue visibility timeout, and dead-letter strategy remain follow-up work.

## Guardrails

- Same idempotency key with a different fingerprint must return `409`.
- Same idempotency key while processing must return `409`.
- Replay for same key and fingerprint must return the original `jobId` with `202`.
- Status endpoint must reflect lifecycle transitions from `queued` to terminal states.

## Follow-up

- ARCH-010 should harden infrastructure concerns (durable queue/store, retries/backoff, and operational observability).
- Mark this ADR as `Accepted` when ARCH-009 is merged.

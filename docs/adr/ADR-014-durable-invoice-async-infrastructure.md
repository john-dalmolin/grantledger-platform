# ADR-014: Durable Invoice Async Infrastructure (Queue, Retry, Observability)

- Status: Proposed
- Date: 2026-02-23
- Deciders: Platform Team

## Context

ARCH-009 introduced async invoice orchestration with in-memory stores to validate architecture and behavior.
For production-grade reliability, we need durable job storage, retry strategy, and operational visibility while preserving public contracts.

## Decision

Adopt durable async infrastructure for invoice generation:

- Persist invoice jobs and idempotency records in durable storage.
- Implement retry with bounded backoff for transient failures.
- Introduce dead-letter handling for terminal failures.
- Keep API contract stable (`202 + jobId`, status endpoint) and keep application-level orchestration semantics from ARCH-009.

## Consequences

### Positive

- Recovery after process restarts without losing job state.
- Controlled retries reduce manual intervention for transient failures.
- Better observability for latency/failure patterns.

### Trade-offs

- Increased infrastructure and operational complexity.
- Need migration strategy from in-memory assumptions to persistent adapters.

## Guardrails

- Do not break ARCH-009 API and contract semantics.
- Retry policy must be deterministic and bounded.
- Dead-letter paths must preserve diagnostic context.
- Observability must include queue depth, processing latency, retry count, and terminal-failure rate.

## Follow-up

- Mark this ADR as `Accepted` when ARCH-010 is merged.

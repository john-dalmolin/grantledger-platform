# ADR-009: Generic Async Idempotency Executor

- Status: Accepted
- Date: 2026-02-21
- Deciders: Platform Team

## Context

Idempotency handling was split across flows:
- Generic helper for some API paths.
- Custom local orchestration in subscription use cases.
- Separate dedup logic in payment-webhook flow.

This fragmentation increased maintenance cost and semantic drift risk.

## Decision

Adopt a generic async idempotency executor in `@grantledger/application` as the canonical foundation.

- Introduce `executeIdempotent(...)` with:
  - logical `scope`
  - required idempotency `key`
  - async `store` abstraction (`get/set`)
  - async `execute`
  - deterministic payload hash by default
- Keep `processWithIdempotency(...)` for compatibility as a wrapper path.
- Migrate subscription flow to the shared executor.
- Adopt key-based dedup mode for webhook flow in this stage (no payload conflict hash for webhook yet).

## Consequences

### Positive

- Unified semantics for replay/conflict across application flows.
- Lower duplication and easier evolution.
- Cleaner boundary for storage adapters (in-memory/db/redis).

### Trade-offs

- Migration effort in existing flows.
- Transitional period where compatibility wrapper still coexists.
- Webhook path now favors deterministic key-based dedup over payload-hash conflict checks.

## Guardrails

- No business rule change; only orchestration refactor.
- Missing key remains client error.
- Key reuse with different payload remains conflict in hash-enforced mode.
- Webhook in this phase uses key-based dedup only.

## Alternatives Considered

- Keep separate implementations per flow: faster now, higher long-term drift.
- Full strict payload-hash enforcement for webhook now: stronger guarantees but higher rollout complexity.

# ADR-006: Schema-First Boundary Validation with Zod

- Status: Proposed
- Date: 2026-02-19
- Deciders: Platform Team

## Context

Boundary validation across API handlers and webhook ingestion is currently split between manual null checks and ad-hoc guards.

This creates:

- duplicated validation branches
- weak runtime guarantees for external inputs
- drift risk between runtime validation and TypeScript types

## Decision

Adopt **Zod** as runtime source of truth for boundary contracts and infer TypeScript types from schemas (`z.infer`) where applicable.

Implementation defaults:

- Canonical schemas live in `packages/contracts/src/schemas`.
- API boundary handlers validate `payload`/`envelope` using shared schemas.
- Validation failures map to `BadRequestError` (`HTTP 400`) at transport boundary.
- Existing contracts remain backward-compatible during migration.

## Consequences

### Positive

- Runtime validation and compile-time types stay aligned.
- Less manual branching for required fields.
- Better reuse of input contracts across adapters and handlers.

### Trade-offs

- New dependency (`zod`) in contracts package.
- Initial migration effort to replace existing manual checks.
- Need discipline for schema evolution/versioning.

## Guardrails

- Boundary schemas must be exported from contracts.
- Handlers should avoid re-implementing field-required checks already covered by schemas.
- Breaking schema changes require explicit compatibility note in PR.

## Alternatives Considered

- Keep manual guards + interfaces only: lower initial effort, higher long-term drift and inconsistency.
- Validate only in API layer local schemas: faster start, but weak shared contract consistency.

## Follow-up

- Finalize status to `Accepted` once ARCH-003 is merged.
- Reuse the same pattern in ARCH-004/005 as part of broader boundary standardization.

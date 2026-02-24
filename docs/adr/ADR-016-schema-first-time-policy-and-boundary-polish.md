# ADR-016: Schema-First Contracts, Unified Time Policy, and Boundary Dedup Polish

- Status: Proposed
- Date: 2026-02-24

## Context

Recent architecture streams improved invoice reliability, idempotency, replay controls, and observability.
However, some implementation details still create maintenance risk:

- contract drift risk when schemas and TypeScript types are authored separately;
- inconsistent datetime handling in orchestration paths;
- duplicated logic around invoice job lifecycle and boundary mapping.

These points reduce long-term coherence against our architecture principles (domain/application boundaries, predictable contracts, and operational safety).

## Decision

1. Contracts are schema-first:
- Zod schemas are the runtime and design source of truth at boundaries.
- TypeScript types for boundary payloads/responses are inferred from Zod (`z.infer`).

2. Datetime policy is unified:
- Shared Luxon-based utilities are used for parse/format/arithmetic in orchestration-critical flows.
- Free `Date.parse/new Date` business-path conversions are avoided where policy helpers exist.

3. Boundary deduplication and clarity:
- Repeated orchestration logic is extracted into explicit, reusable application helpers.
- Domain remains focused on deterministic business rules.
- Application remains focused on orchestration, ports, and operational workflows.

## Consequences

Positive:
- lower contract drift probability;
- clearer boundary ownership between domain and application;
- better reliability and testability in time-sensitive paths;
- less duplicated logic and easier maintenance.

Trade-offs:
- short-term refactor cost;
- additional migration effort for legacy contract/type declarations;
- tighter review discipline required to preserve schema-first and time-policy standards.

## Guardrails

- Do not break public API semantics delivered in ARCH-009/010/011.
- Preserve standardized API error envelope behavior.
- Keep idempotency/replay semantics stable unless explicitly versioned.

## Follow-up

- Mark this ADR as `Accepted` when ARCH-012 is merged.

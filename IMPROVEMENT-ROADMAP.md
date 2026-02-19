# GrantLedger

## Key Findings

- Architectural intent is strong, but implementation boundaries are not consistently enforced.
- Business logic is still concentrated in large files, reducing maintainability.
- Runtime validation is mostly manual, with repeated null checks.
- Date/time handling lacks explicit timezone strategy.
- Error-to-API response mapping is not fully standardized.
- Idempotency pattern is partially duplicated instead of generic.
- Domain vs Application responsibilities need clearer and documented separation.
- Multi-language support should start early to avoid expensive retrofits.

## Target Architecture Principles

- Domain contains only pure business rules, invariants, and state transitions.
- Application contains orchestration, use cases, idempotency, ports, and audit flow.
- API layer contains validation, transport mapping, dependency wiring, and response mapping.
- External providers remain at infrastructure edge only.
- Canonical events and contracts are versioned.

## Action Plan

1. Modularization and boundary enforcement

- Split large `index.ts` files into focused modules by context.
- Keep `index.ts` as export barrels only.
- Publish ADR defining Domain vs Application responsibilities.

2. Schema-first contracts (Zod)

- Define Zod schemas at boundaries.
- Infer TypeScript types from schemas.
- Remove scattered manual validation.

3. Time strategy (Luxon + UTC policy)

- Introduce centralized time utilities.
- Enforce UTC persistence and explicit timezone conversions.
- Remove direct business usage of `Date` native operations.

4. Standardized exceptions and API responses

- Introduce base `AppError` model.
- Centralize mapping from errors to HTTP responses.
- Enforce a single response envelope with `code`, `message`, `traceId`, and `details`.

5. Generic idempotency engine

- Create reusable generic idempotency executor.
- Reuse across subscriptions, invoices, and webhook processing.
- Prevent duplicated logic and improve consistency.

6. i18n foundation

- Introduce `TranslationService` with `en_US` map initially.
- Use message keys in domain/application errors.
- Keep localization strategy extensible from day one.

## Delivery Strategy

- Execute as incremental PRs to reduce risk.
- Each PR must include clear scope, trade-offs, and acceptance criteria.
- Mandatory gates: `typecheck`, `build`, `lint`, and relevant integration tests.

## Success Criteria

- No business-critical logic concentrated in monolithic files.
- Domain/Application separation documented and respected.
- Validation done at boundaries with schema-first approach.
- Deterministic and auditable time and financial behavior.
- Standardized error handling and API contracts.
- Reusable idempotency adopted across key flows.

## Current Status

- Roadmap approved for execution in parallel with feature delivery.
- First focus: boundary cleanup + schema-first + standardized error mapping.

# ADR-005: Domain vs Application Boundary

## Context

As the codebase evolved, parts of business logic, orchestration, and transport concerns became mixed across modules. This creates ambiguity, weakens maintainability, and conflicts with the project's clean architecture goals.

> need a strict and explicit boundary between `domain`, `application`, `api/infra`.

## Related Governance Documents

- Tracker: `../architecture/ARCH-TRACKER.md`
- Guardrails: `../architecture/ARCH-GUARDRAILS.md`
- Improvement roadmap: `../architecture/IMPROVEMENT-ROADMAP.md`

## Decision

### 1. Domain Layer (`packages/domain`)

Domain is responsible for:

- entities and value objects
- business invariants and rules
- state machines and transitions
- domain errors and domain events

Domain must remain pure and deterministic:

- no HTTP concerns
- no provider SDK imports
- no repository/DB implementation details
- no external input parsing logic

### 2. Application Layer (`packages/application`)

Application is responsible for:

- use case orchestration
- port definitions (repository/provider interfaces)
- idempotency orchestration
- transaction/audit/event coordination
- application-level error semantics

Application can depend on:

- `domain`
- `contracts`
- `shared`

Application must not contain:

- transport/framework code
- concrete provider SDK adapters

### 3. API/Infrastructure Layer (`apps/api`)

API/infra is responsible for:

- request parsing and boundary validation
- dependency wiring
- transport-level response mapping
- concrete adapters (Stripe, DB, queues, etc.)

API layer must not implement domain invariants or core state transitions.

## Rationale

This separation:

- improves long-term maintainability and testability
- reduces coupling to transport/providers
- enables deterministic business logic
- makes architectural intent verifiable in code reviews

## Consequences

### Positive

- clearer ownership of responsibilities
- safer refactoring and easier onboarding
- reduced accidental coupling
- better consistency with ADR-driven architecture claims

### Trade-offs

- initial refactor effort to move misplaced logic
- short-term increase in files/modules
- stricter review discipline required

## Implementation Rules

- Repositories/interfaces used by use cases live in `application` as ports.
- Domain never imports from `apps/*` or concrete infra adapters.
- API handlers map exceptions using a centralized mapper.
- Any new business rule must be introduced in `domain` first.

## Compliance Checklist (for PR review)

- [X] Is the rule/invariant in `domain`?
- [X] Is orchestration in `application`?
- [X] Is transport/parsing in `api`?
- [X] Are concrete SDK/infra dependencies isolated at edge?
- [X] Are quality gates green (`typecheck`, `build`, `lint`)?

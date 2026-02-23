# ADR-012: Classes vs Functions Guideline

- Status: Proposed
- Date: 2026-02-21
- Deciders: Platform Team

## Context

The codebase mixes classes and functions across modules without a formal guideline.
This creates review ambiguity and style drift over time.

## Decision

Adopt a pragmatic policy:

- Use **classes** for use-cases/services/entities that carry lifecycle, orchestration, or mutable collaboration boundaries.
- Use **pure functions** for deterministic calculations, mappers, validators, and stateless helpers.
- Prioritize readability, testability, and boundary clarity over dogmatic style.

This guideline must be documented in `CONTRIBUTING.md` and referenced in architecture review checklists.

## Consequences

### Positive

- More consistent design decisions during implementation and review.
- Clearer separation between orchestration objects and deterministic logic.
- Better onboarding for contributors.

### Trade-offs

- Requires discipline in PR review to enforce consistently.
- Some existing modules may need incremental refactor to align over time.

## Guardrails

- Do not introduce classes for trivial single-purpose transforms.
- Do not keep orchestration-heavy behavior in large free functions when class abstraction improves cohesion.
- Architecture PRs must state why class or function style was chosen for new modules.

## Follow-up

- Mark this ADR as `Accepted` when ARCH-008 is merged.
- Keep guideline synchronized with `CONTRIBUTING.md` and PR template.

# ADR-007: Timezone-safe Datetime Policy with Luxon

## Context

Current datetime handling is inconsistent across domain/application/api layers, with native `Date` parsing and timestamp generation mixed with permissive boundary validation.

This creates:

- ambiguous parsing for inputs without explicit timezone
- risk of timezone drift across environments
- weak guarantees for contract-level datetime consistency

## Decision

Adopt Luxon-based datetime utilities as the canonical implementation for time parsing and generation, with strict boundary validation:

- Input datetimes must be ISO-8601 with explicit timezone offset (`Z` or `±HH:MM`).
- Shared time utilities will live in `@grantledger/shared`.
- Critical Date-native parsing/generation points will migrate to shared utilities.
- Strict rollout is immediate in ARCH-004 (no legacy compatibility mode).

## Consequences

### Positive

- Deterministic datetime behavior across environments.
- Clear, enforceable boundary contracts for datetime inputs.
- Reduced ambiguity in domain/application temporal calculations.
- Consistent UTC timestamp generation for system events.

### Trade-offs

- Existing clients sending datetime without offset will receive `400`.
- Small migration effort to replace native `Date` usage in critical paths.
- Additional dependency (`luxon` + type declarations).

## Guardrails

- New boundary datetime schemas must enforce explicit offset.
- Shared utilities are the default path for parse/generation of datetimes.
- Any exception to strict offset policy requires explicit ADR/PR justification.

## Alternatives Considered

- Keep native `Date` + permissive parsing: lower immediate effort, high long-term ambiguity.
- Accept legacy timestamps temporarily: easier rollout, but prolongs inconsistency and drift risk.
- Restrict to `Z` only: simpler policy, but less flexible for external integrations.

## Follow-up

- Reuse this policy in ARCH-005 for standardized error-to-response mapping.

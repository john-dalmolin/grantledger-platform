# ADR-008: Standard Error Model and Centralized API Mapping

## Context

Current API handlers map errors independently with duplicated `instanceof` chains.
This causes drift in HTTP semantics and inconsistent payload shape.

## Decision

Adopt an application-level `AppError` base class and centralize transport mapping in API layer.

- `AppError` carries: `code`, `httpStatus`, `details?`, `cause?`.
- Application/domain throw typed errors; API maps via a single mapper.
- API error response remains backward-compatible with `message` and evolves with:
  - `code`
  - `details`
  - `traceId`

## Consequences

### Positive

- Consistent HTTP status and payload semantics.
- Less duplicated handler logic.
- Clear boundary ownership: application defines semantics, API defines transport mapping.

### Trade-offs

- Migration effort to refactor existing error classes.
- Temporary mixed model during transition if rollout is incremental.

## Guardrails

- Do not move HTTP concerns into application layer.
- Unknown errors must map to `500` with stable fallback code.
- `message` must remain present for backward compatibility.

## Alternatives Considered

- Keep per-handler mapping: simpler short-term, high long-term drift.
- Result/Either everywhere: stronger explicitness, high migration cost now.

## Follow-up

- Mark as `Accepted` after ARCH-005 merge.
- Reuse the same error contract in ARCH-006 and ARCH-007 integration points.

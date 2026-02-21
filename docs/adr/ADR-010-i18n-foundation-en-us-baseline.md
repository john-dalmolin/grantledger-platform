# ADR-010: i18n Foundation with en_US Baseline

## Context

Current responses and error messages are hardcoded in English strings across handlers and use-cases.
This makes localization expensive and increases risk of inconsistent wording and contracts across boundaries.

## Decision

Introduce an i18n foundation with `en_US` baseline and stable message keys.

- Create canonical message catalog under architecture-approved location.
- Define stable keys for API-facing messages/errors.
- Introduce translation boundary in API/application integration points.
- Keep default locale as `en_US` in this stage.
- Preserve existing response compatibility while enabling future locale expansion.

## Consequences

### Positive

- Standardized message ownership and wording.
- Lower migration cost for additional locales later.
- Clear boundary between business semantics and presentation strings.

### Trade-offs

- Initial refactor effort to replace hardcoded strings with keys/lookups.
- Transitional period where some non-critical paths may still use legacy strings.

## Guardrails

- No business-rule change in ARCH-007.
- No implicit locale negotiation behavior beyond agreed defaults.
- Keep backward compatibility for required response fields.

## Alternatives Considered

- Keep hardcoded strings: lower short-term effort, high long-term inconsistency.
- Full multi-locale rollout now: higher completeness, higher delivery risk for this stage.

## Follow-up

- Mark this ADR as `Accepted` when ARCH-007 is merged.

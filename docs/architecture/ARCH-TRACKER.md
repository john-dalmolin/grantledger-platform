# ARCH-000 Tracker - Architecture Hardening

## Objective

Deliver structural improvements without blocking feature delivery.

## Canonical References

- Guardrails: `docs/architecture/ARCH-GUARDRAILS.md`
- Roadmap: `docs/architecture/IMPROVEMENT-ROADMAP.md`
- Boundary ADR: `docs/adr/ADR-005-domain-vs-application-boundary.md`

## Scope

- Define and enforce Domain vs Application boundaries
- Modularize monolithic `index.ts` files
- Adopt schema-first validation with Zod
- Standardize date/time strategy with timezone support
- Standardize exception-to-API response mapping
- Introduce generic idempotency executor
- Introduce i18n foundation (`en_US` baseline)

## Out of Scope

- Business feature expansion unrelated to architecture hardening

## Execution Strategy

- Keep architecture changes incremental and reviewable.
- Run in parallel with feature delivery using controlled WIP.
- Limit active architecture work to one child issue at a time.

## Required Update Timing (Always)

### Start of ARCH issue (branch/issue opened)

- Update this tracker with `IN_PROGRESS`, issue link, and branch name.
- Update `IMPROVEMENT-ROADMAP.md` with focus and dependencies.
- If a new architectural decision is needed, create/update ADR draft.
- If no ADR change is needed, register: `No ADR change required`.

### End of ARCH issue (before merge)

- Update this tracker with `DONE`, PR link, and merged SHA.
- Update `IMPROVEMENT-ROADMAP.md` with next step and residual risks.
- Finalize ADR changes (when applicable).
- Confirm PR checklist includes all ARCH governance items.

## Child Issues

- [x] ARCH-001 - Domain vs Application boundaries
  - Status: DONE
  - PR: `#31`
  - Merge SHA: `88787d7`
  - Notes: Added ADR-005 and baseline architecture guardrails/tracker.

- [x] ARCH-002 - Modularize monolithic `index.ts`
  - Status: DONE
  - PR: `#32`
  - Merge SHA: `4cad15d`
  - Notes: Split monolithic indexes into context modules across domain/application/api.

- [x] ARCH-003 - Schema-first validation with Zod
  - Status: DONE
  - Issue: `#30`
  - Branch: `chore/arch-003-schema-first-zod`
  - PR: `#34`
  - Merge SHA: `dc7404d`
  - Notes: Implemented schema-first boundary validation for subscription commands, checkout, and Stripe webhook parsing with canonical schemas in contracts.

- [x] ARCH-004 - Timezone-safe date/time strategy (Luxon)
  - Status: DONE
  - Issue: `#36`
  - Branch: `chore/arch-004-timezone-luxon-policy`
  - PR: `#37`
  - Merge SHA: `46e6804`
  - Notes: Strict ISO-8601 datetime with explicit timezone offset, Luxon shared utilities, and critical Date migration.

- [x] ARCH-005 - Standard error model + centralized API mapping
  - Status: DONE
  - Issue: `#39`
  - Branch: `chore/arch-005-error-model-api-mapper`
  - PR: `#40`
  - Merge SHA: `b72ef69484dc898cc90d3feef4411b9e8e1914d6`
  - Notes: AppError base + centralized mapper + auth/checkout/subscription adoption + Vitest coverage delivered.
  - Residual risks: Remaining modules outside safe slice still use legacy/local mapping and should migrate in ARCH-006.

- [x] ARCH-006 - Generic idempotency executor
  - Status: DONE
  - Issue: `#42`
  - Branch: `chore/arch-006-generic-idempotency-executor`
  - PR: `#43`
  - Merge SHA: `0706202f196d3c7969d39bc79e80a6e7d3cfe4aa`
  - Notes: Implemented generic async idempotency executor, migrated subscription and auth flows, and adopted key-based webhook dedup through shared foundation.
  - Residual risks: Payload-hash conflict detection for webhook flows remains intentionally out of scope in this stage.

- [ ] ARCH-007 - i18n foundation (`en_US`)
  - Status: TODO
  - PR: _to be added_
  - Notes: _to be added_

## ADR References

- [x] ADR-005 - Domain vs Application boundary
- [x] ADR-006 - Validation strategy (schema-first, accepted)
- [x] ADR-007 - Date/time and timezone policy (accepted)
- [x] ADR-008 - Error and response standardization (accepted)
- [x] ADR-009 - Generic idempotency strategy (accepted)
- [ ] ADR - i18n baseline approach

## Quality Gates (mandatory per PR)

- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] `npm run lint`
- [ ] `Architectural scope respected (no mixed feature work)`

## Done Criteria for ARCH-000

- [ ] All child issues completed and merged
- [ ] ADRs updated with final architectural decisions
- [ ] Quality gates passed for every child PR
- [ ] Tracker fully updated with issue/PR links

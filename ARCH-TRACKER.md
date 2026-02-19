# ARCH-000 Tracker - Architecture Hardening

## Objective

Deliver structural improvements without blocking feature delivery.

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

## Child Issues

- [ ] ARCH-001 - Domain vs Application boundaries
  - Status: TODO
  - PR: _to be added_
  - Notes: _to be added_
- [ ] ARCH-002 - Modularize monolithic `index.ts`
  - Status: TODO
  - PR: _to be added_
  - Notes: _to be added_
- [ ] ARCH-003 - Schema-first validation with Zod
  - Status: TODO
  - PR: _to be added_
  - Notes: _to be added_
- [ ] ARCH-004 - Timezone-safe date/time strategy (Luxon)
  - Status: TODO
  - PR: _to be added_
  - Notes: _to be added_
- [ ] ARCH-005 - Standard error model + API response mapping
  - Status: TODO
  - PR: _to be added_
  - Notes: _to be added_
- [ ] ARCH-006 - Generic idempotency executor
  - Status: TODO
  - PR: _to be added_
  - Notes: _to be added_
- [ ] ARCH-007 - i18n foundation (`en_US`)
  - Status: TODO
  - PR: _to be added_
  - Notes: _to be added_

## ADR References

- [ ] ADR - Domain vs Application boundary
- [ ] ADR - Validation strategy (schema-first)
- [ ] ADR - Date/time and timezone policy
- [ ] ADR - Error and response standardization
- [ ] ADR - Idempotency strategy
- [ ] ADR - i18n baseline approach

## Quality Gates (mandatory per PR)

- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] `npm run lint`
- [ ] Architectural scope respected (no mixed feature work)

## Done Criteria for ARCH-000

- [ ] All child issues completed and merged
- [ ] ADRs updated with final architectural decisions
- [ ] Quality gates passed for every child PR
- [ ] Tracker fully updated with issue/PR links

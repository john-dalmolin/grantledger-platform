# Delivery Standard

## Branching
- `feat/<issue>-<slug>`
- `fix/<issue>-<slug>`
- `chore/<issue>-<slug>`

## Rules
- 1 issue = 1 branch = 1 PR
- No direct commits to `main`
- Keep PR scope small and aligned with one issue
- Use Squash and Merge

## Required Gates (local and CI)
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run test`

## PR Quality
- Include Summary, Why, Scope, Validation, Risks
- Document trade-offs explicitly
- Update ADR when a decision has long-term architectural impact

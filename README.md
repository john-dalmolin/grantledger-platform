# GrantLedger Platform

API-first, multi-tenant SaaS billing and entitlements platform built as a production-oriented TypeScript monorepo.

> Status: Active development (foundation completed, billing core in progress)

## Purpose

GrantLedger was created to solve a practical backend problem: evolving billing and access-control workflows without creating long-term architectural debt.

The project emphasizes:

- explicit domain boundaries
- predictable issue-driven delivery
- strict typing and shared contracts
- low coupling to external providers
- auditable technical decisions

## Current Scope (Feb 2026)

Delivered milestones:

- GL-001: monorepo bootstrap and engineering baseline
- GL-002: authentication, memberships, and tenant request context
- GL-003: idempotency baseline for write operations
- GL-004: payment provider abstraction baseline
- GL-005: versioned plan catalog with immutable published versions
- GL-006: subscription state machine with idempotent commands

## Implemented Behavior Baselines

### Auth and tenant context

- missing authenticated user -> `401`
- missing tenant header/context -> `400`
- no active membership for tenant -> `403`
- valid tenant membership -> `200`

### Idempotent writes

- missing idempotency key -> `400`
- first write with new key -> `201`
- same key + same payload -> `200` (replay)
- same key + different payload -> `409`

### Subscription lifecycle

- explicit create/upgrade/downgrade/cancel commands
- invalid transitions fail with domain conflict
- command-level idempotency for mutation safety
- structured audit/domain events for critical transitions

## Architecture

Core principles:

- Domain-first: business rules remain framework-agnostic
- Ports/adapters: integrations are injected behind interfaces
- Explicit contracts: shared types are centralized in `packages/contracts`
- Incremental evolution: each issue adds one coherent capability

Dependency direction:

- `packages/domain` -> no framework dependency
- `packages/application` -> depends on `packages/domain` and `packages/contracts`
- `apps/*` -> consumes application use cases and contracts

Repository layout:

```txt
apps/
  api/
  worker/
  admin/

packages/
  contracts/
  domain/
  application/
  shared/

docs/
  architecture/
  adr/
```

## Engineering Maturity

Current baseline:

- TypeScript strict mode with project references
- ESLint configured for workspace-level quality
- ADR-driven architecture decisions
- issue-to-branch-to-PR workflow discipline

Planned next maturity step:

- GL-012: formal quality gates with unit/integration/contract/E2E tests and CI/CD enforcement

## Tech Stack

- Node.js 22.x
- TypeScript (strict mode + exact optional property types)
- npm workspaces
- ESLint
- project references (`tsc -b`)

## Getting Started

Prerequisites:

- Node.js `>=22 <23`
- npm `>=10 <11`

Install dependencies:

```bash
npm ci
```

Run quality gates:

```bash
npm run typecheck
npm run build
npm run lint
```

## Development Workflow

Branch naming:

- `feat/<issue>-<slug>`
- `fix/<issue>-<slug>`
- `chore/<issue>-<slug>`

Delivery rules:

- 1 issue = 1 branch = 1 PR
- no direct commits to `main`
- keep PR scope aligned with one issue
- use Squash and Merge
- document risks and trade-offs in PR body

## ADRs (Architecture Decision Records)

Location: `docs/adr`

- `ADR-001-tenancy-model.md`
- `ADR-002-entitlements-model.md`
- `ADR-003-idempotency.md`
- `ADR-004-payment-provider-abstraction.md`
- `ADR-005-domain-vs-application-boundary.md`

## Architecture Governance

Canonical governance docs:

- Tracker: `docs/architecture/ARCH-TRACKER.md`
- Guardrails: `docs/architecture/ARCH-GUARDRAILS.md`
- Improvement roadmap: `docs/architecture/IMPROVEMENT-ROADMAP.md`

Governance update rule for every ARCH issue:

- update docs at issue start (`IN_PROGRESS`)
- update docs again before merge (`DONE`)

## Roadmap

- GL-007: deterministic invoice engine
- GL-008: Stripe adapter and payment processing flow
- GL-009: entitlements engine (capabilities + limits)
- GL-010: transactional outbox + retries + DLQ
- GL-011: operational observability (logs, metrics, tracing, SLOs)
- GL-012: quality and CI/CD gates (unit, integration, contract, E2E)

## Project Links

- Repository: [github.com/john-dalmolin/grantledger-platform](https://github.com/john-dalmolin/grantledger-platform)
- Board: [github.com/users/john-dalmolin/projects/6](https://github.com/users/john-dalmolin/projects/6)

## Portfolio Highlights

This repository demonstrates practical senior backend concerns:

- multi-tenant architecture with explicit boundaries
- idempotency modeled as a first-class concern
- auditable subscription workflows
- provider-agnostic payment design
- disciplined issue-to-PR delivery

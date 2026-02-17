# grantledger-platform

API-first multi-tenant SaaS billing and entitlements platform built with Node.js + TypeScript in a monorepo architecture.

## 1) Project Overview

`grantledger-platform` is a backend-focused platform designed to support SaaS products that need:

- tenant-aware access control
- subscription and billing lifecycle management
- entitlement-based feature access
- idempotent financial operations
- maintainable architecture for long-term scale

This repository is intentionally built with production-grade engineering practices, prioritizing correctness, traceability, and architectural clarity.

## 2) Problem Statement

Most SaaS backends fail over time due to:

- business rules spread across transport/infrastructure layers
- weak tenant isolation and access context
- no clear boundaries between billing, entitlements, and identity
- missing safeguards for retries and duplicate operations (idempotency)
- poor delivery discipline (inconsistent branching, low-quality gates)

This project addresses those risks from the foundation.

## 3) Core Principles

- **API-first**: contracts and behavior are designed before adapters.
- **Tenant-first security**: every protected flow is tenant-context aware.
- **Domain-driven boundaries**: business rules are isolated from delivery mechanisms.
- **Reliability by design**: idempotency and payment abstraction are first-class concerns.
- **Engineering discipline**: strict typing, quality gates, ADR-driven decisions.

## 4) Architecture

The codebase is structured as a TypeScript monorepo with clear package boundaries:

```text
grantledger-platform
├── apps
│   ├── api        # HTTP/API adapter
│   ├── worker     # async/background processing
│   └── admin      # admin-facing app shell
├── packages
│   ├── domain      # core business entities, invariants, rules
│   ├── application # use cases and orchestration
│   ├── contracts   # shared interfaces and cross-layer contracts
│   └── shared      # shared utilities and primitives
├── docs
│   └── adr         # architecture decision records
├── package.json
├── tsconfig.base.json
└── tsconfig.json
```

### 4.1 Layer Responsibilities

- `domain`: pure business logic, no transport/framework coupling
- `application`: executes use cases using domain + contracts
- `contracts`: stable language between modules and adapters
- `apps/api`: maps HTTP concerns to application use cases

## 5) Current Milestones

- **GL-001** - Bootstrap monorepo and engineering baseline (done)
- **GL-002** - Auth, memberships, and tenant context (in progress/review)
- Next:
  - GL-003 idempotency key flow
  - GL-004 payment provider abstraction
  - GL-005 subscription lifecycle orchestration

## 6) Key Technical Decisions (ADRs)

Architectural decisions are documented in:

- `docs/adr/ADR-001-tenancy-model.md`
- `docs/adr/ADR-002-entitlements-model.md`
- `docs/adr/ADR-003-idempotency.md`
- `docs/adr/ADR-004-payment-provider-abstraction.md`

These ADRs define trade-offs and rationale for core platform decisions.

## 7) Engineering Standards

- TypeScript `strict` mode
- Project references in monorepo
- ESLint quality gate
- Build/typecheck as merge requirements
- Feature branches + squash merge
- Issue-first planning and project tracking

## 8) Local Setup

### 8.1 Requirements

- Node.js `>=22 <23`
- npm `>=10 <11`

### 8.2 Install

```bash
npm install
```

### 8.3 Quality Gates

```bash
npm run typecheck
npm run build
npm run lint
npm run test
```

## 9) Git Workflow

### 9.1 Branching

- one issue = one branch = one PR
- start from updated `main`
- no direct commits to `main`

Branch naming examples:

- `feat/gl-002-auth-tenant-context`
- `fix/<issue>-<slug>`
- `chore/<issue>-<slug>`

### 9.2 Merge Policy

- squash merge for clean history and issue-level traceability

## 10) Reliability & Security Notes

- tenant context resolution is mandatory for protected operations
- membership validation drives authorization decisions
- write operations with financial impact will use idempotency keys
- provider integrations are isolated behind abstraction boundaries

## 11) Interview-Ready Talking Points

This project demonstrates ability to:

- design backend architecture from product constraints
- enforce modular boundaries in a monorepo
- turn business requirements into technical contracts
- document architectural decisions with ADRs
- evolve incrementally with production-minded discipline

## 12) Roadmap

- [x] GL-003: idempotency key baseline in write endpoints
- [ ] GL-004: payment provider abstraction (anti-corruption layer)
- [ ] GL-005: subscription state transitions and lifecycle rules
- [ ] GL-006: entitlement evaluation middleware
- [ ] GL-007: observability, audit, and failure tracing

## 13) Repository Metadata (Recommended)

- **Description**: API-first multi-tenant SaaS billing and entitlements platform built with Node.js + TypeScript monorepo architecture.
- **Topics**: `saas`, `billing`, `entitlements`, `multi-tenant`, `typescript`, `nodejs`, `monorepo`, `api-first`, `ddd`, `clean-architecture`, `idempotency`, `payments`

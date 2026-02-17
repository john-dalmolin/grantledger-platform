# GrantLedger Platform

A production-oriented TypeScript monorepo for a multi-tenant grants, billing, and entitlements platform.

## Why this project exists

GrantLedger is built to solve a common real-world problem: evolving critical billing and access-control flows without creating long-term architectural debt.

The repository prioritizes:

- clean boundaries between domain logic and infrastructure
- predictable delivery through issue-driven increments
- strict typing and quality gates for safer refactoring
- low coupling to external providers

## Current scope

Delivered milestones:

- GL-001: Monorepo bootstrap and engineering baseline
- GL-002: Authentication, memberships, and tenant request context
- GL-003: Idempotency-key baseline for write operations
- GL-004: Payment provider abstraction baseline

## Architecture principles

- Domain-first: core business rules stay framework-agnostic
- Ports/adapters: external integrations are injected behind interfaces
- Explicit contracts: shared types are centralized and versioned in the monorepo
- Incremental evolution: each issue adds capability without breaking previous boundaries

Dependency direction:

- packages/domain -> no framework dependency
- packages/application -> depends on packages/domain and packages/contracts
- apps/* -> depend on packages/application and packages/contracts

## Repository layout

Project root:

- /Users/johndalmolin/Downloads/projetos/backend/nodejs/grantledger-platform

Main folders:

- /Users/johndalmolin/Downloads/projetos/backend/nodejs/grantledger-platform/apps/api
- /Users/johndalmolin/Downloads/projetos/backend/nodejs/grantledger-platform/apps/worker
- /Users/johndalmolin/Downloads/projetos/backend/nodejs/grantledger-platform/apps/admin
- /Users/johndalmolin/Downloads/projetos/backend/nodejs/grantledger-platform/packages/contracts
- /Users/johndalmolin/Downloads/projetos/backend/nodejs/grantledger-platform/packages/domain
- /Users/johndalmolin/Downloads/projetos/backend/nodejs/grantledger-platform/packages/application
- /Users/johndalmolin/Downloads/projetos/backend/nodejs/grantledger-platform/packages/shared
- /Users/johndalmolin/Downloads/projetos/backend/nodejs/grantledger-platform/docs/adr

## Implemented behavior baselines

Auth + tenant context (GL-002):

- missing authenticated user -> 401
- missing tenant context/header -> 400
- no active membership for tenant -> 403
- valid context -> 200

Idempotent writes (GL-003):

- missing idempotency key -> 400
- first successful write -> 201
- replay with same key and same payload -> 200
- same key with different payload -> 409

Payment abstraction (GL-004):

- application layer depends on provider interface, not vendor SDK
- fake provider validates flow and contract behavior
- path prepared for real provider integration with minimal core impact

## Tech stack

- Node.js 22.x
- TypeScript with strict mode
- exactOptionalPropertyTypes enabled
- npm workspaces
- ESLint
- project references (tsc -b)

## Getting started

Prerequisites:

- Node.js >= 22
- npm >= 10

Install dependencies:

- npm ci

Run quality gates:

- npm run typecheck
- npm run build
- npm run lint

## Development workflow

Branching standard:

- feat/`<issue>`-`<slug>`
- fix/`<issue>`-`<slug>`
- chore/`<issue>`-`<slug>`

Merge strategy:

- Squash and Merge

Operational rules:

- 1 issue = 1 branch = 1 PR
- no direct commits to main
- keep PR scope aligned to one issue
- keep diffs focused and reviewable

## Quality and review checklist

Before opening or merging a PR:

- typecheck passes
- build passes
- lint passes
- architecture boundaries remain respected
- risks and trade-offs are documented in PR description

## ADRs (Architecture Decision Records)

Location:

- /Users/johndalmolin/Downloads/projetos/backend/nodejs/grantledger-platform/docs/adr

ADRs are required when a decision has long-term architectural impact.

## Project links

- Repository: https://github.com/john-dalmolin/grantledger-platform
- Board: https://github.com/users/john-dalmolin/projects/6

## Important talking points

This project demonstrates practical senior-level concerns:

- clean architecture in a real monorepo
- business-critical idempotency modeling
- multi-tenant authorization context enforcement
- integration-ready payment abstraction
- disciplined issue-to-PR delivery process

## Roadmap

- Integrate real payment provider adapter
- Add webhook handling and reconciliation flows
- Expand test coverage by layer (domain/application/adapters)
- Strengthen observability and security controls
- Document operational runbooks for incidents

## Contributing

Contributions should follow the issue-driven workflow and pass all quality gates before review.

## README structure references

This README structure follows guidance from:

- https://docs.github.com/en/enterprise-cloud@latest/repositories/creating-and-managing-repositories/best-practices-for-repositories
- https://google.github.io/styleguide/docguide/READMEs.html
- https://google.github.io/styleguide/docguide/style.html
- https://www.makeareadme.com/

# Security Operations

GrantLedger treats security checks as part of the delivery path, not as a separate afterthought.

## What is enforced in CI

- `Dependency Audit`
  - blocks the workflow on production dependency vulnerabilities at `high` severity or above
- `CodeQL`
  - scans the TypeScript codebase for code-level security issues
- `Container Scan`
  - runs separate API and worker image scans with Trivy `v0.71.0`
  - blocks on fixable `high` and `critical` OS or library vulnerabilities
  - ignores vulnerabilities without an available fix
  - always uploads SARIF before enforcing the blocking vulnerability gate
- `SBOM`
  - generates SPDX JSON artefacts for the API and worker images
  - does not block on vulnerability findings, while generation or upload failures remain blocking

## Triage expectations

- `critical`
  - treat as blocking by default
  - fix before merge unless a documented and time-bound exception is approved
- `high`
  - treat as blocking for internet-facing runtime paths and application code paths
  - for container image findings, triage explicitly and prefer dated follow-up issues when the risk comes from upstream base layers
- `medium` and below
  - review in context and track intentionally

## Dependency update policy

- Dependabot version updates are configured for:
  - npm dependencies
  - GitHub Actions workflows
  - API and worker Docker base images
- Keep update PRs small and grouped by ecosystem
- Review changelogs and release notes before merge when updates affect:
  - runtime frameworks
  - observability
  - Docker base images
  - security tooling

## Secret handling rules

- Never commit real secret values
- Use `.env.example` and deployment examples for placeholders only
- Runtime configuration errors must not echo secret values or connection strings
- Structured logs must redact sensitive payload keys by default
- Demo and smoke scripts must avoid printing credentials

## CI blocking policy

- blocking:
  - quality gate
  - Postgres integration
  - dependency audit
  - CodeQL
  - API container image scan
  - worker container image scan
- non-blocking for vulnerability findings but required as artefacts:
  - SBOM generation

## Security artefacts

- SBOM artefacts are generated in CI for:
  - API image
  - worker image
- Keep generated artefacts attached to workflow runs rather than committed to the repository

## Post-merge repository settings checklist

- Enable Dependabot vulnerability alerts
- Enable Dependabot automated security fixes
- Require these checks before merging to `main`:
  - `Dependency Audit`
  - `Container Scan (api)`
  - `Container Scan (worker)`
  - `CodeQL (javascript-typescript)`
- Configure code scanning protection to block merges on:
  - CodeQL `high` and `critical` alerts
  - Trivy `high` and `critical` alerts

## Operational follow-up

When a security finding is accepted temporarily:

1. document the reason
2. capture scope and mitigation
3. create a dated follow-up issue
4. avoid leaving silent, indefinite exceptions

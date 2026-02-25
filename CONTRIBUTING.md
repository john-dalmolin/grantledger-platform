# Contributing

## Architecture Style Guideline: Classes vs Functions

### Use classes when

- The module encapsulates orchestration flow (use cases/services).
- The component has lifecicle/stateful collaboration boundaries.
- Dependency composition benefits from object cohesion.

### Use pure functions when

- Logic is deterministic and stateless (calculations, mappers, validators).
- Behavior is easier to test as input/output without object lifecycle.
- The abstraction would otherwise become ceremony without clarity gain.

## Decision rule 

Prefer the smallest abstraction that keeps code readable, testable, and aligned with layer boundaries.

## Pull request expectations

For architecture-impacting changes, explain briefly why class-based or function-based style was chosen.

## PR Metadata Standardization

Use `scripts/pr-metadata-sync.sh` after creating a PR to keep milestone, assignee, label, issue closure and project fields consistent.

Example:

```bash
./scripts/pr-metadata-sync.sh --pr 66 --issue 61
```

Optional overrides (all have defaults):

```bash
./scripts/pr-metadata-sync.sh \
  --pr 66 \
  --issue 61 \
  --status Review \
  --priority P1 \
  --area platform \
  --type architecture \
  --wave Update \
  --risk low
```

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

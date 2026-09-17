# Documentation

Living documents describe the current system:

1. [Architecture](architecture.md) — boundaries and runtime flow.
2. [Layer responsibilities](layer-responsibilities.md) — where new code belongs.
3. [Testing conventions](testing-conventions.md) — suite selection and commands.
4. [Coding preferences](coding-preferences.md) — repository-specific rules.
5. [Operations](operations.md) — local containers, health, CI, and releases.
6. [Production readiness](production-readiness.md) — resolved and remaining MVP risks.
7. [ADR-001: MongoDB](decisions/001-mongodb.md) — persistence decision and consequences.
8. [Google authentication](authentication.md) — current sign-in contract and security boundaries.

Historical specifications live in `changes/` and should not be rewritten when implementation later evolves. `CHANGELOG.md` is the only durable product changelog; GitHub release text should be copied or generated from its matching version section.

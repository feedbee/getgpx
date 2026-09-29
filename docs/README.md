# Documentation

Living documents describe the current system:

1. [Architecture](architecture.md) — boundaries and runtime flow.
2. [Layer responsibilities](layer-responsibilities.md) — where new code belongs.
3. [Testing conventions](testing-conventions.md) — suite selection and commands.
4. [Coding preferences](coding-preferences.md) — repository-specific rules.
5. [Operations](operations.md) — local containers, health, CI, and releases.
6. [Environment variables](environment-variables.md) — complete runtime configuration, defaults, and required settings.
7. [Production readiness](production-readiness.md) — resolved and remaining MVP risks.
8. [ADR-001: MongoDB](decisions/001-mongodb.md) — persistence decision and consequences.
9. [ADR-002: S3 track objects](decisions/002-track-objects-in-s3.md) — immutable track source/analysis storage.
10. [Google authentication](authentication.md) — current sign-in contract and security boundaries.
11. [Saved tracks](tracks.md) — current UX, persistence, and API.

Implementation specification:

- [Track storage and delivery through S3](specs/track-s3-storage.md) — contracts, failure handling, and acceptance criteria.

Current client localization:

- [Localization guide](localization.md) — required workflow for agents adding user-facing features, translation catalogs, browser preferences, and unit formatting.
- [Localization and measurement systems](localization-spec.md) — phase 1 browser preferences and five catalogs are implemented; account settings are future work.
- Catalogs live in `src/client/locales/`. English is the source. Add each new key to every catalog and run `npm run locales:check` to validate key sets, ICU syntax, parameters and plural categories. `npm run check` includes this validation. Review AI-assisted translations with a human before merging; retain terminology and placeholders.
- Language and measurement choices are stored independently in versioned browser storage. A successful change reloads the current URL. Upload processing and unsaved edits block the selector. Storage-denied changes stay on the current page with an explanation.

Historical specifications live in `changes/` and should not be rewritten when implementation later evolves. `CHANGELOG.md` is the only durable product changelog; GitHub release text should be copied or generated from its matching version section.

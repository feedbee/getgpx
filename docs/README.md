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
9. [Saved tracks](tracks.md) — target UX, persistence, API outline, and staged delivery plan.

Current client localization:

- [Localization guide](localization.md) — required workflow for agents adding user-facing features, translation catalogs, browser preferences, and unit formatting.
- [Localization and measurement systems](localization-spec.md) — phase 1 browser preferences and five catalogs are implemented; account settings are future work.
- Catalogs live in `src/client/locales/`. English is the source. Add each new key to every catalog and run `npm run locales:check` to validate key sets, ICU syntax, parameters and plural categories. `npm run check` includes this validation. Review AI-assisted translations with a human before merging; retain terminology and placeholders.
- Language and measurement choices are stored independently in versioned browser storage. A successful change reloads the current URL. Upload processing and unsaved edits block the selector. Storage-denied changes stay on the current page with an explanation.

Historical specifications live in `changes/` and should not be rewritten when implementation later evolves. `CHANGELOG.md` is the only durable product changelog; GitHub release text should be copied or generated from its matching version section.

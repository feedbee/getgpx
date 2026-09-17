# MVP foundation adoption

## Objective

Move the existing GPX analysis PoC to an operable MVP baseline without implementing accounts or saved-track behavior prematurely.

## Scope

- Real Node.js production runtime and health semantics.
- MongoDB connection foundation and contract testing.
- Canonical checks, Docker/devcontainer, GitHub Actions quality/release workflows.
- Living documentation, changelog policy, and a production-readiness audit.

## Deliberate boundaries

- No authentication endpoints or user PII storage.
- No track persistence schema or APIs.
- No external publication, secret creation, tag, or release.
- Docker publication is amd64-only until arm64 is verified.

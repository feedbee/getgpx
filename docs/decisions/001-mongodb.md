# ADR-001: Use MongoDB for application persistence

## Status

Accepted

## Date

2026-09-17

## Context

The MVP needs persistence infrastructure before implementing registration/login and saved tracks. Track payloads are naturally document-shaped and may evolve as analysis fields are added. Authentication and track storage are explicitly separate future changes, so locking an application schema now would create false certainty.

## Decision

Use the official MongoDB Node.js driver and MongoDB 7. Establish one process-level client, fail startup when it cannot connect, expose dependency readiness, and test against a real MongoDB service in CI. Local and CI containers pin a tested patch release; MongoDB 8 is deliberately deferred because its allocator is incompatible with Linux kernels 6.19 through 7.0.13. Add collections, validators, indexes, and schema-version fields together with each feature that owns them.

## Alternatives considered

- Mongoose: useful schema ergonomics, but premature models would couple the current infrastructure step to undecided user/track shapes.
- PostgreSQL: strong relational and transactional model, but MongoDB is the product choice and route documents fit its model.
- In-memory/local storage: adequate for a demo, but not multi-user, durable, observable, or production-operable.

## Consequences

- Production deployment requires a secured MongoDB URI and backup/restore policy.
- Relationships such as track ownership must be enforced explicitly and indexed.
- Schema evolution needs document versioning or migrations once persisted models exist.
- Multi-document transactions should be avoided unless a concrete invariant requires them.

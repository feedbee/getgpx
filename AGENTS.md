# Agent guide

- Use Node.js 22+ and `npm ci`; preserve `package-lock.json`.
- Run `npm run check` for every change. Run `npm run test:integration` when database wiring changes.
- Keep browser/domain code in `src/client`; keep external services and persistence behind `src/backend` adapters.
- Keep all tests under `tests/`, mirroring the source boundary; do not colocate tests with production files.
- Do not commit `.env`, credentials, GPX user data, or generated `dist/` output.
- Treat `docs/` living documents as current truth; treat `docs/changes/` files as immutable historical context.
- Read [docs/README.md](docs/README.md), especially architecture and testing conventions, before changing boundaries.
- For every new or changed user-facing string, follow [docs/localization.md](docs/localization.md): update all registered language catalogs in the same change, localize formatting and units, and run the catalog check included in `npm run check`.

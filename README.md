# Track Hub

Track Hub analyses GPX routes in the browser: distance and elevation, climbs and descents, road types, surface quality, and a synchronized map/profile view. The MVP runtime serves the Vite client through a Node.js API and uses MongoDB as the persistence foundation for upcoming accounts and saved tracks.

## Quick start

Requirements: Node.js 22+, npm, and MongoDB 7 (or Docker).

```bash
npm ci
cp .env.example .env
docker compose up mongodb -d
npm run dev
```

Vite development runs at `http://localhost:5173`. For the production-shaped path, run `npm run build && npm start` and open `http://localhost:3000`.

## Canonical commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Client development server with the API middleware |
| `npm run check` | Lint, fast tests, and production client build |
| `npm run test:fast` | Unit/component tests; no infrastructure |
| `npm run test:integration` | MongoDB contract test; requires `MONGODB_URI` |
| `npm run build` | Build the client into `dist/` |
| `npm start` | Start the production Node.js server; requires MongoDB |
| `docker compose up --build` | Run the production image with local MongoDB |

## Configuration

Copy `.env.example` locally; never commit `.env`. The Node process reads environment variables from its environment (it does not load `.env` itself).

| Variable | Required | Default / role |
| --- | --- | --- |
| `MONGODB_URI` | Production: yes | MongoDB connection string |
| `MONGODB_DATABASE` | No | `track_hub` |
| `PORT` / `HOST` | No | `3000` / `0.0.0.0` |
| `VALHALLA_URL` | No | Public Valhalla endpoint |
| `OVERPASS_URL` | No | Public Overpass endpoints |

Health endpoints are `/health/live` (process) and `/health/ready` (MongoDB dependency).

## Project structure

```text
src/
  client/            browser entrypoint, styles, and route-analysis domain code
    domain/          GPX parsing and pure route calculations
  backend/           Node.js HTTP runtime, MongoDB, and external-service adapters
tests/
  unit/              fast client and backend tests
  integration/       tests requiring real infrastructure such as MongoDB
```

Both runtime halves belong under `src/`: `client` executes in the browser, while `backend` executes in Node.js and keeps database credentials and third-party calls outside the browser. Tests mirror those boundaries in a separate top-level tree.

## Documentation

Start at [docs/README.md](docs/README.md). It links architecture, coding, testing, operations, and the MongoDB decision record.

## Delivery

Pull requests and pushes to `main` run quality and MongoDB integration gates. Tags shaped as `vMAJOR.MINOR.PATCH` publish an `linux/amd64` Docker image after repository operators configure `DOCKERHUB_IMAGE`, `DOCKERHUB_USERNAME`, and `DOCKERHUB_TOKEN`. See [docs/operations.md](docs/operations.md).

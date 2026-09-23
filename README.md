# GetGPX

GetGPX analyses GPX routes in the browser: distance and elevation, climbs and descents, road types, surface quality, and a synchronized map/profile view. The MVP runtime serves the Vite client through a Node.js API and uses MongoDB as the persistence foundation for upcoming accounts and saved tracks.

## Quick start

Requirements: Node.js 22.13+, npm, and MongoDB 7 (or Docker).

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
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth 2.0 web client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret; keep only in the secret store / local `.env` |
| `GOOGLE_REDIRECT_URI` | Yes | Exact callback registered at Google; use port `5173` for Vite development and `3000` for the production-shaped local server |
| `SESSION_SECRET` | Yes | At least 32 random characters used to sign short-lived OAuth state |
| `MONGODB_URI` | Production: yes | MongoDB connection string |
| `MONGODB_DATABASE` | No | `getgpx` |
| `PORT` / `HOST` | No | `3000` / `0.0.0.0` |
| `VALHALLA_URL` | No | Public Valhalla endpoint |
| `OVERPASS_URL` | No | Public Overpass endpoints |

Health endpoints are `/health/live` (process) and `/health/ready` (MongoDB dependency).

### Google OAuth setup

1. In [Google Auth Platform](https://console.cloud.google.com/auth/overview), configure Branding and Audience. While the app is in testing, add the Google accounts that may sign in as test users.
2. Under Clients, create or open an OAuth client of type **Web application**. Copy its client ID and client secret into the local/deployment secret store as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
3. Add the exact `GOOGLE_REDIRECT_URI` value to **Authorized redirect URIs**. Scheme, host, port, path, case, and trailing slash must match. Local Vite development uses `http://localhost:5173/api/auth/google/callback`; the production-shaped local server uses `http://localhost:3000/api/auth/google/callback`.
4. Generate `SESSION_SECRET` independently (for example, `openssl rand -base64 48`). Do not reuse the Google client secret.

Google only displays newly created client secrets once, so store the value immediately in a protected secret manager. The app requests only `openid email profile`; it does not store Google access or refresh tokens. See Google's [web-server OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server) and [OAuth client management guide](https://support.google.com/cloud/answer/15549257).

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

Pull requests and pushes to `main` run quality and MongoDB integration gates. Tags shaped as `vMAJOR.MINOR.PATCH` publish a `linux/amd64` and `linux/arm64` Docker image after repository operators configure `DOCKERHUB_IMAGE`, `DOCKERHUB_USERNAME`, and `DOCKERHUB_TOKEN`. See [docs/operations.md](docs/operations.md).

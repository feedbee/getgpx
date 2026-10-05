# Environment variables

This is the complete application configuration reference. “Required” means the value must be supplied for the stated runtime or mode; values shown in `.env.example` are examples, not application defaults. The production server (`npm start`) reads `.env` through Node.js; Vite (`npm run dev`) loads it through Vite. Docker Compose supplies `MONGODB_URI` and, unless overridden, `GOOGLE_REDIRECT_URI` for its app container. Keep secrets outside version control.

| Variable | Default when unset | Required? | Purpose and behavior |
| --- | --- | --- | --- |
| `MONGODB_URI` | None; database name defaults to `getgpx` when the URI has no path | Yes, for the server, Vite API, and database migration | MongoDB connection string. Its path names the database, for example `mongodb://localhost:27017/getgpx`. Startup fails without it or when MongoDB cannot be reached. Integration tests need a URI pointing to an isolated test database. |
| `HOST` | `0.0.0.0` | No | Address bound by the production HTTP server. Vite uses its own host setting. |
| `PORT` | `3000` | No | Port bound by the production HTTP server. Vite uses its own port (normally `5173`). |
| `LOG_LEVEL` | `warn` | No | Pino minimum log level. `info` adds routine HTTP requests; `debug` adds step timings for homepage, public track, and upload requests. |
| `HOMEPAGE_TRACK_CACHE_ENABLED` | `false` | No | Only the literal `true` enables a per-process homepage track response cache. It refreshes hourly; failed refreshes retain the last successful value. Used by the production server. |
| `SORT_DISTRIBUTION_BARS_BY_SIZE` | `false` | No | Client presentation setting. Only the literal `true` sorts surface, way type, and road quality bar segments and statistics rows by descending percentage, including after profile selection changes. Vite reads `.env` or shell values and exposes only this boolean to the client; shell values take precedence. Restart Vite after changing it. Production uses the value provided during `npm run build`; setting it only on the running production server does not change an existing client bundle. |
| `GOOGLE_CLIENT_ID` | None | Yes | Google OAuth web client ID used to start sign-in and exchange authorization codes. |
| `GOOGLE_CLIENT_SECRET` | None | Yes | Google OAuth client secret used during code exchange. Store as a secret. |
| `GOOGLE_REDIRECT_URI` | None | Yes | Exact `/auth/google/callback` URL registered with Google, for example `http://localhost:5173/auth/google/callback` in Vite development. Its `https:` scheme makes production session cookies secure; Vite development explicitly uses non-secure cookies. Its origin also defines the allowed browser origin for API requests, including file delivery. |
| `SESSION_SECRET` | None | Yes | Signs the short-lived OAuth attempt cookie. Must contain at least 32 characters; changing it invalidates outstanding sign-in attempts. |
| `SITE_URL` | Origin of `GOOGLE_REDIRECT_URI`, otherwise `https://getgpx.link` | No | Trusted HTTP(S) origin for absolute Open Graph image/canonical URLs; must not contain paths, credentials, query or fragment. Set the public HTTPS origin in production and a localhost origin for local checks. |
| `TRACK_S3_BUCKET` | None | Yes | Private S3 bucket for GPX source, analysis and static list/sharing PNG preview objects. An invalid or missing name stops server startup. |
| `AWS_REGION` | None | Yes | AWS region used to construct the S3 client. An invalid or missing region stops server startup. |
| `TRACK_S3_PREFIX` | `dev` | No for development; set to `prod` in production | Prefix for S3 object keys. Separates environments sharing a bucket; changing it makes objects under the old prefix inaccessible through the new configuration. |
| `TRACK_PREVIEW_MAX_POINTS` | `200` | No | Minimum 2; limits the geographic preview coordinates retained in MongoDB and returned in track lists for client-side drawing. |
| `TRACK_PREVIEW_PROVIDER` | `none` | No | `none` keeps geographic SVG list previews; `mapbox` generates list (512×512) and sharing (1200×630) PNGs server-side, stores them in S3, and serves list images through authenticated website routes and sharing images publicly under the track read policy. Invalid providers stop startup. Changing the provider takes effect after restart; existing images stay available until `previews:regenerate -- --apply` is run. |
| `MAPBOX_ACCESS_TOKEN` | None | When `TRACK_PREVIEW_PROVIDER=mapbox` | Server-only Mapbox token with `styles:tiles` access; never sent to the browser. Missing tokens stop startup in Mapbox mode. Mapbox request failures keep SVG previews and do not block track publication. |
| `MAPBOX_PREVIEW_STYLE` | `mapbox/streets-v12` | No | Mapbox Studio style in `owner/style-id` form. Use a compatible Static Images style (not Mapbox Standard). Changing the style affects subsequent processing; run `previews:regenerate -- --apply` for existing previews; token changes do not invalidate images. |
| `TRACK_FILE_DELIVERY` | `stream` | No | `stream` serves GPX, analysis and website PNG previews through Node. `nginx` makes file handlers return local X-Accel-Redirect handoffs to an internal Nginx CloudFront proxy; Node handles authorization and JSON errors. Requires a matching Nginx configuration and the three CloudFront settings below. |
| `AWS_ACCESS_KEY_ID` | Unset; AWS SDK searches other credential sources | Conditional | Static S3 access key. If supplied, `AWS_SECRET_ACCESS_KEY` must also be supplied. Prefer role or profile credentials where available. |
| `AWS_SECRET_ACCESS_KEY` | Unset; AWS SDK searches other credential sources | Conditional | Secret paired with `AWS_ACCESS_KEY_ID`. Supplying only one of the pair stops startup. |
| `AWS_SESSION_TOKEN` | None | Only for temporary AWS credentials | Session token paired with temporary access key credentials. |
| `AWS_PROFILE` | Unset; AWS SDK uses its default credential chain | No | Selects a named AWS shared-credentials profile instead of supplying access keys directly. |
| `TRACK_CLOUDFRONT_DOMAIN` | None | When `TRACK_FILE_DELIVERY=nginx` | CloudFront domain used to build signed file URLs. |
| `TRACK_CLOUDFRONT_PUBLIC_KEY_ID` | None | When `TRACK_FILE_DELIVERY=nginx` | CloudFront key pair ID embedded in signed URLs. |
| `TRACK_CLOUDFRONT_PRIVATE_KEY_PATH` | None | When `TRACK_FILE_DELIVERY=nginx` | Path to the private key read at startup to sign CloudFront URLs. Keep the key outside version control. |
| `VALHALLA_URL` | `https://valhalla1.openstreetmap.de/trace_attributes` | No | Road and surface map matching endpoint. The public service is rate limited to one request start per second per process; a custom endpoint is not throttled. Also supplies the elevation endpoint unless `ELEVATION_URL` is set. |
| `VALHALLA_MAX_SEGMENT_KM` | `200` | No | Maximum distance per Valhalla map matching segment; splitting reserves 1% headroom for provider distance calculations. Missing, nonnumeric, or nonpositive values fall back to 200 km. Up to two segments run concurrently. |
| `ELEVATION_URL` | `VALHALLA_URL`, then the public Valhalla URL | No | Elevation service endpoint. The code changes a trailing `/trace_attributes` path to `/height`; a custom URL should support the Valhalla height API. |
| `OVERPASS_URL` | `https://overpass-api.de/api/interpreter`, then `https://overpass.kumi.systems/api/interpreter` | No | Custom Overpass endpoint for OSM way tags. If set, only that endpoint is tried; otherwise the second public endpoint is a fallback. |
| `NODE_ENV` | Unset for local Node; `production` in the Docker image | No | Standard Node runtime mode. The auth handler's default cookie policy uses it when called without an explicit option; the app supplies the policy from `GOOGLE_REDIRECT_URI`, and Vite forces development cookies. |

`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, and `AWS_PROFILE` are read by the AWS SDK credential chain. In Vite development, the configuration plugin copies these from Vite's `.env` into the Node process. `VALHALLA_URL`, `VALHALLA_MAX_SEGMENT_KM`, `ELEVATION_URL`, and `OVERPASS_URL` are read from `process.env` by backend modules and copied from Vite’s loaded environment during `npm run dev`; shell values take precedence over `.env` values. Restart the server after changing these settings. `LOG_LEVEL` is explicitly loaded from Vite's `.env`.

## Release workflow settings

These GitHub repository settings are not application runtime variables:

| Setting | Default when unset | Required? | Purpose and behavior |
| --- | --- | --- | --- |
| `DOCKERHUB_IMAGE` (repository variable) | None | Yes, for tagged releases | Docker Hub image name such as `namespace/getgpx`; the release workflow validates it and uses it for image tags. |
| `DOCKERHUB_USERNAME` (repository secret) | None | Yes, for tagged releases | Docker Hub login username used before publishing the image. |
| `DOCKERHUB_TOKEN` (repository secret) | None | Yes, for tagged releases | Docker Hub access token used with the username to publish the image. |

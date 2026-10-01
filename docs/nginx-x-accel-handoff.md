# Infrastructure task: GetGPX X-Accel-Redirect delivery

This task is self-contained for an infrastructure agent without application source
access. Update the production Nginx template in the infrastructure repository. Choose
the implementation appropriate to that deployment; preserve the following protocol.

## Application facts

Node listens at `http://getgpx:3000`. `TRACK_FILE_DELIVERY=stream` reads S3 in Node;
`TRACK_FILE_DELIVERY=nginx` uses the new protocol below. The environment variable
and CloudFront signing settings have not been renamed. The CloudFront hostname in
Nginx must equal `TRACK_CLOUDFRONT_DOMAIN` (the template currently uses
`{{ getgpx_cloudfront_domain }}`). AWS/S3 resource provisioning is unchanged.

| Public operation | Behavior |
| --- | --- |
| GET/HEAD `/api/v1/tracks/:id/gpx` | Node authorizes and hands the current source GPX to Nginx |
| GET/HEAD `/api/v1/tracks/:id/analysis` | Node authorizes and hands current detailed JSON to Nginx |
| GET/HEAD `/track-previews/:id.png` | Authenticated website route; Node hands the stored PNG to Nginx |
| PUT `/api/v1/tracks/:id/gpx` | Node replaces GPX; preserve method, body and headers |
| GET `/api/v1/tracks/:id` | Point-free MongoDB metadata; ordinary Node response |
| Other API/site requests | Ordinary Node proxying; Node owns route/method validation |

Public IDs are opaque. They are not S3 object IDs. Do not build object URLs from
public IDs. Internal file kinds are `gpx`, `analysis` and `preview`. The public OpenAPI
operation ID for GPX is `downloadGpx`. The JSON field `downloadURL` remains an object
keyed by file format. Operation IDs do not affect Nginx routing or the handoff protocol.

The old `GET /internal/track-files/:id/:kind` endpoint has been removed. There are
no `X-Track-File-*` response headers and no auth_request subrequests. All public
requests go directly to Node through the ordinary proxy configuration.

Forward the original Host, Cookie, Origin, Sec-Fetch-Site and Sec-Fetch-Mode to
Node, plus the deployment's usual forwarding headers. Node resolves/renews sessions
and, for API routes, applies its API origin policy before file selection and signing. A cross-origin
browser script receives 403 JSON with `error.code=CROSS_ORIGIN_FORBIDDEN`. Direct
CLI requests without browser-origin headers are allowed. Preserve Set-Cookie when
Node renews a session, including across successful internal file redirects.

## Successful handoff

A ready file in nginx mode produces HTTP 200 from Node with **no body** and:

```text
X-Accel-Redirect: /_track_files/tracks/<object-id>/<revision>/source.gpx?Expires=<value>&Signature=<value>&Key-Pair-Id=<value>
Content-Type: application/gpx+xml
Content-Disposition: attachment; filename="<ASCII fallback>"; filename*=UTF-8''<percent-encoded original filename>
Cache-Control: private, no-store
```

For previews the path ends in `preview-<16-lowercase-hex-characters>.png`,
Content-Type is `image/png`, and Content-Disposition is absent. The PNG uses the
same distribution, signing settings and internal proxy. Include this filename in
any internal path allowlist. `/track-previews/` uses website session authentication:
guests receive 401, invalid IDs receive 404, and a missing image reference receives
204. Delivery failures before handoff return 502 with only
`{"error":{"code":"TRACK_FILE_UNAVAILABLE"}}`; proxy failures must use the same safe
code. Preview delivery logs use `track_preview_delivery_failed`.

For analysis the path ends in `analysis.json`, Content-Type is `application/json`,
and Content-Disposition is absent. Query order is not a contractual requirement;
preserve the signed query exactly. Signature values may contain `~`, `_`, `-`,
`=` and percent escapes. The signer uses an Expires-based signature valid for
approximately 60 seconds. Object ID and revision contain only ASCII letters,
digits, `_` and `-`.

For example, the local redirect:

```text
/_track_files/tracks/0123456789abcdef01234567/opaque-revision/analysis.json?<signed-query>
```

must fetch:

```text
https://<fixed-cloudfront-domain>/tracks/0123456789abcdef01234567/opaque-revision/analysis.json?<identical-signed-query>
```

Strip only `/_track_files`. Do not insert the S3 prefix (`prod`): CloudFront origin
path supplies it. Node validates the object prefix, file path/kind, signed hostname,
path and required signature parameters before emitting the local redirect.

Configure an internal-only Nginx location for these redirects. Nginx must consume
X-Accel-Redirect itself; never return it to clients or convert it into a public 3xx.
A direct browser request to this location must be rejected, regardless of query
parameters or spoofed request headers. Block `/internal/` as defense in depth.
Keep Node's listener private to the proxy: bypassing Nginx would expose the local
signed redirect header and would not deliver the file.

The internal CloudFront proxy must:

- Use a fixed configured host, verified TLS, the correct Host and SNI, and trusted CA certificates.
- Forward no browser Cookie, Authorization, Origin, Referer or forwarding headers.
- Preserve the signed path/query without decoding/re-encoding signature parameters.
- Ignore CloudFront X-Accel-Redirect instructions; it must not initiate another internal redirect.
- Preserve Node's Content-Type, GPX Content-Disposition, Cache-Control and session Set-Cookie. Hide conflicting CloudFront Content-Type, Content-Disposition, Cache-Control and Set-Cookie headers. Nginx carries the relevant Node headers across X-Accel-Redirect; verify on the deployed version.
- Disable proxy caching and storage; the final success response is private, no-store.
- Return correct HEAD headers with no body. Node signs HEAD too; do not short-circuit it into an empty 200 without checking the object upstream.

## Error ownership

Node handles errors before the redirect with ordinary public API JSON. Pass these
responses through unchanged; no auth_request status conversion or reconstruction:

| Status | error.code | Meaning |
| --- | --- | --- |
| 404 | TRACK_NOT_FOUND | Track absent, invalid public ID, or inaccessible descriptor |
| 409 | TRACK_ANALYSIS_NOT_READY | Current file key is not ready |
| 502 | TRACK_FILE_UNAVAILABLE | Descriptor/identity lookup or signing failure |
| 403 | CROSS_ORIGIN_FORBIDDEN | Browser-origin policy rejection |
| 405 | METHOD_NOT_ALLOWED | Unsupported method; preserve Allow |

Error bodies use `{"error":{"code":"...","message":"..."}}`; some API errors
contain only code. GPX file messages are `Файл ещё не готов.` and
`Файл временно недоступен.`. Analysis messages are `Анализ ещё не готов.` and
`Анализ временно недоступен.`. Not-found message is `Трек не найден.`.
PUT GPX remains an authenticated mutation; a guest receives 401 from Node.

CloudFront and proxy transport failures occur after Node has handed off and must
still be normalized by Nginx. Missing objects, CloudFront access denials, upstream
3xx/4xx/5xx, DNS/TLS/connect/read failures must not reveal CloudFront HTML/XML bodies,
redirects, signed URLs or upstream cookies. For failed file delivery return public
502 JSON with error.code TRACK_FILE_UNAVAILABLE and the corresponding generic file
message above. Node transport failures also need safe JSON 5xx on file routes.
Do not rewrite successful Node JSON or its intended 4xx/5xx into another format.
For HEAD errors return the corresponding status and headers with no body. Ensure
error responses use application/json, private/no-store and no attachment disposition
left over from the successful GPX handoff. Once bytes have reached the client, a
stream failure cannot be replaced by JSON; log and terminate the response.

## Logging

Node logs descriptor/signing failures at error level as `track_file_delivery_failed`
with publicId, kind=gpx|analysis, stage=descriptor|sign and safe error name/code/status.
Node request logs already contain their own generated request ID, public pathname,
method and status. Node logs neither signed redirects nor raw provider error messages.
Node's successful handoff log status is 200; Nginx's log records the final result.

Nginx must log final status, request ID, method, safe original public pathname,
upstream statuses and timings, so a Node handoff followed by a CloudFront failure is
recognizable. An internal redirect changes $uri; prefer a safe original-path field
with query parameters removed. Neither $request, $request_uri, $args, upstream URLs,
X-Accel-Redirect values nor Location values may enter logs unfiltered. The Nginx and
Node request IDs are currently generated independently; do not assume they match.

Standard Nginx error logs may include the signed upstream URL even at error severity.
Choose a policy that avoids this leak while providing structured transport diagnosis.
Do not solve this by enabling verbose logging for the signed internal location.
Inspect success and failure logs with recognizable test-only signatures.

## Remove obsolete configuration

Remove the old public file interception/auth_request scheme, including:

- `/api/tracks/...` or special `/api/v1/tracks/...` auth_request locations.
- `$track_action` to `$track_kind` mapping (`gpx` to `download`).
- Signed-URL extraction from X-Track-File-URL and related maps/auth_request_set variables.
- `/_track_file_auth`, `/_track_auth_*`, @track_file_denied and method-418 fallback machinery.
- Duplicated Node authorization/not-found/not-ready JSON errors in Nginx.

Retain only what is needed for the regular Node proxy, internal CloudFront transfer,
transport-error normalization and safe diagnostics. A fixed-host proxy no longer
needs a regex to validate an application-supplied hostname.

## Deployment and verification

The new Node application and old auth_request configuration are incompatible. Roll
out both together (maintenance window or switch to a prepared matching stack). Do
not roll either one back alone. A temporary coordinated switch to stream mode is
possible, but requires regular Node proxying and application restart.

Check the rendered template with nginx -t, then exercise:

1. GET analysis and GPX: real body, correct Content-Type, GPX UTF-8 filename, private/no-store, no internal/signing header disclosure.
2. GET/HEAD stored PNG previews: authenticated access, image/png, no disposition, private/no-store, safe 502 on proxy failures.
3. HEAD GPX and analysis: real upstream verification, same file headers, no body.
4. PUT GPX: authenticated mutation reaches Node with its original payload; guest gets 401. Unsupported methods retain Node 405/Allow.
5. Metadata and other API/site requests remain ordinary Node operations.
6. Node 404/409/403/502 pass through as JSON unchanged; HEAD errors have no body.
7. Direct internal URLs and spoofed X-Accel headers cannot bypass Node authorization.
8. CloudFront 403/404/redirects/5xx and unreachable upstreams give safe 502 JSON; a midstream failure is logged and closes the transfer.
9. Session renewal cookies survive the redirect, while no identity headers reach CloudFront.
10. Expiry, private/no-store, and signature-free success/failure logs.

Local application verification exercised Nginx 1.30.4 in an isolated container with
stub Node/CloudFront servers: the transfer body and original Content-Type,
Content-Disposition and private/no-store survived the internal redirect while
conflicting upstream headers were hidden. This does not verify production TLS,
DNS, CloudFront, session renewal or the infrastructure template. Those checks remain
part of this task.

Deliver a patch, rationale, verification results, commands for rollout and joint
rollback. Clearly identify unperformed checks. Do not claim nginx -t alone verifies
production delivery.

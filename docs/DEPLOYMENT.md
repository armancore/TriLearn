# Deployment Notes

## Production checklist

- Set `NODE_ENV=production`
- Provide a production `DATABASE_URL`
- Generate real backend secrets with [backend/scripts/gen-env.sh](backend/scripts/gen-env.sh), then replace any local connection strings with production values
- Run `npm run prisma:migrate:deploy` before starting the app
- Expose `GET /health` for container and platform health checks, and set `HEALTHCHECK_KEY` for public load balancers
- Configure `SENTRY_DSN` or an equivalent external error alerting service
- Configure `FRONTEND_URL` with the exact deployed frontend origin
- Configure `TRUST_PROXY` for the deployment proxy chain
- On Render, set `ATTENDANCE_TIMEZONE=Asia/Kathmandu` and `FORCE_HTTPS=true`
- Set upload storage env vars explicitly if you keep local-disk uploads
- Set `FORCE_HTTPS=true` after confirming the reverse proxy forwards HTTPS metadata

## Database migrations

Use the following commands:

```bash
npm run prisma:migrate:deploy
npm run prisma:generate
```

Do not use `prisma migrate dev` in production.

## Connection pooling

The backend supports pg pool tuning with:

```env
PGPOOL_MAX=10
PGPOOL_MIN=0
PGPOOL_IDLE_TIMEOUT_MS=10000
PGPOOL_CONNECTION_TIMEOUT_MS=10000
PGPOOL_MAX_USES=0
```

You can also add connection parameters directly to `DATABASE_URL`, for example:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/trilearn?connection_limit=10&pool_timeout=20
```

### Supabase Postgres on Render

Supabase Postgres requires SSL for production connections. For Render, use the
Supabase connection string from the project **Connect** panel and make sure the
URL includes `sslmode=require`.

Recommended Render env values:

```env
DATABASE_URL=postgresql://postgres.PROJECT_REF:PASSWORD@POOLER_HOST:5432/postgres?sslmode=require
ATTENDANCE_TIMEZONE=Asia/Kathmandu
FORCE_HTTPS=true
TRUST_PROXY=1
PGPOOL_MAX=5
PGPOOL_MIN=0
PGPOOL_IDLE_TIMEOUT_MS=10000
PGPOOL_CONNECTION_TIMEOUT_MS=10000
PGSSL_REJECT_UNAUTHORIZED=false
```

Use Supabase's **Session pooler** URL for a persistent Render web service when
you need IPv4 compatibility. Use the direct database URL only from environments
that can reach Supabase over IPv6, or when your Supabase project has the IPv4
add-on enabled.

`PGSSL_REJECT_UNAUTHORIZED=false` disables TLS certificate validation. Keep this
only for managed-provider connection modes that require it, such as some
Supabase pooler deployments. Do not carry it into a self-hosted or custom
Postgres deployment unless you have explicitly accepted that TLS trust tradeoff;
prefer a valid CA chain and certificate verification.

If the database password contains reserved URL characters such as `@`, `#`, `?`,
`&`, `/`, or `%`, percent-encode the password before putting it in
`DATABASE_URL`.

## Notification worker

The BullMQ notification worker runs inside the same process as the HTTP server.
This is intentional for single-instance deployments (Railway, Render, single VPS).

If you scale to multiple backend instances, each instance will run its own worker.
To avoid duplicate job processing in a multi-instance setup, either:
- Run a dedicated worker process: NODE_ROLE=worker node src/jobs/notificationWorker.js
- Or use BullMQ's built-in job deduplication (jobId) on enqueue.

For the initial college deployment, single-instance is recommended.

## Timezone configuration

Set `ATTENDANCE_TIMEZONE` to your institution's IANA timezone. For the Nepal
deployment, set:

```env
ATTENDANCE_TIMEZONE=Asia/Kathmandu
```

Attendance day boundaries, month ranges, gate windows, and absence sync all use
this timezone. If it is missing or wrong, attendance can be recorded under the
wrong local day. The backend logs a startup warning when this value is missing.

## Health checks

- `GET /health` for the deployment readiness probe

`GET /health` is intentionally private by default. Requests from non-private
IP addresses return `404` unless they include the configured health-check key.
For cloud load balancers that probe from public IP ranges, set:

```env
HEALTHCHECK_KEY=replace-with-a-random-token
```

Then configure the probe to send that value as the `x-health-check-key`
request header.

For external uptime monitoring, configure:

```text
GET https://api.example.com/health
```

If the monitor reaches the API from a public IP, add the
`x-health-check-key: <HEALTHCHECK_KEY>` header. `/health` checks the process,
PostgreSQL, and Redis when Redis is configured, and returns `503` when a
required dependency is unavailable.

## Error alerting

The backend captures request errors, startup failures, notification worker
failures, unhandled rejections, and uncaught exceptions with Sentry when
`SENTRY_DSN` is set:

```env
SENTRY_DSN=https://public-key@o0.ingest.sentry.io/project-id
SENTRY_ENVIRONMENT=production
SENTRY_RELEASE=trilearn-api@1.0.0
SENTRY_TRACES_SAMPLE_RATE=0
```

Leave `SENTRY_TRACES_SAMPLE_RATE=0` unless tracing has been deliberately enabled
for the project. Error events are still sent when tracing is off.

## Reverse proxy headers

Production TLS termination must preserve secure-request detection for refresh
cookies. Configure the reverse proxy or load balancer to forward:

```text
X-Forwarded-Proto: https
```

The backend uses that header when deciding whether refresh cookies can use
`Secure` and `SameSite=None` for cross-origin browser refresh. See
[ADR 0001](docs/adr/0001-auth-token-transport.md).

## Mobile client version enforcement

Mobile requests include `X-Client-Version` and `X-App-Version` headers on
every API request. The backend validates mobile versions in
[mobileClient.middleware.js](backend/src/middleware/mobileClient.middleware.js).

Set the minimum supported app version with:

```env
MIN_MOBILE_VERSION=1.0.0
```

`MINIMUM_CLIENT_VERSION` is not currently used by the backend. The enforced
setting is `MIN_MOBILE_VERSION`, read by `mobileClient.middleware.js`.

When `X-App-Version` is lower than `MIN_MOBILE_VERSION`, the backend returns
HTTP `426 Upgrade Required` with the minimum version. The mobile app treats
that response as a forced upgrade signal: it clears the current session and
prompts the user to install an updated app before continuing.

## Web session persistence

The web app keeps access tokens in memory and uses the httpOnly refresh cookie
to restore a session after a tab or browser restart. For deployed browsers to
stay signed in for the 7-day refresh lifetime, deploy the frontend and backend
under the same site, for example:

```text
https://trilearn.example.com
https://api.trilearn.example.com
```

Avoid relying on separate `*.onrender.com` frontend and backend hostnames for
browser session persistence. Some browsers treat that API cookie as third-party
state and may not keep or send it after reopening the app.

Use these production env values:

```env
ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_DAYS=7
FRONTEND_URL=https://trilearn.example.com
TRUST_PROXY=1
FORCE_HTTPS=true
```

In Render, add the custom frontend domain to the static site and the custom API
domain to the backend service, then point DNS records at Render's provided
targets. Set `VITE_API_URL` on the frontend to the API custom domain, for
example `https://api.trilearn.example.com/api/v1`.

## Database backups

Schedule a daily pg_dump using cron or your platform's managed backup feature.

Example cron job (runs at 2am daily, keeps 7 days):

```bash
0 2 * * * pg_dump $DATABASE_URL | gzip > /backups/trilearn_$(date +\%Y\%m\%d).sql.gz
find /backups -name "trilearn_*.sql.gz" -mtime +7 -delete
```

For Railway or Render: enable the platform's automated PostgreSQL backup feature
from the database dashboard. No additional config needed.

## HTTPS reverse proxy

The backend enforces HTTPS in production before routing requests. It accepts a
request only when Express sees `req.secure === true` or the reverse proxy sends:

```nginx
proxy_set_header X-Forwarded-Proto $scheme;
```

A minimal Nginx location block should include:

```nginx
location / {
  proxy_pass http://127.0.0.1:5000;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

Production deployments should also set:

```env
FORCE_HTTPS=true
```

If `NODE_ENV=production` and `FORCE_HTTPS` is not set to `true`, the backend
logs a startup warning so the deployment team explicitly acknowledges HTTPS and
proxy forwarding have been configured.

For Render, TLS is terminated by the platform and `X-Forwarded-Proto` is
forwarded to the service, so set `FORCE_HTTPS=true` to keep startup logs clean
after confirming the service is only exposed through Render HTTPS.

## Reverse proxy / trust proxy

Express uses `trust proxy` to decide whether headers such as
`X-Forwarded-For` and `X-Forwarded-Proto` should be used for `req.ip`,
`req.ips`, and `req.secure`. This matters for HTTPS enforcement, private
health-check detection, audit metadata, and rate limiting. If it is missing
behind a cloud load balancer, the backend may see the proxy IP instead of the
client IP, which can make rate limits apply to the wrong address.

Set `TRUST_PROXY` to the smallest trust boundary that matches the deployment:

```env
# Railway, Render, Fly.io, Heroku:
TRUST_PROXY=1

# Self-hosted nginx/Caddy:
TRUST_PROXY=your-proxy-server-ip-or-cidr
```

Recommended values:

| Provider | `TRUST_PROXY` value |
| --- | --- |
| Railway | `1` |
| Render | `1` |
| Fly.io | `1` |
| Heroku | `1` |
| Self-hosted nginx/Caddy | The proxy server IP or CIDR |

Never set `TRUST_PROXY=true`. That tells Express to trust every client-supplied
`X-Forwarded-For` value, so a direct client can spoof its IP address and bypass
IP-based rate limiting or pollute audit data.

## Frontend security headers

The React frontend is a static Vite build. The backend Helmet policy protects
API responses, but it does not add headers to `frontend/dist/index.html` or the
compiled JS assets when those files are served by Nginx, Caddy, or a CDN.

Set a Content Security Policy on `text/html` responses from the frontend host.
A conservative starting point for the current SPA is:

```http
Content-Security-Policy: default-src 'self'; script-src 'self'; connect-src 'self' wss:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'
```

For Nginx deployments that serve the built frontend directly:

```nginx
location / {
  try_files $uri $uri/ /index.html;
  add_header Content-Security-Policy "default-src 'self'; script-src 'self'; connect-src 'self' wss:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
}
```

If the API is served from a different origin, add that exact HTTPS origin to
`connect-src`. If the realtime endpoint is on a different WebSocket origin, add
that exact `wss://` origin as well.

Verify the deployed frontend response before closing the CSP deployment task:

```bash
curl -I https://your-frontend.example
```

The response for `text/html` should include `Content-Security-Policy`.

## Docker

The backend includes [backend/Dockerfile](backend/Dockerfile) for containerized deployment.

Use [docker-compose.prod.yml](docker-compose.prod.yml) for production compose
deployments. It builds the backend image and runs it without mounting the source
directory. The production compose file explicitly targets the final Dockerfile
stage and resets backend volumes so the development source bind mount cannot be
carried into a layered production compose invocation. [docker-compose.yml](docker-compose.yml)
is for development only.

For production, run the production file directly:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Do not use plain `docker compose up` for production; that uses
[docker-compose.yml](docker-compose.yml), the development stack.

Example:

```bash
docker build -t trilearn-backend ./backend
docker run --env-file backend/.env -p 5000:5000 trilearn-backend
```

## File storage

This repo supports S3 object storage with a local-disk fallback for development:

```env
UPLOAD_DIR=/app/uploads
UPLOAD_PUBLIC_PATH=/uploads
UPLOAD_BASE_URL=
S3_BUCKET=
S3_REGION=
S3_ACCESS_KEY=
S3_SECRET_KEY=
```

Important:

When all `S3_*` values are set, uploads are stored in S3. If any are blank,
the backend falls back to local disk and logs a warning. Local-disk uploads are
not suitable for stateless production platforms or multi-instance deployments.

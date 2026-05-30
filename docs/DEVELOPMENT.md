# Development

## Docker Setup

TriLearn can run the backend and its local dependencies with Docker Compose. The stack starts:

- PostgreSQL 16 on `localhost:5432`
- Redis 7 on `localhost:6379`
- Backend API on `localhost:5000`

## First Run

Create the Docker Compose environment file at the repo root:

```bash
cp .env.example .env
```

Create the backend application environment file:

```bash
cp backend/.env.example backend/.env
```

The default examples are aligned for local Docker. If you change `POSTGRES_USER`, `POSTGRES_PASSWORD`, or `REDIS_PASSWORD` in the root `.env`, Docker Compose will pass those values to the backend container.

Start everything:

```bash
npm run dev:docker
```

The backend service bind-mounts `./backend` into the container and runs `npm start`.
Restart the backend container after source changes you want reflected in the API.

## Database

The backend container waits for Postgres and Redis health checks, generates Prisma Client, and applies committed migrations before starting the dev server.

Postgres data and Redis data are stored in named Docker volumes:

- `trilearn_postgres_data`
- `trilearn_redis_data`

To reset local Docker data, stop the stack and remove volumes:

```bash
docker-compose down -v
```

## Mobile Client Authentication

Native mobile requests that need the CSRF exemption must include a signed mobile client identity. Set `MOBILE_CLIENT_SHARED_SECRET` in `backend/.env` and compile the same value into the mobile app:

```bash
openssl rand -hex 32
```

For each request, send these headers:

- `X-Client-Type: mobile`
- `X-Client-Version: <app version>`
- `X-App-Platform: <platform>`
- `X-Client-Signature: <hex hmac>`

The signature is:

```text
HMAC-SHA256(MOBILE_CLIENT_SHARED_SECRET, `${X-Client-Type}:${X-Client-Version}:${X-App-Platform}:${flooredTimestamp}`)
```

where `flooredTimestamp = Math.floor(Date.now() / 30000)`. The backend accepts the current 30-second window and the previous one for minor clock skew. If `MOBILE_CLIENT_SHARED_SECRET` is not configured, the mobile CSRF exemption is disabled.

This is a shared app-build secret, not a per-device secret. Rotation requires
a coordinated backend and mobile app rollout; see
[ADR 0003](docs/adr/0003-mobile-client-shared-secret.md).

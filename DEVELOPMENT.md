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

The backend service bind-mounts `./backend` into the container and runs `npm run dev`, so source changes reload through `nodemon`.

## Database

The backend container waits for Postgres and Redis health checks, generates Prisma Client, and applies committed migrations before starting the dev server.

Postgres data and Redis data are stored in named Docker volumes:

- `trilearn_postgres_data`
- `trilearn_redis_data`

To reset local Docker data, stop the stack and remove volumes:

```bash
docker-compose down -v
```

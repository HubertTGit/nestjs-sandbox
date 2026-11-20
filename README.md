# NestJS Sandbox

A NestJS 12 TypeScript REST API using ESM, Express, Drizzle ORM, PostgreSQL 18, Swagger/OpenAPI, Vitest, and Oxlint.

## Prerequisites

- **Node.js** 22+ (Node 24 recommended)
- **pnpm** (`corepack enable` or install via [pnpm.io](https://pnpm.io/installation))
- **Podman** with `podman compose` (for the local PostgreSQL 18 database in `compose.yaml`), or an existing PostgreSQL instance

## Step-by-Step Setup

### 1. Clone the repository and install dependencies

```bash
git clone <repository-url>
cd nestjs-sandbox
pnpm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Default `.env` contents:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/mydb
```

Optional environment variables:

| Variable             | Default | Description                                        |
| -------------------- | ------- | -------------------------------------------------- |
| `PORT`               | `3000`  | Port the HTTP server listens on                    |
| `OBSERVE_APP_KEY`    | —       | NestJS Observe app key (optional telemetry)        |
| `OBSERVE_APP_SECRET` | —       | NestJS Observe app secret (optional telemetry)     |

### 3. Start PostgreSQL

Start the local PostgreSQL 18 container with Podman Compose:

```bash
pnpm db:up
```

> To stop the container later, run `pnpm db:down`.

### 4. Apply database migrations

Run Drizzle migrations to create the database tables:

```bash
pnpm db:migrate
```

*(Alternatively, during local development you can push schema changes directly with `pnpm db:push`, generate new migrations after editing `src/database/schema.ts` with `pnpm db:generate`, or inspect tables in Drizzle Studio with `pnpm db:studio`.)*

### 5. Run the application

Start the API in watch mode for development:

```bash
pnpm start:dev
```

Other run modes:

```bash
# Single run (no watch)
pnpm start

# Debug mode with watch
pnpm start:debug

# Production build & run
pnpm build
pnpm start:prod
```

By default, the server runs at `http://localhost:3000`.

### 6. Verify it's working

- **Swagger / OpenAPI UI**: open [http://localhost:3000/docs](http://localhost:3000/docs)
- **Health check** (verifies PostgreSQL connectivity):

```bash
curl http://localhost:3000/health
# {"status":"ok"}
```

- **Create and list todos**:

```bash
curl -X POST http://localhost:3000/todos \
  -H "Content-Type: application/json" \
  -d '{"task":"Buy milk"}'

curl http://localhost:3000/todos
```

## API Endpoints

| Method   | Path         | Description                  |
| -------- | ------------ | ---------------------------- |
| `GET`    | `/`          | Hello World endpoint         |
| `GET`    | `/health`    | Check database connectivity  |
| `GET`    | `/docs`      | Interactive Swagger UI       |
| `POST`   | `/todos`     | Create a todo                |
| `GET`    | `/todos`     | List all todos               |
| `GET`    | `/todos/:id` | Get a todo by ID             |
| `PATCH`  | `/todos/:id` | Update a todo                |
| `DELETE` | `/todos/:id` | Delete a todo                |

## Testing, Linting & Formatting

```bash
# Unit tests (Vitest)
pnpm test

# Unit tests in watch mode
pnpm test:watch

# Test coverage
pnpm test:cov

# End-to-end tests (requires PostgreSQL running via `pnpm db:up`)
pnpm test:e2e

# Type-aware linting (Oxlint)
pnpm lint

# Code formatting (Prettier)
pnpm format
```

## Optional: NestJS Observe

The app is pre-configured with `ObserveModule` in `src/app.module.ts`. To connect it to [NestJS Observe](https://observe.nestjs.com) for traces, logs, metrics, and error tracking:

```bash
pnpm dlx @nestjs/observe link
```

This writes `OBSERVE_APP_KEY` and `OBSERVE_APP_SECRET` into `.env`.

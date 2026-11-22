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

Default `.env` contents (update the Google OAuth credentials and generate a secret of at least 32 bytes with `openssl rand -base64 32`):

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/mydb
APP_URL=http://localhost:3000
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
JWT_SECRET=<at-least-32-byte-secret>
```

Optional environment variables:

| Variable                    | Default | Description                                                               |
| --------------------------- | ------- | ------------------------------------------------------------------------- |
| `PORT`                      | `3000`  | Port the HTTP server listens on                                           |
| `GOOGLE_ALLOWED_CLIENT_IDS` | —       | Optional comma-separated additional Google OAuth Client IDs               |
| `CORS_ORIGINS`              | —       | Comma-separated allowed browser origins for CORS                          |
| `CLOUD_SQL_PROXY_PORT`      | `5433`  | Local port used by `pnpm db:proxy` for `cloud-sql-proxy`                  |
| `CLOUD_SQL_INSTANCE`        | —       | Cloud SQL instance connection name (`project:region:instance`)            |
| `OBSERVE_APP_KEY`           | —       | NestJS Observe app key (optional telemetry)                               |
| `OBSERVE_APP_SECRET`        | —       | NestJS Observe app secret (optional telemetry)                            |

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

- **Authenticate with Google OIDC to get a Bearer token**:

  Open [http://localhost:3000/auth/oidc/google/login](http://localhost:3000/auth/oidc/google/login) in a browser → sign in with Gmail → copy the returned `accessToken`.

- **Create and list todos**:

  Without a token → `401 Unauthorized`:

```bash
curl -i -X POST http://localhost:3000/todos \
  -H "Content-Type: application/json" \
  -d '{"task":"Buy milk"}'
```

  With the Bearer `accessToken`:

```bash
curl -X POST http://localhost:3000/todos \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"task":"Buy milk"}'

# Listing todos is publicly accessible
curl http://localhost:3000/todos
```

## API Endpoints

| Method   | Path                          | Auth    | Description                                         |
| -------- | ----------------------------- | ------- | --------------------------------------------------- |
| `GET`    | `/`                           | Public  | Hello World endpoint                                |
| `GET`    | `/health`                     | Public  | Check database connectivity                         |
| `GET`    | `/docs`                       | Public  | Interactive Swagger UI                              |
| `POST`   | `/auth/google`                | Public  | Exchange a Google ID token for access + refresh tokens |
| `POST`   | `/auth/refresh`               | Public  | Rotate a refresh token (body or cookie) for a fresh token pair |
| `GET`    | `/auth/oidc/:provider/login`  | Public  | Initiate Google OAuth/OIDC sign-in                  |
| `GET`    | `/auth/oidc/:provider/callback` | Public | Handle Google OAuth/OIDC callback                  |
| `GET`    | `/auth/token`                 | Session | Issue a Bearer JWT access token for the session     |
| `GET`    | `/auth/me`                    | Bearer  | Return the currently authenticated user             |
| `POST`   | `/auth/logout`                | Public  | Revoke a refresh token (body or cookie) and clear any browser session |
| `POST`   | `/todos`                      | Bearer  | Create a todo                                       |
| `GET`    | `/todos`                      | Public  | List all todos                                      |
| `GET`    | `/todos/:id`                  | Public  | Get a todo by ID                                    |
| `PATCH`  | `/todos/:id`                  | Bearer  | Update a todo                                       |
| `DELETE` | `/todos/:id`                  | Bearer  | Delete a todo                                       |

## Testing `POST /auth/google` with Google OAuth 2.0 Playground

`POST /auth/google` verifies a **Google-signed OIDC ID token** (`RS256` JWT starting with `eyJ...`) whose `aud` claim matches `GOOGLE_CLIENT_ID` (or `GOOGLE_ALLOWED_CLIENT_IDS`). Do **not** pass your raw `GOOGLE_CLIENT_ID` string or a Google OAuth `access_token` (`ya29...`).

### 1. Allow the Playground redirect URI (one-time setup)

1. Open **Google Cloud Console → APIs & Services → Credentials**.
2. Click the Web OAuth 2.0 Client ID configured as `GOOGLE_CLIENT_ID` in `.env`.
3. Under **Authorized redirect URIs**, add:
   ```text
   https://developers.google.com/oauthplayground
   ```
4. Click **Save**.
   *(If your OAuth consent screen publishing status is **Testing**, make sure your Google account is listed under **Test users**.)*

### 2. Obtain a Google `id_token`

1. Open [Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground).
2. Click the **gear icon (OAuth 2.0 configuration)** in the top-right corner.
3. Check **Use your own OAuth credentials**.
4. Enter your `GOOGLE_CLIENT_ID` as **OAuth Client ID** and `GOOGLE_CLIENT_SECRET` as **OAuth Client secret**, then close the settings popover.
5. In **Step 1 — Select & authorize APIs**, enter the following in the **Input your own scopes** box at the bottom and click **Authorize APIs**:
   ```text
   openid email profile
   ```
6. Sign in with your Google account and grant consent.
7. In **Step 2 — Exchange authorization code for tokens**, click **Exchange authorization code for tokens**.
8. From the response JSON on the right, copy the **`id_token`** field (starts with `eyJ...` — do **not** copy `access_token`).

### 3. Exchange the `id_token` via `POST /auth/google`

- **JSON body transport (`body`, default — recommended for Swagger, `curl`, and mobile clients):**

```bash
curl -X POST http://localhost:3000/auth/google \
  -H "Content-Type: application/json" \
  -H "X-Auth-Transport: body" \
  -d '{"idToken": "<GOOGLE_ID_TOKEN>"}'
```

Returns `{ accessToken, refreshToken, expiresIn, user }`.

- **HttpOnly cookie transport (`cookie` — recommended for same-site Web SPAs):**

```bash
curl -i -c cookies.txt -X POST http://localhost:3000/auth/google \
  -H "Content-Type: application/json" \
  -H "X-Auth-Transport: cookie" \
  -d '{"idToken": "<GOOGLE_ID_TOKEN>"}'
```

Returns `{ accessToken, expiresIn, user }` and delivers `refresh_token` in an `HttpOnly; SameSite=Lax; Path=/auth` cookie (`Secure` is added automatically when `APP_URL` starts with `https://`).

### 4. Use the returned `accessToken` in Swagger or `curl`

- Copy **only** the `accessToken` value (`eyJ...`) — without surrounding quotes, without a `Bearer ` prefix, and without trailing JSON fields like `refreshToken`.
- In Swagger UI (`/docs`), click **Authorize**, paste the raw `accessToken`, and test protected routes (`GET /auth/me`, `POST /todos`, `PATCH /todos/:id`, `DELETE /todos/:id`).
- When the 15-minute `accessToken` expires, rotate tokens using `POST /auth/refresh` (see below).

### Troubleshooting `POST /auth/google`

- **`401 Invalid Google ID token`**: confirm you copied `id_token` (not `access_token` or `GOOGLE_CLIENT_ID`), enabled **Use your own OAuth credentials** with the same `GOOGLE_CLIENT_ID` as `.env`, and that the token has not expired (~1 hour lifetime).
- **`401 malformed token` on `/todos` or `/auth/me`**: check the `Authorization` header in Swagger's generated `curl` — ensure there is no duplicate `Bearer ` prefix, no quotes, and that you pasted `accessToken` (not `refreshToken`).

## Using `POST /auth/refresh`

`POST /auth/refresh` rotates a single-use refresh token (30-day lifetime) and issues a fresh `accessToken` + `refreshToken` pair. Every successful refresh invalidates the previous refresh token (reusing an already-rotated token revokes the token family and returns `401`).

### Headers: `X-Auth-Transport` and `cookie`

Both headers are optional:

- **`X-Auth-Transport`** (`body` | `cookie`): selects how the new `refreshToken` is returned.
  - `body` (default when omitted and a body token is sent): returns `refreshToken` in the JSON response body.
  - `cookie`: omits `refreshToken` from JSON and sets `Set-Cookie: refresh_token=...; Path=/auth; HttpOnly; SameSite=Lax; Max-Age=2592000` (+ `Secure` when `APP_URL` starts with `https://`).
  - **Auto-inferred:** if you omit `X-Auth-Transport` and do not pass `refreshToken` in the JSON body, the endpoint automatically uses `cookie` transport whenever a `refresh_token` cookie is present.
- **`cookie`** (`refresh_token=<token>`): **leave this blank in Swagger UI and browser apps.** Browsers block JavaScript (including Swagger UI) from manually setting a `Cookie` header; instead, the browser automatically attaches the `HttpOnly` `refresh_token` cookie set by `POST /auth/google` (with `X-Auth-Transport: cookie`). You can inspect the stored cookie in Browser DevTools → **Application → Cookies → `http://localhost:3000`** (`refresh_token`).

### Option A: JSON body transport (`body`)

Best for Swagger UI, `curl`, and mobile clients (Android/iOS):

```bash
curl -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -H "X-Auth-Transport: body" \
  -d '{"refreshToken": "<REFRESH_TOKEN>"}'
```

In Swagger UI (`/docs`): leave `cookie` blank, set `X-Auth-Transport` to `body` (or blank), and provide `{"refreshToken": "<REFRESH_TOKEN>"}` in the request body. Use the **new** `refreshToken` from the response on subsequent refresh calls.

### Option B: HttpOnly cookie transport (`cookie`)

Best for same-site browser SPAs:

- **In Swagger UI (`/docs`):**
  1. Call `POST /auth/google` with `X-Auth-Transport: cookie` so the browser stores the `HttpOnly` `refresh_token` cookie.
  2. Call `POST /auth/refresh` with **`cookie` blank** and **request body blank** (`{}`) — the browser sends the cookie automatically and replaces it with the newly rotated cookie.
- **In a browser SPA (`fetch`):**
  ```ts
  const res = await fetch('http://localhost:3000/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  });
  const { accessToken, expiresIn, user } = await res.json();
  ```
- **With `curl`:** use a cookie jar (`-b` to send the stored cookie and `-c` to save the rotated cookie):
  ```bash
  curl -i -b cookies.txt -c cookies.txt -X POST http://localhost:3000/auth/refresh \
    -H "X-Auth-Transport: cookie"
  ```

## Using `POST /auth/logout`

`POST /auth/logout` is a public endpoint that always returns `204 No Content`. It revokes the refresh token family (if a refresh token is provided via body or cookie), clears the `refresh_token` cookie when applicable, and signs out any active browser OIDC session.

### Headers: `cookie` and `X-Auth-Transport`

Both headers are optional:

- **`cookie`**: **leave blank in Swagger UI and browser apps.** Browsers block JavaScript from manually setting a `Cookie` header and automatically send the `HttpOnly` `refresh_token` cookie and any OIDC session cookie (when using `credentials: 'include'` in `fetch`).
- **`X-Auth-Transport`** (`body` | `cookie`):
  - Leave blank (or set to `body`) when revoking a refresh token sent in the JSON body.
  - Leave blank or set to `cookie` when logging out via the `refresh_token` cookie. If the browser sends `refresh_token`, leaving it blank still revokes the token and returns `Set-Cookie: refresh_token=; Max-Age=0`; setting `X-Auth-Transport: cookie` explicitly guarantees the clear-cookie header is returned even if no `refresh_token` cookie was attached.

### Option A: JSON body transport (`body`)

Best for Swagger UI, `curl`, and mobile clients (Android/iOS):

```bash
curl -i -X POST http://localhost:3000/auth/logout \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "<REFRESH_TOKEN>"}'
```

In Swagger UI (`/docs`): leave `cookie` and `X-Auth-Transport` blank, and pass `{"refreshToken": "<REFRESH_TOKEN>"}` in the JSON body.

### Option B: HttpOnly cookie transport (`cookie`)

Best for same-site browser SPAs:

- **In Swagger UI (`/docs`):** leave `cookie` blank, set `X-Auth-Transport` to `cookie` (or blank), and send an empty body (`{}`).
- **In a browser SPA (`fetch`):**
  ```ts
  await fetch('http://localhost:3000/auth/logout', {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-Auth-Transport': 'cookie' },
  });
  ```
- **With `curl`:**
  ```bash
  curl -i -b cookies.txt -c cookies.txt -X POST http://localhost:3000/auth/logout \
    -H "X-Auth-Transport: cookie"
  ```

### Option C: Browser OIDC session (`/auth/oidc/google/login`)

Leave both headers and the request body blank — the endpoint clears the active browser session cookie.

> **Note for Swagger UI & SPAs:** `accessToken` JWTs are stateless until their 15-minute expiry. After calling `POST /auth/logout`, also discard the in-memory `accessToken` in your SPA (or click **Authorize → Logout** in Swagger UI).

## Migrating Schema Changes to Remote Cloud SQL via `db:proxy`

Use the `pnpm db:proxy` script (`scripts/cloud-sql-proxy.mjs`) to open a local tunnel to Cloud SQL and apply Drizzle migrations without modifying your local `.env` `DATABASE_URL`.

### 1. Prerequisites

1. Authenticate `gcloud` and select your GCP project:

```bash
gcloud auth login
gcloud auth application-default login
gcloud config set project <your-gcp-project-id>
```

2. Download the [Cloud SQL Auth Proxy](https://cloud.google.com/sql/docs/postgres/sql-proxy) binary into the project root as `./cloud-sql-proxy` and make it executable (`cloud-sql-proxy` is git-ignored):

```bash
chmod +x ./cloud-sql-proxy
```

3. Set the proxy variables in `.env`:

```env
CLOUD_SQL_PROXY_PORT=5433
CLOUD_SQL_INSTANCE=<project-id>:<region>:<instance-name>
```

### 2. Generate a new migration (after editing `src/database/schema.ts`)

```bash
pnpm db:generate
```

Inspect the generated SQL file in `drizzle/` before applying it to the remote database.

### 3. Start the Cloud SQL Auth Proxy (Terminal 1)

```bash
pnpm db:proxy
```

This runs `./cloud-sql-proxy --port <CLOUD_SQL_PROXY_PORT> <CLOUD_SQL_INSTANCE>`. Wait until the output confirms the proxy is ready for new connections.

*(You can override settings inline without editing `.env`, e.g. `CLOUD_SQL_PROXY_PORT=5434 pnpm db:proxy`, or forward extra flags like `pnpm db:proxy --private-ip`.)*

### 4. Apply migrations to the remote database (Terminal 2)

Pass the remote `DATABASE_URL` inline so your local `.env` stays pointed at local Postgres (`drizzle.config.ts` uses `process.loadEnvFile('.env')`, which does not overwrite env vars already set in the shell):

```bash
DATABASE_URL='postgresql://<DB_USER>:<URL_ENCODED_PASSWORD>@127.0.0.1:5433/<DB_NAME>' pnpm db:migrate
```

- Replace `<DB_USER>` (e.g. `postgres` or your application user), `<URL_ENCODED_PASSWORD>` (URL-encode special characters like `@`, `#`, `/`, `:`, `%`), port `5433` (matching `CLOUD_SQL_PROXY_PORT`), and `<DB_NAME>`.
- Optionally inspect the remote database with Drizzle Studio over the same proxy:

```bash
DATABASE_URL='postgresql://<DB_USER>:<URL_ENCODED_PASSWORD>@127.0.0.1:5433/<DB_NAME>' pnpm db:studio
```

### 5. Verify and stop the proxy

- Verify tables directly if needed:
  ```bash
  gcloud sql connect <instance-name> --user=<DB_USER> --database=<DB_NAME>
  ```
- Stop the proxy in Terminal 1 with `Ctrl+C`.

### Troubleshooting Remote Migrations

- **`drizzle-kit migrate` exits with code 1 while showing `applying migrations...`**: `drizzle-kit`'s spinner can hide the underlying `pg` error. Run this probe to print the exact PostgreSQL error code and message:
  ```bash
  DATABASE_URL='postgresql://<DB_USER>:<URL_ENCODED_PASSWORD>@127.0.0.1:5433/<DB_NAME>' \
    node -e 'const { Client } = require("pg"); const c = new Client({ connectionString: process.env.DATABASE_URL }); c.connect().then(() => c.query("SELECT current_database(), current_user")).then(r => { console.log(r.rows); return c.end(); }).catch(e => { console.error(e.code, e.message); process.exit(1); });'
  ```
- **`28P01 password authentication failed`**: verify the username, password, and URL-encoding, or check/reset users via:
  ```bash
  gcloud sql users list --instance=<instance-name>
  gcloud sql users set-password <DB_USER> --instance=<instance-name> --password='<NEW_PASSWORD>'
  ```
- **`USER_PROJECT_DENIED` from `gcloud`**: select the right project with `gcloud config set project <your-gcp-project-id>` (or pass `--project=<your-gcp-project-id>`).

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

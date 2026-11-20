# AGENTS.md

## Project Overview

NestJS 12 TypeScript API (`nestjs-sandbox`) using ESM, Express (`@nestjs/platform-express`), Drizzle ORM + PostgreSQL, Swagger/OpenAPI, Vitest, and Oxlint.

- **Package manager**: `pnpm` (do not use `npm` or `yarn`).
- **Runtime / Module system**: Node.js ESM (`"type": "module"`, `moduleResolution: "nodenext"`).
  - Relative imports **must** end in `.js` (even for `.ts` files).
  - `__dirname` does not exist; use `import.meta.dirname`.

## Architecture & Conventions

- **Entry & OpenAPI**: `src/main.ts` boots the app (default port `3000`) and serves Swagger UI at `/docs`. Keep `@ApiTags`, `@ApiOperation`, response decorators, and DTO `@ApiProperty*` decorators up to date when adding or changing endpoints.
- **Configuration**: Global `ConfigModule` (`src/app.module.ts`). Read required env vars with `config.getOrThrow(...)`. Document any new env vars in `.env.example`.
- **Database (Drizzle + Postgres 18)**:
  - Local Postgres is managed via Podman Compose (`compose.yaml`, `pnpm db:up` / `pnpm db:down`).
  - Schema and `Database` type live in `src/database/schema.ts`. Migrations are stored in `drizzle/` (`drizzle.config.ts`).
  - Inject the database with `@InjectDrizzle() private readonly db: Database`.
  - After schema changes, run `pnpm db:generate` (and `pnpm db:migrate` or `pnpm db:push` against local DB).
- **Feature layout**: Group features under `src/<feature>/` (`*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.dto.ts`, `*.controller.spec.ts`).
- **Validation**: Currently validated manually in services (no validation library installed yet). If adding schema validation, NestJS 12 supports Standard Schema libraries (Zod, Valibot, ArkType) via `StandardSchemaValidationPipe` (`@Body({ schema })`, `@Param('id', { schema })`), or `class-validator` via `ValidationPipe` (https://docs.nestjs.com/application/validation.md).
- **Existing endpoints**:
  - `GET /`, `GET /health` (DB connectivity check) in `src/app.controller.ts`
  - `/todos` CRUD in `src/todos/todos.controller.ts`

## Testing & Verification

Run these before finishing changes:

- `pnpm lint` — type-aware `oxlint` (`typescript/no-floating-promises` is an error)
- `pnpm test` — Vitest unit tests (`**/*.spec.ts`, `globals: true`, use `vi.fn()`, mock Drizzle with `provide: getDrizzleToken()`)
- `pnpm build` — NestJS TypeScript build
- `pnpm test:e2e` — E2E tests (`test/*.e2e-spec.ts`; requires Postgres running via `pnpm db:up` and `DATABASE_URL` in `.env`)
- `pnpm format` — Prettier formatting

Keep Swagger OpenAPI assertions in controller specs when adding new routes or DTOs.

## NestJS 12 Reference

This app uses NestJS 12 (`^12.0.1`), which is newer than older training defaults. Check https://docs.nestjs.com/llms.txt (one markdown page per chapter) and prefer Nest's first-party packages before adding third-party alternatives:

- **Data & Config**: [`@nestjs/drizzle`](https://docs.nestjs.com/data/drizzle.md) (in use), [`@nestjs/config`](https://docs.nestjs.com/application/configuration.md) (in use), [`@nestjs/cache-manager`](https://docs.nestjs.com/data/caching.md), [`@nestjs/typeorm`](https://docs.nestjs.com/data/typeorm.md), [`@nestjs/mongoose`](https://docs.nestjs.com/data/mongodb.md), [`@nestjs/sequelize`](https://docs.nestjs.com/data/sequelize.md)
- **API & Transport**: [`@nestjs/swagger`](https://docs.nestjs.com/openapi/introduction.md) (in use), [`@nestjs/graphql`](https://docs.nestjs.com/graphql/quick-start.md), [`@nestjs/websockets`](https://docs.nestjs.com/websockets/gateways.md), [`@nestjs/microservices`](https://docs.nestjs.com/microservices/basics.md), [`@nestjs/webhooks`](https://docs.nestjs.com/http/webhooks.md)
- **Security**: [`@nestjs/authentication`](https://docs.nestjs.com/security/authentication.md), [`@nestjs/authorization`](https://docs.nestjs.com/security/authorization.md), [`@nestjs/throttler`](https://docs.nestjs.com/security/rate-limiting.md)
- **Reliability & Ops**: [`@nestjs/terminus`](https://docs.nestjs.com/reliability/terminus.md), [`@nestjs/resilience`](https://docs.nestjs.com/reliability/resilience.md), [`@nestjs/idempotency`](https://docs.nestjs.com/reliability/idempotency.md), [`@nestjs/outbox`](https://docs.nestjs.com/reliability/outbox.md), [`@nestjs/locks`](https://docs.nestjs.com/reliability/locks.md), [`@nestjs/workflows`](https://docs.nestjs.com/reliability/workflows.md)
- **App Features**: [`@nestjs/event-emitter`](https://docs.nestjs.com/application/events.md), [`@nestjs/bullmq`](https://docs.nestjs.com/application/queues.md), [`@nestjs/schedule`](https://docs.nestjs.com/application/task-scheduling.md), [`@nestjs/mail`](https://docs.nestjs.com/application/mail.md), [`@nestjs/storage`](https://docs.nestjs.com/application/file-storage.md), [`@nestjs/i18n`](https://docs.nestjs.com/application/i18n.md), [`@nestjs/ai`](https://docs.nestjs.com/ai/overview.md), [`@nestjs/mcp`](https://docs.nestjs.com/mcp/overview.md)

## Observability: NestJS Observe

`ObserveModule` is configured in `src/app.module.ts` (`serviceId: 'nestjs-sandbox'`) using `OBSERVE_APP_KEY` and `OBSERVE_APP_SECRET` from `.env` (written via `pnpm dlx @nestjs/observe link`).

For production issues (errors, slow endpoints, regressions), inspect telemetry from [NestJS Observe](https://observe.nestjs.com) via the Observe MCP server (https://www.observe.nestjs.com/documentation/mcp) or a trace copied with **Copy agent prompt** from the dashboard rather than guessing from code alone.

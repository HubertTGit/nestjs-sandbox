# Stage 1: Base image with pnpm 11
FROM node:24-slim AS base
WORKDIR /app
RUN npm install -g pnpm@11

# Stage 2: Production dependencies only
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

# Stage 3: Build TypeScript application
FROM base AS builder
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm build

# Stage 4: Lean production runtime
FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --chown=node:node package.json ./
COPY --chown=node:node --from=prod-deps /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node drizzle ./drizzle

USER node
EXPOSE 8080
CMD ["node", "dist/main.js"]

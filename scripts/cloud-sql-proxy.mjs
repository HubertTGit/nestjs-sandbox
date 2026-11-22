import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const rootDir = resolve(import.meta.dirname, '..');
const envPath = resolve(rootDir, '.env');
const proxyBin = resolve(rootDir, 'cloud-sql-proxy');

if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const port = process.env.CLOUD_SQL_PROXY_PORT?.trim() || '5433';
const instance = process.env.CLOUD_SQL_INSTANCE?.trim();

if (!existsSync(proxyBin)) {
  console.error(
    `cloud-sql-proxy binary not found at ${proxyBin}. Download it before running pnpm db:proxy.`,
  );
  process.exit(1);
}

if (!instance) {
  console.error(
    'CLOUD_SQL_INSTANCE is not set. Define it in .env (e.g. project:region:instance).',
  );
  process.exit(1);
}

const extraArgs = process.argv.slice(2);
const args = ['--port', port, ...extraArgs, instance];

const child = spawn(proxyBin, args, { stdio: 'inherit' });

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

child.on('error', (error) => {
  console.error(`Failed to start cloud-sql-proxy: ${error.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

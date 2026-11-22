import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface.js';

export function parseCorsOrigins(raw?: string): string[] {
  if (!raw) {
    return [];
  }

  return [
    ...new Set(
      raw
        .split(',')
        .map((origin) => origin.trim().replace(/\/+$/, ''))
        .filter((origin) => origin.length > 0),
    ),
  ];
}
//build cors options from 
export function buildCorsOptions(rawOrigins?: string): CorsOptions | null {
  const origins = parseCorsOrigins(rawOrigins);
  if (origins.length === 0) {
    return null;
  }

  return {
    origin: origins,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Auth-Transport'],
  };
}

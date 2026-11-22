import { buildCorsOptions, parseCorsOrigins } from './cors.config.js';

describe('cors.config', () => {
  it('parses, trims, deduplicates, and strips trailing slashes from origins', () => {
    expect(
      parseCorsOrigins(
        ' http://localhost:5173/ , https://app.example.com, https://app.example.com/ , ',
      ),
    ).toEqual(['http://localhost:5173', 'https://app.example.com']);
  });

  it('returns null when CORS_ORIGINS is empty or undefined', () => {
    expect(buildCorsOptions(undefined)).toBeNull();
    expect(buildCorsOptions('   ')).toBeNull();
  });

  it('builds credentialed CORS options allowing Authorization and X-Auth-Transport headers', () => {
    expect(
      buildCorsOptions('http://localhost:5173,https://app.example.com'),
    ).toEqual({
      origin: ['http://localhost:5173', 'https://app.example.com'],
      credentials: true,
      methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Auth-Transport'],
    });
  });
});

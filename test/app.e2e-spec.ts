import { TokenService } from '@nestjs/authentication';
import { authenticationStoreContract } from '@nestjs/authentication/testing';
import { INestApplication } from '@nestjs/common';
import { getDrizzleToken } from '@nestjs/drizzle';
import { Test, TestingModule } from '@nestjs/testing';
import { eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { DrizzleRefreshTokenStore } from './../src/auth/drizzle-refresh-token.store.js';
import { buildCorsOptions } from './../src/cors.config.js';
import {
  type Database,
  refreshTokens,
  revokedRefreshTokenFamilies,
  users,
} from './../src/database/schema.js';

describe('AppController & Todos Auth (e2e)', () => {
  let app: INestApplication<App>;
  let db: Database;
  let tokenService: TokenService;
  let refreshTokenStore: DrizzleRefreshTokenStore;
  let testUserId: number | undefined;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    const corsOptions = buildCorsOptions('https://app.example.com');
    if (corsOptions) {
      app.enableCors(corsOptions);
    }
    await app.init();

    db = app.get<Database>(getDrizzleToken());
    tokenService = app.get(TokenService);
    refreshTokenStore = app.get(DrizzleRefreshTokenStore);
  });

  afterEach(async () => {
    if (testUserId !== undefined) {
      await db
        .delete(refreshTokens)
        .where(eq(refreshTokens.userId, String(testUserId)));
      await db.delete(users).where(eq(users.id, testUserId));
      testUserId = undefined;
    }
    if (app) {
      await app.close();
    }
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('responds with configured CORS headers for allowed browser origins', async () => {
    const res = await request(app.getHttpServer())
      .options('/todos')
      .set('Origin', 'https://app.example.com')
      .set('Access-Control-Request-Method', 'POST')
      .set(
        'Access-Control-Request-Headers',
        'Authorization,Content-Type,X-Auth-Transport',
      )
      .expect(204);

    expect(res.headers['access-control-allow-origin']).toBe(
      'https://app.example.com',
    );
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('/todos (GET) is publicly accessible', () => {
    return request(app.getHttpServer()).get('/todos').expect(200);
  });

  it('rejects unauthenticated todo mutations with 401', async () => {
    await request(app.getHttpServer())
      .post('/todos')
      .send({ task: 'Unauthenticated task' })
      .expect(401);

    await request(app.getHttpServer())
      .patch('/todos/1')
      .send({ isCompleted: true })
      .expect(401);

    await request(app.getHttpServer()).delete('/todos/1').expect(401);
  });

  it('allows creating, updating, and deleting a todo with a valid Bearer access token', async () => {
    const uniqueSuffix = Date.now();
    const [user] = await db
      .insert(users)
      .values({
        googleSub: `e2e-google-sub-${uniqueSuffix}`,
        email: `e2e-${uniqueSuffix}@gmail.com`,
        name: 'E2E User',
      })
      .returning();
    testUserId = user.id;

    const { accessToken } = await tokenService.issue(String(user.id), {
      method: 'oidc:google',
      claims: { email: user.email },
    });

    const createRes = await request(app.getHttpServer())
      .post('/todos')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ task: 'Authenticated task' })
      .expect(201);

    const createdId = (createRes.body as { id: number }).id;

    await request(app.getHttpServer())
      .patch(`/todos/${createdId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ isCompleted: true })
      .expect(200)
      .expect((res) => {
        expect((res.body as { isCompleted: boolean }).isCompleted).toBe(true);
      });

    await request(app.getHttpServer())
      .delete(`/todos/${createdId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);
  });

  it('rotates refresh tokens via POST /auth/refresh, detects reuse, and revokes on POST /auth/logout', async () => {
    const uniqueSuffix = Date.now();
    const [user] = await db
      .insert(users)
      .values({
        googleSub: `e2e-refresh-sub-${uniqueSuffix}`,
        email: `e2e-refresh-${uniqueSuffix}@gmail.com`,
        name: 'Refresh User',
      })
      .returning();
    testUserId = user.id;

    const initial = await tokenService.issue(String(user.id), {
      method: 'google:id_token',
      claims: { email: user.email },
    });

    const rotatedRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: initial.refreshToken })
      .expect(200);

    const rotatedBody = rotatedRes.body as {
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      user: { id: number; email: string; name: string | null };
    };
    expect(rotatedBody.accessToken).toEqual(expect.any(String));
    expect(rotatedBody.refreshToken).not.toBe(initial.refreshToken);
    expect(rotatedBody.user.id).toBe(user.id);

    // Reusing old token returns 401 and revokes the family.
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: initial.refreshToken })
      .expect(401);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: rotatedBody.refreshToken })
      .expect(401);

    // Start a new family and verify cookie-based refresh + logout.
    const second = await tokenService.issue(String(user.id), {
      method: 'google:id_token',
      claims: { email: user.email },
    });

    const cookieRefreshRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `refresh_token=${encodeURIComponent(second.refreshToken)}`)
      .expect(200);

    expect(
      (cookieRefreshRes.body as { refreshToken?: string }).refreshToken,
    ).toBeUndefined();
    const setCookies = cookieRefreshRes.headers['set-cookie'];
    expect(
      Array.isArray(setCookies) ? setCookies.join(';') : setCookies,
    ).toContain('refresh_token=');

    const rotatedCookieHeader = (
      Array.isArray(setCookies) ? setCookies[0] : (setCookies ?? '')
    ).split(';')[0];

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', rotatedCookieHeader)
      .expect(204);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', rotatedCookieHeader)
      .expect(401);
  });

  it('passes @nestjs/authentication refreshTokens store contract (including concurrency)', async () => {
    const createdTokenIds = new Set<string>();
    const touchedFamilyIds = new Set<string>();

    const trackedStore = {
      getRefreshToken: (id: string) => refreshTokenStore.getRefreshToken(id),
      saveRefreshToken: async (
        record: Parameters<DrizzleRefreshTokenStore['saveRefreshToken']>[0],
      ) => {
        createdTokenIds.add(record.id);
        touchedFamilyIds.add(record.familyId);
        return refreshTokenStore.saveRefreshToken(record);
      },
      markRefreshTokenUsed: (id: string, at: Date) =>
        refreshTokenStore.markRefreshTokenUsed(id, at),
      revokeRefreshTokenFamily: async (familyId: string) => {
        touchedFamilyIds.add(familyId);
        return refreshTokenStore.revokeRefreshTokenFamily(familyId);
      },
      isRefreshTokenFamilyRevoked: (familyId: string) =>
        refreshTokenStore.isRefreshTokenFamilyRevoked(familyId),
      revokeUserRefreshTokens: (userId: string) =>
        refreshTokenStore.revokeUserRefreshTokens(userId),
    };

    const cases = authenticationStoreContract(
      () => ({ refreshTokens: trackedStore }),
      { contracts: ['refreshTokens'], concurrent: true },
    );

    try {
      for (const testCase of cases) {
        await testCase.run();
      }
    } finally {
      if (createdTokenIds.size > 0) {
        await db
          .delete(refreshTokens)
          .where(inArray(refreshTokens.id, [...createdTokenIds]));
      }
      if (touchedFamilyIds.size > 0) {
        await db
          .delete(revokedRefreshTokenFamilies)
          .where(
            inArray(revokedRefreshTokenFamilies.familyId, [
              ...touchedFamilyIds,
            ]),
          );
      }
    }
  });
});

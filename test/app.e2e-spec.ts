import { TokenService } from '@nestjs/authentication';
import { getDrizzleToken } from '@nestjs/drizzle';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { type Database, users } from './../src/database/schema.js';

describe('AppController & Todos Auth (e2e)', () => {
  let app: INestApplication<App>;
  let db: Database;
  let tokenService: TokenService;
  let testUserId: number | undefined;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    db = app.get<Database>(getDrizzleToken());
    tokenService = app.get(TokenService);
  });

  afterEach(async () => {
    if (testUserId !== undefined) {
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
});

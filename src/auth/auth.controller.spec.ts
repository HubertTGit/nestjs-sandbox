import {
  AuthenticationGuard,
  AuthenticationModule,
  google,
  type OidcProfile,
  OidcService,
  SignInService,
  TokenService,
} from '@nestjs/authentication';
import {
  type ExecutionContext,
  Global,
  Module,
  UnauthorizedException,
} from '@nestjs/common';
import { getDrizzleToken } from '@nestjs/drizzle';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test, type TestingModule } from '@nestjs/testing';
import type { User } from '../database/schema.js';
import { TodosController } from '../todos/todos.controller.js';
import { TodosModule } from '../todos/todos.module.js';
import { AuthController } from './auth.controller.js';
import { AuthModule } from './auth.module.js';
import { AuthService } from './auth.service.js';
import { GoogleOidcResolver } from './google-oidc.resolver.js';
import { JwtAuthProvider } from './jwt-auth.provider.js';

function createHttpContext(
  methodName: keyof TodosController,
  headers: Record<string, string> = {},
): { context: ExecutionContext; request: Record<string, unknown> } {
  const handler = Object.getOwnPropertyDescriptor(
    TodosController.prototype,
    methodName,
  )?.value as (...args: never[]) => unknown;
  const request: Record<string, unknown> = { headers };
  const response = { setHeader: vi.fn() };
  const context = {
    getType: () => 'http',
    getClass: () => TodosController,
    getHandler: () => handler,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;

  return { context, request };
}

describe('AuthController & AuthModule', () => {
  let moduleRef: TestingModule;
  let authController: AuthController;
  let authService: AuthService;
  let authGuard: AuthenticationGuard;
  let googleResolver: GoogleOidcResolver;
  let jwtAuthProvider: JwtAuthProvider;
  let oidcService: OidcService;
  let signInService: SignInService;
  let tokenService: TokenService;

  const sampleUser: User = {
    id: 42,
    googleSub: 'google-sub-123',
    email: 'alice@gmail.com',
    name: 'Alice Smith',
    createdAt: new Date('2026-11-20T08:00:00.000Z'),
    updatedAt: new Date('2026-11-20T08:00:00.000Z'),
  };

  let returningMock: ReturnType<typeof vi.fn>;
  let whereMock: ReturnType<typeof vi.fn>;
  let mockDb: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    returningMock = vi.fn();
    whereMock = vi.fn();

    mockDb = {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoUpdate: vi.fn(() => ({
            returning: returningMock,
          })),
        })),
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: whereMock,
        })),
      })),
    };

    @Global()
    @Module({
      providers: [{ provide: getDrizzleToken(), useValue: mockDb }],
      exports: [getDrizzleToken()],
    })
    class MockDrizzleModule {}

    moduleRef = await Test.createTestingModule({
      imports: [
        MockDrizzleModule,
        AuthenticationModule.forRoot({
          accessToken: {
            key: 'test-jwt-secret-key-at-least-32-bytes-long!!',
            issuer: 'http://localhost:3000',
            audience: 'nestjs-sandbox',
            ttl: '15m',
          },
          refreshToken: false,
          session: {
            cookie: { secure: false },
          },
          oidc: {
            callbackUrl: 'http://localhost:3000/auth/oidc/:provider/callback',
            redirectAfterLogin: '/auth/token',
            cookie: { secure: false },
            providers: {
              google: google({
                clientId: 'test-google-client-id',
                clientSecret: 'test-google-client-secret',
              }),
            },
          },
        }),
        AuthModule,
        TodosModule,
      ],
    }).compile();

    await moduleRef.init();

    authController = moduleRef.get(AuthController);
    authService = moduleRef.get(AuthService);
    authGuard = moduleRef.get(AuthenticationGuard);
    googleResolver = moduleRef.get(GoogleOidcResolver);
    jwtAuthProvider = moduleRef.get(JwtAuthProvider);
    oidcService = moduleRef.get(OidcService);
    signInService = moduleRef.get(SignInService);
    tokenService = moduleRef.get(TokenService);
  });

  afterEach(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  it('delegates Google login to OidcService.start', async () => {
    const startSpy = vi.spyOn(oidcService, 'start').mockResolvedValueOnce({
      url: 'https://accounts.google.com/o/oauth2/v2/auth',
      cookies: [],
    });

    await expect(
      authController.login('google', '/auth/token'),
    ).resolves.toEqual({
      url: 'https://accounts.google.com/o/oauth2/v2/auth',
      cookies: [],
    });
    expect(startSpy).toHaveBeenCalledWith('google', {
      redirectTo: '/auth/token',
    });
  });

  it('delegates Google callback to OidcService.finish', async () => {
    const finishSpy = vi
      .spyOn(oidcService, 'finish')
      .mockResolvedValueOnce({ url: '/auth/token', cookies: [] });

    await expect(
      authController.callback('google', { code: 'abc', state: 'xyz' }),
    ).resolves.toEqual({ url: '/auth/token', cookies: [] });
    expect(finishSpy).toHaveBeenCalledWith('google', {
      code: 'abc',
      state: 'xyz',
    });
  });

  it('upserts verified Google user in GoogleOidcResolver', async () => {
    returningMock.mockResolvedValueOnce([sampleUser]);

    const profile: OidcProfile = {
      provider: 'google',
      subject: 'google-sub-123',
      email: 'alice@gmail.com',
      emailVerified: true,
      name: 'Alice Smith',
      claims: {},
    };

    await expect(
      googleResolver.resolveUser(profile, { accessToken: 'google-token' }, {}),
    ).resolves.toEqual({ id: '42' });
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
  });

  it('refuses unverified Google email in GoogleOidcResolver', async () => {
    const profile: OidcProfile = {
      provider: 'google',
      subject: 'google-sub-123',
      email: 'alice@gmail.com',
      emailVerified: false,
      claims: {},
    };

    await expect(
      googleResolver.resolveUser(profile, { accessToken: 'google-token' }, {}),
    ).resolves.toBeNull();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('issues a JWT access token for the authenticated user', async () => {
    const result = await authController.issueToken(sampleUser);

    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.accessToken.split('.')).toHaveLength(3);
    expect(result.expiresIn).toBe(900);
    expect(result.user).toEqual({
      id: 42,
      email: 'alice@gmail.com',
      name: 'Alice Smith',
    });
  });

  it('returns public user info on /auth/me', () => {
    expect(authController.me(sampleUser)).toEqual({
      id: 42,
      email: 'alice@gmail.com',
      name: 'Alice Smith',
    });
  });

  it('signs out the session on /auth/logout', async () => {
    const signOutSpy = vi
      .spyOn(signInService, 'signOut')
      .mockResolvedValueOnce(true);

    await expect(authController.logout()).resolves.toBeUndefined();
    expect(signOutSpy).toHaveBeenCalledTimes(1);
  });

  it('validates JWT claims against the users table in JwtAuthProvider', async () => {
    whereMock.mockResolvedValueOnce([sampleUser]);

    await expect(jwtAuthProvider.validate({ sub: '42' })).resolves.toEqual(
      sampleUser,
    );
    await expect(authService.findUserById('not-a-number')).resolves.toBeNull();
  });

  it('enforces Bearer access token on todo writes while keeping reads public', async () => {
    const readCtx = createHttpContext('findAll');
    await expect(authGuard.canActivate(readCtx.context)).resolves.toBe(true);

    const writeMethods: Array<keyof TodosController> = [
      'create',
      'update',
      'remove',
    ];

    for (const method of writeMethods) {
      const noTokenCtx = createHttpContext(method);
      await expect(authGuard.canActivate(noTokenCtx.context)).rejects.toThrow(
        UnauthorizedException,
      );

      const badTokenCtx = createHttpContext(method, {
        authorization: 'Bearer invalid.token.value',
      });
      await expect(authGuard.canActivate(badTokenCtx.context)).rejects.toThrow(
        UnauthorizedException,
      );
    }

    const { accessToken } = await tokenService.issue('42', {
      method: 'oidc:google',
      claims: { email: sampleUser.email },
    });

    for (const method of writeMethods) {
      whereMock.mockResolvedValueOnce([sampleUser]);
      const validCtx = createHttpContext(method, {
        authorization: `Bearer ${accessToken}`,
      });
      await expect(authGuard.canActivate(validCtx.context)).resolves.toBe(true);
      expect(validCtx.request.user).toEqual(sampleUser);
    }
  });

  it('exposes auth endpoints and DTO schemas in OpenAPI document', async () => {
    const nestApp = moduleRef.createNestApplication();
    const config = new DocumentBuilder()
      .setTitle('NestJS Sandbox API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(nestApp, config);

    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([
        '/auth/oidc/{provider}/login',
        '/auth/oidc/{provider}/callback',
        '/auth/token',
        '/auth/me',
        '/auth/logout',
      ]),
    );
    expect(document.components?.schemas).toHaveProperty(
      'AccessTokenResponseDto',
    );
    expect(document.components?.schemas).toHaveProperty('AuthUserDto');
    expect(document.paths['/auth/me']?.get?.security).toEqual([{ bearer: [] }]);

    await nestApp.close();
  });
});

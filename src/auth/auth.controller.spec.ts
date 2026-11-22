import {
  AuthenticationGuard,
  AuthenticationModule,
  google,
  type OidcProfile,
  OidcService,
  RefreshTokenError,
  SignInService,
  TokenService,
} from '@nestjs/authentication';
import {
  BadRequestException,
  type ExecutionContext,
  Global,
  Module,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { getDrizzleToken } from '@nestjs/drizzle';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import type { User } from '../database/schema.js';
import { TodosController } from '../todos/todos.controller.js';
import { TodosModule } from '../todos/todos.module.js';
import { AuthController } from './auth.controller.js';
import { AuthModule } from './auth.module.js';
import { AuthService } from './auth.service.js';
import { DrizzleRefreshTokenStore } from './drizzle-refresh-token.store.js';
import { GoogleIdTokenVerifier } from './google-id-token.verifier.js';
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

function createMockResponse(): {
  res: Response;
  append: ReturnType<typeof vi.fn>;
} {
  const append = vi.fn();
  return {
    res: { append } as unknown as Response,
    append,
  };
}

describe('AuthController & AuthModule', () => {
  let moduleRef: TestingModule;
  let authController: AuthController;
  let authService: AuthService;
  let authGuard: AuthenticationGuard;
  let googleIdTokenVerifier: GoogleIdTokenVerifier;
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
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              APP_URL: 'https://api.example.com',
              GOOGLE_CLIENT_ID: 'test-google-client-id',
              GOOGLE_ALLOWED_CLIENT_IDS: 'android-client-id,ios-client-id',
            }),
          ],
        }),
        MockDrizzleModule,
        AuthenticationModule.forRoot({
          allowInMemoryStorage: true,
          accessToken: {
            key: 'test-jwt-secret-key-at-least-32-bytes-long!!',
            issuer: 'https://api.example.com',
            audience: 'nestjs-sandbox',
            ttl: '15m',
          },
          refreshToken: {
            ttl: '30d',
            absoluteTtl: '90d',
          },
          session: {
            cookie: { secure: false },
          },
          oidc: {
            callbackUrl: 'https://api.example.com/auth/oidc/:provider/callback',
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
    })
      // Let AuthenticationStorage use its in-memory refresh store in unit tests;
      // DrizzleRefreshTokenStore is tested directly and via contract tests.
      .overrideProvider(DrizzleRefreshTokenStore)
      .useValue({})
      .compile();

    await moduleRef.init();

    authController = moduleRef.get(AuthController);
    authService = moduleRef.get(AuthService);
    authGuard = moduleRef.get(AuthenticationGuard);
    googleIdTokenVerifier = moduleRef.get(GoogleIdTokenVerifier);
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

  it('authenticates with Google ID token and returns access + refresh tokens in JSON body', async () => {
    vi.spyOn(googleIdTokenVerifier, 'verify').mockResolvedValueOnce({
      subject: 'google-sub-123',
      email: 'alice@gmail.com',
      emailVerified: true,
      name: 'Alice Smith',
    });
    returningMock.mockResolvedValueOnce([sampleUser]);

    const result = await authController.googleSignIn(
      { idToken: 'valid-google-id-token' },
      undefined,
    );

    expect(result.accessToken.split('.')).toHaveLength(3);
    expect(result.refreshToken).toEqual(expect.any(String));
    expect(result.expiresIn).toBe(900);
    expect(result.user).toEqual({
      id: 42,
      email: 'alice@gmail.com',
      name: 'Alice Smith',
    });
  });

  it('delivers refresh token via HttpOnly cookie when X-Auth-Transport is cookie', async () => {
    vi.spyOn(googleIdTokenVerifier, 'verify').mockResolvedValueOnce({
      subject: 'google-sub-123',
      email: 'alice@gmail.com',
      emailVerified: true,
      name: 'Alice Smith',
    });
    returningMock.mockResolvedValueOnce([sampleUser]);
    const { res, append } = createMockResponse();

    const result = await authController.googleSignIn(
      { idToken: 'valid-google-id-token' },
      'cookie',
      res,
    );

    expect(result.accessToken.split('.')).toHaveLength(3);
    expect(result.refreshToken).toBeUndefined();
    expect(append).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringMatching(
        /^refresh_token=[^;]+; Path=\/auth; HttpOnly; SameSite=Lax; Max-Age=2592000; Secure$/,
      ),
    );
  });

  it('rejects empty Google idToken with BadRequestException', async () => {
    await expect(
      authController.googleSignIn({ idToken: '   ' }, undefined),
    ).rejects.toThrow(BadRequestException);
  });

  it('rotates refresh token via JSON body and detects reuse', async () => {
    const initial = await authService.issueAccessToken(
      sampleUser,
      'google:id_token',
    );
    whereMock.mockResolvedValueOnce([sampleUser]);

    const rotated = await authController.refresh({
      refreshToken: initial.refreshToken,
    });

    expect(rotated.accessToken.split('.')).toHaveLength(3);
    expect(rotated.refreshToken).toEqual(expect.any(String));
    expect(rotated.refreshToken).not.toBe(initial.refreshToken);
    expect(rotated.user).toEqual({
      id: 42,
      email: 'alice@gmail.com',
      name: 'Alice Smith',
    });

    // Reusing the already-rotated token fails and revokes the whole family.
    await expect(
      authController.refresh({ refreshToken: initial.refreshToken }),
    ).rejects.toThrow(RefreshTokenError);

    await expect(
      authController.refresh({ refreshToken: rotated.refreshToken }),
    ).rejects.toThrow(RefreshTokenError);
  });

  it('rotates refresh token from HttpOnly cookie and clears cookie on failure', async () => {
    const initial = await authService.issueAccessToken(
      sampleUser,
      'google:id_token',
    );
    whereMock.mockResolvedValueOnce([sampleUser]);
    const { res, append } = createMockResponse();

    const rotated = await authController.refresh(
      undefined,
      `refresh_token=${encodeURIComponent(initial.refreshToken)}`,
      undefined,
      res,
    );

    expect(rotated.refreshToken).toBeUndefined();
    expect(rotated.accessToken.split('.')).toHaveLength(3);
    expect(append).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('refresh_token='),
    );

    const failRes = createMockResponse();
    await expect(
      authController.refresh(
        undefined,
        'refresh_token=invalid-token',
        'cookie',
        failRes.res,
      ),
    ).rejects.toThrow(RefreshTokenError);

    expect(failRes.append).toHaveBeenCalledWith(
      'Set-Cookie',
      'refresh_token=; Path=/auth; HttpOnly; SameSite=Lax; Max-Age=0; Secure',
    );
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

  it('issues JWT access + refresh tokens for the authenticated session user', async () => {
    const result = await authController.issueToken(sampleUser);

    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.accessToken.split('.')).toHaveLength(3);
    expect(result.refreshToken).toEqual(expect.any(String));
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

  it('revokes refresh token, clears cookie, and signs out browser session on /auth/logout', async () => {
    const initial = await authService.issueAccessToken(
      sampleUser,
      'google:id_token',
    );
    const signOutSpy = vi
      .spyOn(signInService, 'signOut')
      .mockResolvedValueOnce(true);
    const { res, append } = createMockResponse();

    await expect(
      authController.logout(
        undefined,
        `refresh_token=${encodeURIComponent(initial.refreshToken)}`,
        'cookie',
        res,
      ),
    ).resolves.toBeUndefined();

    expect(signOutSpy).toHaveBeenCalledTimes(1);
    expect(append).toHaveBeenCalledWith(
      'Set-Cookie',
      'refresh_token=; Path=/auth; HttpOnly; SameSite=Lax; Max-Age=0; Secure',
    );
    await expect(
      authController.refresh({ refreshToken: initial.refreshToken }),
    ).rejects.toThrow(RefreshTokenError);
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
        '/auth/google',
        '/auth/refresh',
        '/auth/oidc/{provider}/login',
        '/auth/oidc/{provider}/callback',
        '/auth/token',
        '/auth/me',
        '/auth/logout',
      ]),
    );
    expect(document.components?.schemas).toHaveProperty('GoogleAuthDto');
    expect(document.components?.schemas).toHaveProperty('RefreshTokenDto');
    expect(document.components?.schemas).toHaveProperty('LogoutDto');
    expect(document.components?.schemas).toHaveProperty(
      'AccessTokenResponseDto',
    );
    expect(document.components?.schemas).toHaveProperty('AuthUserDto');
    expect(document.paths['/auth/me']?.get?.security).toEqual([{ bearer: [] }]);

    await nestApp.close();
  });
});

import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Redirect,
  Res,
} from '@nestjs/common';
import {
  Authenticate,
  CurrentUser,
  JwtBearerProvider,
  OidcService,
  Public,
  SessionCookieProvider,
  SignInService,
} from '@nestjs/authentication';
import { ConfigService } from '@nestjs/config';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiFoundResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import type { User } from '../database/schema.js';
import {
  AccessTokenResponseDto,
  AuthUserDto,
  GoogleAuthDto,
  LogoutDto,
  RefreshTokenDto,
} from './auth.dto.js';
import { AuthService, type IssuedAuthTokens } from './auth.service.js';
import {
  REFRESH_TOKEN_COOKIE_NAME,
  readCookieValue,
  serializeClearRefreshTokenCookie,
  serializeRefreshTokenCookie,
} from './refresh-cookie.util.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly secureCookies: boolean;

  constructor(
    private readonly oidcService: OidcService,
    private readonly signInService: SignInService,
    private readonly authService: AuthService,
    config: ConfigService,
  ) {
    const appUrl = config.get<string>('APP_URL') ?? '';
    this.secureCookies = appUrl.trim().startsWith('https://');
  }

  @Public()
  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Authenticate with a Google ID token (Web, Android, iOS) and issue access + refresh tokens',
  })
  @ApiHeader({
    name: 'X-Auth-Transport',
    required: false,
    description:
      'Set to "cookie" to deliver the refresh token in an HttpOnly SameSite=Lax cookie (omitted from JSON body). Defaults to JSON body.',
    schema: { type: 'string', enum: ['body', 'cookie'] },
  })
  @ApiOkResponse({ type: AccessTokenResponseDto })
  @ApiBadRequestResponse({ description: 'Missing or malformed idToken' })
  @ApiUnauthorizedResponse({
    description: 'Invalid Google ID token or unverified email',
  })
  async googleSignIn(
    @Body() body: GoogleAuthDto,
    @Headers('x-auth-transport') transport: string | undefined,
    @Res({ passthrough: true }) res?: Response,
  ): Promise<AccessTokenResponseDto> {
    const issued = await this.authService.authenticateWithGoogleIdToken(
      body?.idToken,
    );
    return this.formatTokenResponse(issued, transport, res);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Rotate a refresh token (from JSON body or HttpOnly cookie) and issue a fresh token pair',
  })
  @ApiHeader({
    name: 'X-Auth-Transport',
    required: false,
    description:
      'Set to "cookie" to rotate the refresh token in an HttpOnly SameSite=Lax cookie. Also inferred automatically when the token is supplied via the refresh_token cookie.',
    schema: { type: 'string', enum: ['body', 'cookie'] },
  })
  @ApiOkResponse({ type: AccessTokenResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Missing, invalid, expired, or reused refresh token',
  })
  async refresh(
    @Body() body?: RefreshTokenDto,
    @Headers('cookie') cookieHeader?: string,
    @Headers('x-auth-transport') transport?: string,
    @Res({ passthrough: true }) res?: Response,
  ): Promise<AccessTokenResponseDto> {
    const cookieToken = readCookieValue(
      cookieHeader,
      REFRESH_TOKEN_COOKIE_NAME,
    );
    const bodyToken = body?.refreshToken;
    const token = bodyToken ?? cookieToken;
    const useCookieTransport =
      this.isCookieTransport(transport) ||
      (!bodyToken && cookieToken !== undefined);

    try {
      const issued = await this.authService.refreshTokens(token);
      return this.formatTokenResponse(
        issued,
        useCookieTransport ? 'cookie' : 'body',
        res,
      );
    } catch (error) {
      if (useCookieTransport && res) {
        res.append(
          'Set-Cookie',
          serializeClearRefreshTokenCookie(this.secureCookies),
        );
      }
      throw error;
    }
  }

  @Public()
  @Get('oidc/:provider/login')
  @Redirect()
  @ApiOperation({ summary: 'Initiate Google OAuth/OIDC sign-in' })
  @ApiParam({ name: 'provider', enum: ['google'], example: 'google' })
  @ApiQuery({
    name: 'redirectTo',
    required: false,
    description: 'Optional relative path to redirect to after sign-in',
  })
  @ApiFoundResponse({ description: 'Redirects browser to Google sign-in' })
  login(
    @Param('provider') provider: string,
    @Query('redirectTo') redirectTo?: string,
  ) {
    return this.oidcService.start(provider, { redirectTo });
  }

  @Public()
  @Get('oidc/:provider/callback')
  @Redirect()
  @ApiOperation({ summary: 'Handle Google OAuth/OIDC callback' })
  @ApiParam({ name: 'provider', enum: ['google'], example: 'google' })
  @ApiFoundResponse({
    description: 'Completes sign-in and redirects to /auth/token',
  })
  callback(
    @Param('provider') provider: string,
    @Query() query: Record<string, string>,
  ) {
    return this.oidcService.finish(provider, query);
  }

  @Get('token')
  @Authenticate({ providers: [SessionCookieProvider] })
  @ApiOperation({
    summary:
      'Issue Bearer JWT access and refresh tokens for the Google-authenticated browser session',
  })
  @ApiOkResponse({ type: AccessTokenResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Sign in via GET /auth/oidc/google/login first',
  })
  issueToken(@CurrentUser() user: User): Promise<AccessTokenResponseDto> {
    return this.authService.issueAccessToken(user);
  }

  @Get('me')
  @Authenticate({ providers: [JwtBearerProvider] })
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Return the currently authenticated user (Bearer token)',
  })
  @ApiOkResponse({ type: AuthUserDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  me(@CurrentUser() user: User): AuthUserDto {
    return this.authService.toPublicUser(user);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Revoke a refresh token family (body or HttpOnly cookie) and clear any active browser session',
  })
  @ApiNoContentResponse({ description: 'Tokens revoked and session cleared' })
  async logout(
    @Body() body?: LogoutDto,
    @Headers('cookie') cookieHeader?: string,
    @Headers('x-auth-transport') transport?: string,
    @Res({ passthrough: true }) res?: Response,
  ): Promise<void> {
    const cookieToken = readCookieValue(
      cookieHeader,
      REFRESH_TOKEN_COOKIE_NAME,
    );
    const refreshToken = body?.refreshToken ?? cookieToken;

    if (refreshToken) {
      await this.authService.revokeRefreshToken(refreshToken);
    }

    if (
      (cookieToken !== undefined || this.isCookieTransport(transport)) &&
      res
    ) {
      res.append(
        'Set-Cookie',
        serializeClearRefreshTokenCookie(this.secureCookies),
      );
    }

    await this.signInService.signOut();
  }

  private isCookieTransport(transport?: string): boolean {
    return transport?.trim().toLowerCase() === 'cookie';
  }

  private formatTokenResponse(
    issued: IssuedAuthTokens,
    transport: string | undefined,
    res: Response | undefined,
  ): AccessTokenResponseDto {
    if (this.isCookieTransport(transport)) {
      res?.append(
        'Set-Cookie',
        serializeRefreshTokenCookie(issued.refreshToken, this.secureCookies),
      );
      return {
        accessToken: issued.accessToken,
        expiresIn: issued.expiresIn,
        user: issued.user,
      };
    }

    return issued;
  }
}

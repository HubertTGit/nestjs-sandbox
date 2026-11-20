import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Redirect,
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
import {
  ApiBearerAuth,
  ApiFoundResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { User } from '../database/schema.js';
import { AccessTokenResponseDto, AuthUserDto } from './auth.dto.js';
import { AuthService } from './auth.service.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly oidcService: OidcService,
    private readonly signInService: SignInService,
    private readonly authService: AuthService,
  ) {}

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
      'Issue a Bearer JWT access token for the Google-authenticated session',
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

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Authenticate({ providers: [SessionCookieProvider] })
  @ApiOperation({ summary: 'End the current browser OAuth session' })
  @ApiNoContentResponse({ description: 'Session cleared' })
  @ApiUnauthorizedResponse({ description: 'No active session' })
  async logout(): Promise<void> {
    await this.signInService.signOut();
  }
}

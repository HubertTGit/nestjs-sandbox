import { Injectable } from '@nestjs/common';
import {
  AuthenticationRegistry,
  type OAuthTokens,
  OidcAccountResolver,
  type OidcProfile,
  type OidcResolveContext,
} from '@nestjs/authentication';
import { AuthService } from './auth.service.js';

@Injectable()
export class GoogleOidcResolver extends OidcAccountResolver {
  constructor(
    private readonly authService: AuthService,
    registry: AuthenticationRegistry,
  ) {
    super();
    registry.registerHandler('oidc', this);
  }

  async resolveUser(
    profile: OidcProfile,
    _tokens: OAuthTokens,
    _context: OidcResolveContext,
  ): Promise<{ id: string } | null> {
    if (profile.provider !== 'google') {
      return null;
    }

    const user = await this.authService.upsertGoogleUser(profile);
    return user ? { id: String(user.id) } : null;
  }
}

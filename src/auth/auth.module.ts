import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { DrizzleRefreshTokenStore } from './drizzle-refresh-token.store.js';
import { GoogleIdTokenVerifier } from './google-id-token.verifier.js';
import { GoogleOidcResolver } from './google-oidc.resolver.js';
import { JwtAuthProvider } from './jwt-auth.provider.js';
import { SessionAuthProvider } from './session-auth.provider.js';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    DrizzleRefreshTokenStore,
    GoogleIdTokenVerifier,
    GoogleOidcResolver,
    JwtAuthProvider,
    SessionAuthProvider,
  ],
  exports: [AuthService],
})
export class AuthModule {}

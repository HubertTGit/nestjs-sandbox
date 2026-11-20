import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { GoogleOidcResolver } from './google-oidc.resolver.js';
import { JwtAuthProvider } from './jwt-auth.provider.js';
import { SessionAuthProvider } from './session-auth.provider.js';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    GoogleOidcResolver,
    JwtAuthProvider,
    SessionAuthProvider,
  ],
  exports: [AuthService],
})
export class AuthModule {}

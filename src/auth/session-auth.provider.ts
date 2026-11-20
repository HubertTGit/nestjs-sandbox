import { Injectable } from '@nestjs/common';
import {
  AuthenticationRegistry,
  SessionCookieProvider,
  type SessionRecord,
} from '@nestjs/authentication';
import type { User } from '../database/schema.js';
import { AuthService } from './auth.service.js';

@Injectable()
export class SessionAuthProvider extends SessionCookieProvider<User> {
  constructor(
    private readonly authService: AuthService,
    registry: AuthenticationRegistry,
  ) {
    super();
    registry.registerProvider(this, { order: 1 });
  }

  validate(session: SessionRecord): Promise<User | null> {
    return this.authService.findUserById(session.userId);
  }
}

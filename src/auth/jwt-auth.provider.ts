import { Injectable } from '@nestjs/common';
import {
  AuthenticationRegistry,
  JwtBearerProvider,
  type JwtClaims,
} from '@nestjs/authentication';
import type { User } from '../database/schema.js';
import { AuthService } from './auth.service.js';

@Injectable()
export class JwtAuthProvider extends JwtBearerProvider<User> {
  constructor(
    private readonly authService: AuthService,
    registry: AuthenticationRegistry,
  ) {
    super();
    registry.registerProvider(this, { order: 0 });
  }

  validate({ sub }: JwtClaims): Promise<User | null> {
    return sub ? this.authService.findUserById(sub) : Promise.resolve(null);
  }
}

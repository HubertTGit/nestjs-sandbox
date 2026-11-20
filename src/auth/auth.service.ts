import { Injectable } from '@nestjs/common';
import { type OidcProfile, TokenService } from '@nestjs/authentication';
import { InjectDrizzle } from '@nestjs/drizzle';
import { eq } from 'drizzle-orm';
import { type Database, type User, users } from '../database/schema.js';
import type { AccessTokenResponseDto, AuthUserDto } from './auth.dto.js';
import './auth.types.js';

@Injectable()
export class AuthService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly tokenService: TokenService,
  ) {}

  async findUserById(id: string | number): Promise<User | null> {
    const userId = typeof id === 'number' ? id : Number(id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return null;
    }

    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    return user ?? null;
  }

  async upsertGoogleUser(profile: OidcProfile): Promise<User | null> {
    if (!profile.email || !profile.emailVerified) {
      return null;
    }

    const [user] = await this.db
      .insert(users)
      .values({
        googleSub: profile.subject,
        email: profile.email,
        name: profile.name ?? null,
      })
      .onConflictDoUpdate({
        target: users.googleSub,
        set: {
          email: profile.email,
          name: profile.name ?? null,
        },
      })
      .returning();

    return user ?? null;
  }

  toPublicUser(user: User): AuthUserDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
    };
  }

  async issueAccessToken(user: User): Promise<AccessTokenResponseDto> {
    const { accessToken, expiresIn } = await this.tokenService.issue(
      String(user.id),
      {
        method: 'oidc:google',
        claims: { email: user.email },
      },
    );

    return {
      accessToken,
      expiresIn,
      user: this.toPublicUser(user),
    };
  }
}

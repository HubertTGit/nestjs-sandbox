import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { TokenService } from '@nestjs/authentication';
import { InjectDrizzle } from '@nestjs/drizzle';
import { eq } from 'drizzle-orm';
import { type Database, type User, users } from '../database/schema.js';
import type { AccessTokenResponseDto, AuthUserDto } from './auth.dto.js';
import './auth.types.js';
import { GoogleIdTokenVerifier } from './google-id-token.verifier.js';

export interface GoogleUserIdentity {
  subject: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
}

export interface IssuedAuthTokens extends AccessTokenResponseDto {
  refreshToken: string;
}

function extractSubjectFromJwt(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8'),
    ) as { sub?: unknown };
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

@Injectable()
export class AuthService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly tokenService: TokenService,
    private readonly googleIdTokenVerifier: GoogleIdTokenVerifier,
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

  async upsertGoogleUser(profile: GoogleUserIdentity): Promise<User | null> {
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

  async issueAccessToken(
    user: User,
    method = 'oidc:google',
  ): Promise<IssuedAuthTokens> {
    const { accessToken, refreshToken, expiresIn } =
      await this.tokenService.issue(String(user.id), {
        method,
        claims: { email: user.email },
      });

    return {
      accessToken,
      refreshToken,
      expiresIn,
      user: this.toPublicUser(user),
    };
  }

  async authenticateWithGoogleIdToken(
    idToken: unknown,
  ): Promise<IssuedAuthTokens> {
    if (typeof idToken !== 'string' || idToken.trim().length === 0) {
      throw new BadRequestException('idToken must be a non-empty string');
    }

    const identity = await this.googleIdTokenVerifier.verify(idToken.trim());
    const user = await this.upsertGoogleUser(identity);
    if (!user) {
      throw new UnauthorizedException('Unable to authenticate Google user');
    }

    return this.issueAccessToken(user, 'google:id_token');
  }

  async refreshTokens(refreshToken: unknown): Promise<IssuedAuthTokens> {
    if (typeof refreshToken !== 'string' || refreshToken.trim().length === 0) {
      throw new UnauthorizedException('Missing refresh token');
    }

    const {
      accessToken,
      refreshToken: nextRefreshToken,
      expiresIn,
    } = await this.tokenService.refresh(refreshToken.trim());

    const subject = extractSubjectFromJwt(accessToken);
    const user = subject ? await this.findUserById(subject) : null;
    if (!user) {
      await this.tokenService.revoke(nextRefreshToken);
      throw new UnauthorizedException('User not found');
    }

    return {
      accessToken,
      refreshToken: nextRefreshToken,
      expiresIn,
      user: this.toPublicUser(user),
    };
  }

  async revokeRefreshToken(refreshToken: unknown): Promise<boolean> {
    if (typeof refreshToken !== 'string' || refreshToken.trim().length === 0) {
      return false;
    }

    return this.tokenService.revoke(refreshToken.trim());
  }
}

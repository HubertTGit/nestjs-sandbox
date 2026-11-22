import { JwksClient, JwtError, JwtVerifier } from '@nestjs/authentication';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const GOOGLE_JWKS_URI = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_HTTPS_ISSUER = 'https://accounts.google.com';
const GOOGLE_LEGACY_ISSUER = 'accounts.google.com';

export interface VerifiedGoogleIdentity {
  subject: string;
  email: string;
  emailVerified: boolean;
  name?: string;
}

function readUnverifiedIssuer(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) {
    return null;
  }

  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload = JSON.parse(json) as { iss?: unknown };
    return typeof payload.iss === 'string' ? payload.iss : null;
  } catch {
    return null;
  }
}

export function parseGoogleAudiences(
  primaryClientId: string,
  additionalClientIds?: string,
): string[] {
  const values = [
    primaryClientId,
    ...(additionalClientIds ? additionalClientIds.split(',') : []),
  ]
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return [...new Set(values)];
}

@Injectable()
export class GoogleIdTokenVerifier {
  private readonly httpsVerifier: JwtVerifier;
  private readonly legacyVerifier: JwtVerifier;

  constructor(config: ConfigService) {
    const audiences = parseGoogleAudiences(
      config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      config.get<string>('GOOGLE_ALLOWED_CLIENT_IDS'),
    );

    const jwks = new JwksClient(GOOGLE_JWKS_URI, {
      cacheTtl: '10m',
      cooldown: '30s',
    });

    this.httpsVerifier = new JwtVerifier({
      jwks,
      issuer: GOOGLE_HTTPS_ISSUER,
      audience: audiences,
      algorithms: ['RS256'],
      clockTolerance: '30s',
      required: ['sub', 'email'],
    });

    this.legacyVerifier = new JwtVerifier({
      jwks,
      issuer: GOOGLE_LEGACY_ISSUER,
      audience: audiences,
      algorithms: ['RS256'],
      clockTolerance: '30s',
      required: ['sub', 'email'],
    });
  }

  async verify(idToken: string): Promise<VerifiedGoogleIdentity> {
    const issuer = readUnverifiedIssuer(idToken);
    if (issuer !== GOOGLE_HTTPS_ISSUER && issuer !== GOOGLE_LEGACY_ISSUER) {
      throw new UnauthorizedException('Invalid Google ID token');
    }

    const verifier =
      issuer === GOOGLE_HTTPS_ISSUER ? this.httpsVerifier : this.legacyVerifier;

    let claims: Record<string, unknown>;
    try {
      claims = await verifier.verify(idToken);
    } catch (error) {
      if (error instanceof JwtError) {
        throw new UnauthorizedException('Invalid Google ID token');
      }
      throw error;
    }

    const subject = typeof claims.sub === 'string' ? claims.sub : '';
    const email = typeof claims.email === 'string' ? claims.email : '';
    const emailVerified = claims.email_verified === true;
    const name = typeof claims.name === 'string' ? claims.name : undefined;

    if (!subject || !email) {
      throw new UnauthorizedException('Invalid Google ID token');
    }

    if (!emailVerified) {
      throw new UnauthorizedException('Google account email is not verified');
    }

    return {
      subject,
      email,
      emailVerified,
      ...(name !== undefined ? { name } : {}),
    };
  }
}

import { generateKeyPairSync } from 'node:crypto';
import { JwtSigner } from '@nestjs/authentication';
import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  GoogleIdTokenVerifier,
  parseGoogleAudiences,
} from './google-id-token.verifier.js';

describe('GoogleIdTokenVerifier', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const publicJwk = {
    ...publicKey.export({ format: 'jwk' }),
    kid: 'google-test-key-1',
    use: 'sig',
    alg: 'RS256',
  };

  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let verifier: GoogleIdTokenVerifier;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ keys: [publicJwk] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const mockConfig = {
      getOrThrow: vi.fn((key: string) => {
        if (key === 'GOOGLE_CLIENT_ID') {
          return 'web-client-id.apps.googleusercontent.com';
        }
        throw new Error(`Unexpected key: ${key}`);
      }),
      get: vi.fn((key: string) => {
        if (key === 'GOOGLE_ALLOWED_CLIENT_IDS') {
          return 'android-client-id.apps.googleusercontent.com, ios-client-id.apps.googleusercontent.com';
        }
        return undefined;
      }),
    } as unknown as ConfigService;

    verifier = new GoogleIdTokenVerifier(mockConfig);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('deduplicates and trims configured Google audiences', () => {
    expect(
      parseGoogleAudiences(' web-id ', 'android-id, web-id, , ios-id '),
    ).toEqual(['web-id', 'android-id', 'ios-id']);
  });

  it('verifies a valid Google ID token with https issuer across configured audiences', async () => {
    const signer = new JwtSigner({
      key: privateKey,
      alg: 'RS256',
      kid: 'google-test-key-1',
      issuer: 'https://accounts.google.com',
      audience: 'android-client-id.apps.googleusercontent.com',
      ttl: '5m',
    });

    const idToken = signer.sign({
      sub: 'google-sub-999',
      email: 'alice@gmail.com',
      email_verified: true,
      name: 'Alice Smith',
    });

    await expect(verifier.verify(idToken)).resolves.toEqual({
      subject: 'google-sub-999',
      email: 'alice@gmail.com',
      emailVerified: true,
      name: 'Alice Smith',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('verifies a valid Google ID token with legacy accounts.google.com issuer', async () => {
    const signer = new JwtSigner({
      key: privateKey,
      alg: 'RS256',
      kid: 'google-test-key-1',
      issuer: 'accounts.google.com',
      audience: 'web-client-id.apps.googleusercontent.com',
      ttl: '5m',
    });

    const idToken = signer.sign({
      sub: 'google-sub-legacy',
      email: 'bob@gmail.com',
      email_verified: true,
    });

    await expect(verifier.verify(idToken)).resolves.toEqual({
      subject: 'google-sub-legacy',
      email: 'bob@gmail.com',
      emailVerified: true,
    });
  });

  it('rejects unverified Google email', async () => {
    const signer = new JwtSigner({
      key: privateKey,
      alg: 'RS256',
      kid: 'google-test-key-1',
      issuer: 'https://accounts.google.com',
      audience: 'web-client-id.apps.googleusercontent.com',
      ttl: '5m',
    });

    const idToken = signer.sign({
      sub: 'google-sub-unverified',
      email: 'alice@gmail.com',
      email_verified: false,
    });

    await expect(verifier.verify(idToken)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects tokens with untrusted issuer, wrong audience, or malformed structure', async () => {
    const wrongIssuerSigner = new JwtSigner({
      key: privateKey,
      alg: 'RS256',
      kid: 'google-test-key-1',
      issuer: 'https://evil.example.com',
      audience: 'web-client-id.apps.googleusercontent.com',
      ttl: '5m',
    });

    const wrongAudienceSigner = new JwtSigner({
      key: privateKey,
      alg: 'RS256',
      kid: 'google-test-key-1',
      issuer: 'https://accounts.google.com',
      audience: 'some-other-app-client-id',
      ttl: '5m',
    });

    await expect(verifier.verify('not-a-jwt')).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(
      verifier.verify(
        wrongIssuerSigner.sign({
          sub: '1',
          email: 'a@b.com',
          email_verified: true,
        }),
      ),
    ).rejects.toThrow(UnauthorizedException);
    await expect(
      verifier.verify(
        wrongAudienceSigner.sign({
          sub: '1',
          email: 'a@b.com',
          email_verified: true,
        }),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });
});

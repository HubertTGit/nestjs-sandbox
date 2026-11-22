export const REFRESH_TOKEN_COOKIE_NAME = 'refresh_token';
export const REFRESH_TOKEN_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function readCookieValue(
  cookieHeader: string | undefined,
  name: string,
): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  for (const part of cookieHeader.split(';')) {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = part.slice(0, separatorIndex).trim();
    if (key !== name) {
      continue;
    }

    const rawValue = part.slice(separatorIndex + 1).trim();
    if (!rawValue) {
      return undefined;
    }

    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }

  return undefined;
}

export function serializeRefreshTokenCookie(
  token: string,
  secure: boolean,
): string {
  const parts = [
    `${REFRESH_TOKEN_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/auth',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${REFRESH_TOKEN_COOKIE_MAX_AGE_SECONDS}`,
  ];

  if (secure) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

export function serializeClearRefreshTokenCookie(secure: boolean): string {
  const parts = [
    `${REFRESH_TOKEN_COOKIE_NAME}=`,
    'Path=/auth',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];

  if (secure) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AuthUserDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'alice@gmail.com' })
  email: string;

  @ApiPropertyOptional({ example: 'Alice Smith', nullable: true })
  name: string | null;
}

export class GoogleAuthDto {
  @ApiProperty({
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6Ij...',
    description:
      'Google ID token obtained from Google Identity Services (Web), Credential Manager (Android), or Google Sign-In SDK (iOS)',
  })
  idToken: string;
}

export class RefreshTokenDto {
  @ApiPropertyOptional({
    example: 'rt_opaque_single_use_token...',
    description:
      'Opaque single-use refresh token. Required for JSON body transport; omitted when using HttpOnly cookie transport (X-Auth-Transport: cookie).',
  })
  refreshToken?: string;
}

export class LogoutDto {
  @ApiPropertyOptional({
    example: 'rt_opaque_single_use_token...',
    description:
      'Refresh token to revoke. Optional when revoking via the refresh_token HttpOnly cookie or browser session cookie.',
  })
  refreshToken?: string;
}

export class AccessTokenResponseDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description:
      'Short-lived JWT access token for Authorization: Bearer header',
  })
  accessToken: string;

  @ApiPropertyOptional({
    example: 'rt_opaque_single_use_token...',
    description:
      'Opaque rotating refresh token. Present for default JSON transport (Android, iOS, cross-site Web); omitted when delivered via HttpOnly cookie (X-Auth-Transport: cookie).',
  })
  refreshToken?: string;

  @ApiProperty({
    example: 900,
    description: 'Access token lifetime in seconds',
  })
  expiresIn: number;

  @ApiProperty({ type: AuthUserDto })
  user: AuthUserDto;
}

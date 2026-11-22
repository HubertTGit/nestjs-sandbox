import {
  AuthenticationStorage,
  type RefreshTokenRecord,
  type RefreshTokenStore,
} from '@nestjs/authentication';
import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq, inArray, isNull, lt, ne } from 'drizzle-orm';
import {
  type Database,
  refreshTokens,
  revokedRefreshTokenFamilies,
} from '../database/schema.js';

@Injectable()
export class DrizzleRefreshTokenStore implements RefreshTokenStore {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    storage: AuthenticationStorage,
  ) {
    storage.registerSource({ refreshTokens: this });
  }

  async getRefreshToken(id: string): Promise<RefreshTokenRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.id, id))
      .limit(1);

    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      familyId: row.familyId,
      userId: row.userId,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      familyExpiresAt: row.familyExpiresAt,
      ...(row.usedAt ? { usedAt: row.usedAt } : {}),
      ...(row.claims != null ? { claims: row.claims } : {}),
    };
  }

  async saveRefreshToken(record: RefreshTokenRecord): Promise<void> {
    await this.db.insert(refreshTokens).values({
      id: record.id,
      familyId: record.familyId,
      userId: record.userId,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      familyExpiresAt: record.familyExpiresAt,
      usedAt: record.usedAt ?? null,
      claims: record.claims ?? null,
    });

    const expired = await this.db
      .delete(refreshTokens)
      .where(
        and(
          lt(refreshTokens.familyExpiresAt, record.createdAt),
          ne(refreshTokens.id, record.id),
        ),
      )
      .returning({ familyId: refreshTokens.familyId });

    if (expired.length > 0) {
      const expiredFamilyIds = [...new Set(expired.map((row) => row.familyId))];
      await this.db
        .delete(revokedRefreshTokenFamilies)
        .where(inArray(revokedRefreshTokenFamilies.familyId, expiredFamilyIds));
    }
  }

  async markRefreshTokenUsed(id: string, at: Date): Promise<boolean> {
    const updated = await this.db
      .update(refreshTokens)
      .set({ usedAt: at })
      .where(and(eq(refreshTokens.id, id), isNull(refreshTokens.usedAt)))
      .returning({ id: refreshTokens.id });

    return updated.length > 0;
  }

  async revokeRefreshTokenFamily(familyId: string): Promise<void> {
    await this.db
      .insert(revokedRefreshTokenFamilies)
      .values({ familyId })
      .onConflictDoNothing();
  }

  async isRefreshTokenFamilyRevoked(familyId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ familyId: revokedRefreshTokenFamilies.familyId })
      .from(revokedRefreshTokenFamilies)
      .where(eq(revokedRefreshTokenFamilies.familyId, familyId))
      .limit(1);

    return row !== undefined;
  }

  async revokeUserRefreshTokens(userId: string): Promise<void> {
    const families = await this.db
      .selectDistinct({ familyId: refreshTokens.familyId })
      .from(refreshTokens)
      .where(eq(refreshTokens.userId, userId));

    if (families.length === 0) {
      return;
    }

    await this.db
      .insert(revokedRefreshTokenFamilies)
      .values(families.map(({ familyId }) => ({ familyId })))
      .onConflictDoNothing();
  }
}

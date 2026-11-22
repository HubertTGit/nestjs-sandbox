import { AuthenticationStorage } from '@nestjs/authentication';
import type { Database } from '../database/schema.js';
import { DrizzleRefreshTokenStore } from './drizzle-refresh-token.store.js';

describe('DrizzleRefreshTokenStore', () => {
  const createdAt = new Date('2026-11-21T10:00:00.000Z');
  const expiresAt = new Date('2026-12-21T10:00:00.000Z');
  const familyExpiresAt = new Date('2027-02-19T10:00:00.000Z');

  it('registers itself with AuthenticationStorage and omits null optional fields', async () => {
    const limitMock = vi.fn().mockResolvedValueOnce([
      {
        id: 'hash-1',
        familyId: 'fam-1',
        userId: '42',
        createdAt,
        expiresAt,
        familyExpiresAt,
        usedAt: null,
        claims: null,
      },
    ]);

    const mockDb = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: limitMock,
          })),
        })),
      })),
    } as unknown as Database;

    const storage = new AuthenticationStorage();
    const store = new DrizzleRefreshTokenStore(mockDb, storage);

    expect(storage.refreshTokens).toBe(store);

    const record = await store.getRefreshToken('hash-1');
    expect(record).toEqual({
      id: 'hash-1',
      familyId: 'fam-1',
      userId: '42',
      createdAt,
      expiresAt,
      familyExpiresAt,
    });
    expect(record && 'usedAt' in record).toBe(false);
    expect(record && 'claims' in record).toBe(false);
  });

  it('marks token used atomically and returns whether a row was updated', async () => {
    const returningMock = vi
      .fn()
      .mockResolvedValueOnce([{ id: 'hash-1' }])
      .mockResolvedValueOnce([]);

    const mockDb = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: returningMock,
          })),
        })),
      })),
    } as unknown as Database;

    const store = new DrizzleRefreshTokenStore(
      mockDb,
      new AuthenticationStorage(),
    );

    await expect(store.markRefreshTokenUsed('hash-1', createdAt)).resolves.toBe(
      true,
    );
    await expect(store.markRefreshTokenUsed('hash-1', createdAt)).resolves.toBe(
      false,
    );
  });

  it('revokes all existing families for a user without erroring when none exist', async () => {
    const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    const valuesMock = vi.fn(() => ({ onConflictDoNothing }));
    const whereMock = vi
      .fn()
      .mockResolvedValueOnce([{ familyId: 'fam-1' }, { familyId: 'fam-2' }])
      .mockResolvedValueOnce([]);

    const mockDb = {
      selectDistinct: vi.fn(() => ({
        from: vi.fn(() => ({
          where: whereMock,
        })),
      })),
      insert: vi.fn(() => ({
        values: valuesMock,
      })),
    } as unknown as Database;

    const store = new DrizzleRefreshTokenStore(
      mockDb,
      new AuthenticationStorage(),
    );

    await store.revokeUserRefreshTokens('42');
    expect(valuesMock).toHaveBeenCalledWith([
      { familyId: 'fam-1' },
      { familyId: 'fam-2' },
    ]);
    expect(onConflictDoNothing).toHaveBeenCalledTimes(1);

    await store.revokeUserRefreshTokens('99');
    expect(valuesMock).toHaveBeenCalledTimes(1);
  });
});

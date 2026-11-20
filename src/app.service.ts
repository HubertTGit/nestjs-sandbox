import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { sql } from 'drizzle-orm';
import type { Database } from './database/schema.js';

@Injectable()
export class AppService {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  getHello(): string {
    return 'Hello World!';
  }

  async checkDatabase(): Promise<{ status: 'ok' }> {
    await this.db.execute(sql`SELECT 1`);
    return { status: 'ok' };
  }
}

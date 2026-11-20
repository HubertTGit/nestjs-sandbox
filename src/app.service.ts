import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { asc, eq, sql } from 'drizzle-orm';
import { type Database, type Todo, todos } from './database/schema.js';

export interface CreateTodoDto {
  task: string;
  isCompleted?: boolean;
}

export interface UpdateTodoDto {
  task?: string;
  isCompleted?: boolean;
}

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

  async createTodo(dto: CreateTodoDto): Promise<Todo> {
    if (typeof dto?.task !== 'string' || dto.task.trim() === '') {
      throw new BadRequestException('task must be a non-empty string');
    }
    if (dto.isCompleted !== undefined && typeof dto.isCompleted !== 'boolean') {
      throw new BadRequestException('isCompleted must be a boolean');
    }

    const [created] = await this.db
      .insert(todos)
      .values({
        task: dto.task.trim(),
        ...(dto.isCompleted !== undefined
          ? { isCompleted: dto.isCompleted }
          : {}),
      })
      .returning();

    return created;
  }

  async findAllTodos(): Promise<Todo[]> {
    return this.db.select().from(todos).orderBy(asc(todos.id));
  }

  async findTodoById(id: number): Promise<Todo> {
    const [todo] = await this.db.select().from(todos).where(eq(todos.id, id));
    if (!todo) {
      throw new NotFoundException(`Todo #${id} not found`);
    }
    return todo;
  }

  async updateTodo(id: number, dto: UpdateTodoDto): Promise<Todo> {
    const updates: Partial<{ task: string; isCompleted: boolean }> = {};

    if (dto?.task !== undefined) {
      if (typeof dto.task !== 'string' || dto.task.trim() === '') {
        throw new BadRequestException('task must be a non-empty string');
      }
      updates.task = dto.task.trim();
    }

    if (dto?.isCompleted !== undefined) {
      if (typeof dto.isCompleted !== 'boolean') {
        throw new BadRequestException('isCompleted must be a boolean');
      }
      updates.isCompleted = dto.isCompleted;
    }

    if (Object.keys(updates).length === 0) {
      throw new BadRequestException(
        'At least one of task or isCompleted must be provided',
      );
    }

    const [updated] = await this.db
      .update(todos)
      .set(updates)
      .where(eq(todos.id, id))
      .returning();

    if (!updated) {
      throw new NotFoundException(`Todo #${id} not found`);
    }

    return updated;
  }

  async deleteTodo(id: number): Promise<void> {
    const [deleted] = await this.db
      .delete(todos)
      .where(eq(todos.id, id))
      .returning({ id: todos.id });

    if (!deleted) {
      throw new NotFoundException(`Todo #${id} not found`);
    }
  }
}

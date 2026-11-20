import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { asc, eq } from 'drizzle-orm';
import { type Database, type Todo, todos } from '../database/schema.js';
import type { CreateTodoDto, UpdateTodoDto } from './todo.dto.js';

@Injectable()
export class TodosService {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  async create(dto: CreateTodoDto): Promise<Todo> {
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

  async findAll(): Promise<Todo[]> {
    return this.db.select().from(todos).orderBy(asc(todos.id));
  }

  async findOne(id: number): Promise<Todo> {
    const [todo] = await this.db.select().from(todos).where(eq(todos.id, id));
    if (!todo) {
      throw new NotFoundException(`Todo #${id} not found`);
    }
    return todo;
  }

  async update(id: number, dto: UpdateTodoDto): Promise<Todo> {
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

  async remove(id: number): Promise<void> {
    const [deleted] = await this.db
      .delete(todos)
      .where(eq(todos.id, id))
      .returning({ id: todos.id });

    if (!deleted) {
      throw new NotFoundException(`Todo #${id} not found`);
    }
  }
}

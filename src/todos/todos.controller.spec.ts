import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getDrizzleToken } from '@nestjs/drizzle';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test, TestingModule } from '@nestjs/testing';
import type { Todo } from '../database/schema.js';
import { TodosController } from './todos.controller.js';
import { TodosService } from './todos.service.js';

describe('TodosController', () => {
  let app: TestingModule;
  let todosController: TodosController;

  const sampleTodo: Todo = {
    id: 1,
    task: 'Buy milk',
    isCompleted: false,
    createdAt: new Date('2026-11-20T07:00:00.000Z'),
    updatedAt: new Date('2026-11-20T07:00:00.000Z'),
  };

  let returningMock: ReturnType<typeof vi.fn>;
  let whereMock: ReturnType<typeof vi.fn>;
  let orderByMock: ReturnType<typeof vi.fn>;
  let mockDb: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    returningMock = vi.fn();
    whereMock = vi.fn();
    orderByMock = vi.fn();

    mockDb = {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: returningMock,
        })),
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          orderBy: orderByMock,
          where: whereMock,
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: returningMock,
          })),
        })),
      })),
      delete: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: returningMock,
        })),
      })),
    };

    app = await Test.createTestingModule({
      controllers: [TodosController],
      providers: [
        TodosService,
        {
          provide: getDrizzleToken(),
          useValue: mockDb,
        },
      ],
    }).compile();

    todosController = app.get<TodosController>(TodosController);
  });

  it('creates a todo', async () => {
    returningMock.mockResolvedValueOnce([sampleTodo]);

    await expect(
      todosController.create({ task: '  Buy milk  ' }),
    ).resolves.toEqual(sampleTodo);
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
  });

  it('rejects creating a todo with empty task', async () => {
    await expect(todosController.create({ task: '   ' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('lists all todos', async () => {
    orderByMock.mockResolvedValueOnce([sampleTodo]);

    await expect(todosController.findAll()).resolves.toEqual([sampleTodo]);
  });

  it('gets a todo by id', async () => {
    whereMock.mockResolvedValueOnce([sampleTodo]);

    await expect(todosController.findOne(1)).resolves.toEqual(sampleTodo);
  });

  it('throws NotFoundException when todo does not exist', async () => {
    whereMock.mockResolvedValueOnce([]);

    await expect(todosController.findOne(999)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('updates a todo', async () => {
    const updated: Todo = { ...sampleTodo, isCompleted: true };
    returningMock.mockResolvedValueOnce([updated]);

    await expect(
      todosController.update(1, { isCompleted: true }),
    ).resolves.toEqual(updated);
  });

  it('rejects empty update payload', async () => {
    await expect(todosController.update(1, {})).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws NotFoundException when updating missing todo', async () => {
    returningMock.mockResolvedValueOnce([]);

    await expect(
      todosController.update(999, { isCompleted: true }),
    ).rejects.toThrow(NotFoundException);
  });

  it('deletes a todo', async () => {
    returningMock.mockResolvedValueOnce([{ id: 1 }]);

    await expect(todosController.remove(1)).resolves.toBeUndefined();
  });

  it('throws NotFoundException when deleting missing todo', async () => {
    returningMock.mockResolvedValueOnce([]);

    await expect(todosController.remove(999)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('exposes todos endpoints and DTO schemas in OpenAPI document', async () => {
    const nestApp = app.createNestApplication();
    const config = new DocumentBuilder()
      .setTitle('NestJS Sandbox API')
      .setVersion('1.0')
      .build();
    const document = SwaggerModule.createDocument(nestApp, config);

    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining(['/todos', '/todos/{id}']),
    );
    expect(document.components?.schemas).toHaveProperty('CreateTodoDto');
    expect(document.components?.schemas).toHaveProperty('UpdateTodoDto');
    expect(document.components?.schemas).toHaveProperty('TodoDto');

    await nestApp.close();
  });
});

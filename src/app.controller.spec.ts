import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getDrizzleToken } from '@nestjs/drizzle';
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import type { Todo } from './database/schema.js';

describe('AppController', () => {
  let appController: AppController;

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
      execute: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
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

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: getDrizzleToken(),
          useValue: mockDb,
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('health', () => {
    it('should return ok when database responds', async () => {
      await expect(appController.checkHealth()).resolves.toEqual({
        status: 'ok',
      });
      expect(mockDb.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('todos CRUD', () => {
    it('creates a todo', async () => {
      returningMock.mockResolvedValueOnce([sampleTodo]);

      await expect(
        appController.createTodo({ task: '  Buy milk  ' }),
      ).resolves.toEqual(sampleTodo);
      expect(mockDb.insert).toHaveBeenCalledTimes(1);
    });

    it('rejects creating a todo with empty task', async () => {
      await expect(appController.createTodo({ task: '   ' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('lists all todos', async () => {
      orderByMock.mockResolvedValueOnce([sampleTodo]);

      await expect(appController.findAllTodos()).resolves.toEqual([sampleTodo]);
    });

    it('gets a todo by id', async () => {
      whereMock.mockResolvedValueOnce([sampleTodo]);

      await expect(appController.findTodoById(1)).resolves.toEqual(sampleTodo);
    });

    it('throws NotFoundException when todo does not exist', async () => {
      whereMock.mockResolvedValueOnce([]);

      await expect(appController.findTodoById(999)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('updates a todo', async () => {
      const updated: Todo = { ...sampleTodo, isCompleted: true };
      returningMock.mockResolvedValueOnce([updated]);

      await expect(
        appController.updateTodo(1, { isCompleted: true }),
      ).resolves.toEqual(updated);
    });

    it('rejects empty update payload', async () => {
      await expect(appController.updateTodo(1, {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException when updating missing todo', async () => {
      returningMock.mockResolvedValueOnce([]);

      await expect(
        appController.updateTodo(999, { isCompleted: true }),
      ).rejects.toThrow(NotFoundException);
    });

    it('deletes a todo', async () => {
      returningMock.mockResolvedValueOnce([{ id: 1 }]);

      await expect(appController.deleteTodo(1)).resolves.toBeUndefined();
    });

    it('throws NotFoundException when deleting missing todo', async () => {
      returningMock.mockResolvedValueOnce([]);

      await expect(appController.deleteTodo(999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

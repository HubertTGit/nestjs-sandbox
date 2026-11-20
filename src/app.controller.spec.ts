import { getDrizzleToken } from '@nestjs/drizzle';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

describe('AppController', () => {
  let app: TestingModule;
  let appController: AppController;
  const mockDb = {
    execute: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
  };

  beforeEach(async () => {
    mockDb.execute.mockClear();
    app = await Test.createTestingModule({
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

  describe('swagger', () => {
    it('exposes app endpoints in OpenAPI document', async () => {
      const nestApp = app.createNestApplication();
      const config = new DocumentBuilder()
        .setTitle('NestJS Sandbox API')
        .setVersion('1.0')
        .build();
      const document = SwaggerModule.createDocument(nestApp, config);

      expect(Object.keys(document.paths)).toEqual(
        expect.arrayContaining(['/', '/health']),
      );

      await nestApp.close();
    });
  });
});

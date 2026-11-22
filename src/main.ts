import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule, ObserveInstrument } from './app.module.js';
import { buildCorsOptions } from './cors.config.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    instrument: ObserveInstrument,
  });

  app.set('trust proxy', 1);
  app.enableShutdownHooks();

  const config = app.get(ConfigService);
  const corsOptions = buildCorsOptions(config.get<string>('CORS_ORIGINS'));
  if (corsOptions) {
    app.enableCors(corsOptions);
  }

  const swaggerConfig = new DocumentBuilder()
    .setTitle('NestJS Sandbox API')
    .setDescription('Todos CRUD API documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const documentFactory = () =>
    SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, documentFactory);

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import type { AppConfig } from './config/configuration';
import { getCorsOrigins } from './config/configuration';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const config = app.get(ConfigService) as ConfigService<AppConfig, true>;
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('api/v1');

  app.enableCors({
    origin: getCorsOrigins({
      NODE_ENV: config.get('NODE_ENV', { infer: true }),
      PORT: config.get('PORT', { infer: true }),
      DATABASE_URL: config.get('DATABASE_URL', { infer: true }),
      JWT_SECRET: config.get('JWT_SECRET', { infer: true }),
      JWT_ACCESS_TTL: config.get('JWT_ACCESS_TTL', { infer: true }),
      JWT_REFRESH_TTL: config.get('JWT_REFRESH_TTL', { infer: true }),
      CORS_ORIGINS: config.get('CORS_ORIGINS', { infer: true }),
    }),
    credentials: true,
  });

  // Validation pipe is per-controller via @UsePipes(new ZodValidationPipe(...))
  // We don't add a global one to avoid double validation.

  app.enableShutdownHooks();

  const port = config.get('PORT', { infer: true });
  await app.listen(port);

  logger.log(`🚀 API listening on http://localhost:${port}/api/v1`);
}

void bootstrap();

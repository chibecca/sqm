import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { loadConfig } from './config/configuration';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { ResponseEnvelopeInterceptor } from './common/response.interceptor';
import { RequestIdMiddleware } from './common/request-id.middleware';
import { PrismaModule } from './database/prisma.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { ParametersModule } from './parameters/parameters.module';
import { RecommendationsModule } from './recommendations/recommendations.module';
import { ProjectsModule } from './projects/projects.module';
import { ParameterSelectionsModule } from './parameter-selections/parameter-selections.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [loadConfig],
      validate: () => loadConfig(),
    }),
    ThrottlerModule.forRoot([
      // Generous default — tighten per-endpoint later
      { name: 'short', ttl: 1000, limit: 20 },     // 20 req/sec
      { name: 'long', ttl: 60_000, limit: 600 },   // 600 req/min
    ]),
    PrismaModule,
    AuthModule,
    ParametersModule,
    RecommendationsModule,
    ProjectsModule,
    ParameterSelectionsModule,
  ],
  providers: [
    // Global guards: throttle first, then JWT
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Global response envelope
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    // Global error filter
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}

import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Without this, Nest's onModuleDestroy hooks (e.g. PrismaService
  // disconnecting from PostgreSQL) never run on SIGINT/SIGTERM — the
  // process would just exit and leave the DB connection to be dropped by
  // the OS instead of closed cleanly.
  app.enableShutdownHooks();

  const configService = app.get(ConfigService);

  const port = configService.get<number>('app.port') ?? 3000;
  const frontendUrl =
    configService.get<string>('app.frontendUrl') ?? 'http://localhost:5173';

  // Every route in this API is served under /api. No URI version segment
  // (e.g. /api/v1) is used — every endpoint in the AttendHub spec is
  // written as /api/... with no version, so this keeps routes matching
  // the spec exactly.
  app.setGlobalPrefix('api');

  // CORS origin comes from FRONTEND_URL — never hardcoded — so the same
  // build works across local/dev/staging/prod just by changing the env.
  app.enableCors({
    origin: frontendUrl,
    credentials: true,
  });

  // Global request validation:
  // - whitelist: strips any property not declared on the DTO
  // - forbidNonWhitelisted: rejects the request instead of silently
  //   dropping unknown properties, so typos/attacks are surfaced
  // - transform: converts incoming plain JSON into real DTO class
  //   instances (and coerces primitive types, e.g. query string "2" -> 2)
  //   before it reaches controllers
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // AuthGuard + RolesGuard (auth.module.ts) and MonitoringInterceptor
  // (monitoring.module.ts) are registered globally via APP_GUARD /
  // APP_INTERCEPTOR tokens, not here — that lets Nest's DI container give
  // them the services/repositories they depend on.
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('AttendHub API')
    .setDescription('AttendHub backend REST API documentation')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'token' })
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  // setGlobalPrefix does not automatically apply to manually mounted
  // paths like Swagger, so the "api" prefix is included explicitly here.
  SwaggerModule.setup('api/docs', app, swaggerDocument);

  await app.listen(port);
}

bootstrap();

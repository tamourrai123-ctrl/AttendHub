import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.enableShutdownHooks();

  const configService = app.get(ConfigService);

  const port = configService.get<number>('app.port') ?? 3000;
  const frontendUrl =
    configService.get<string>('app.frontendUrl') ??
    'http://localhost:5173';

  app.setGlobalPrefix('api');

  app.enableCors({
    origin: frontendUrl,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('AttendHub API')
    .setDescription('AttendHub backend REST API documentation')
    .setVersion('1.0')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'token',
    })
    .build();

  typescript
const swaggerDocument = SwaggerModule.createDocument(
  app,
  swaggerConfig,
);

SwaggerModule.setup('api/docs', app, swaggerDocument, {
  useGlobalPrefix: false,
  jsonDocumentUrl: 'api/docs-json',
  customCssUrl:
    'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css',
  customJs: [
    'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js',
    'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-standalone-preset.js',
  ],
});


  await app.listen(port);
}

bootstrap();

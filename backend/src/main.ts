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

  // FRONTEND_URL may hold several comma-separated origins.
  const allowedOrigins = frontendUrl
    .split(',')
    .map((o: string) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
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

const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);

  // Swagger UI is served as a self-contained HTML page that loads its JS/CSS
  // from a CDN. On Vercel (serverless) swagger-ui-express's own static files
  // (swagger-ui-init.js etc.) don't resolve, which shows a blank page — this
  // version needs no static files from the server at all.
  const http = app.getHttpAdapter().getInstance();
  http.get('/api/docs-json', (_req: unknown, res: any) => res.json(swaggerDocument));
  http.get(['/api/docs', '/api/docs/'], (_req: unknown, res: any) => {
    res.type('html').send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>AttendHub API Docs</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: '/api/docs-json',
      dom_id: '#swagger-ui',
      persistAuthorization: true,
    });
  </script>
</body>
</html>`);
  });

  await app.listen(port);
}

bootstrap();

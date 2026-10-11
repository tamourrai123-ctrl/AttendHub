import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // This test bootstraps its own application instance independently of
    // main.ts, so the global prefix, validation pipe, and exception filter
    // are re-applied here to match production behaviour. Global
    // guards/interceptors registered via APP_GUARD/APP_INTERCEPTOR (auth,
    // roles, monitoring) come from the compiled AppModule itself and need
    // no re-registration.
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());

    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/api/health (GET) — public, no auth required', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect({
        success: true,
        message: 'AttendHub API is running',
      });
  });

  it('/api/companies (GET) without a token is rejected with 401', () => {
    return request(app.getHttpServer()).get('/api/companies').expect(401);
  });
});

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Global HTTP logging interceptor.
 *
 * Logs one line per request: method, path, resulting status code, and
 * response time in milliseconds. This is intentionally lightweight —
 * it uses NestJS's built-in Logger (console output) and does not ship
 * logs anywhere external. No request/response bodies are logged.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const { method, originalUrl } = request;
    const startTime = Date.now();

    return next.handle().pipe(
      tap(() => {
        const { statusCode } = response;
        const responseTime = Date.now() - startTime;
        this.logger.log(
          `${method} ${originalUrl} ${statusCode} ${responseTime}ms`,
        );
      }),
    );
  }
}

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiErrorResponse } from '../types/api-error-response.interface';

/**
 * Global exception filter.
 *
 * Converts every thrown error — whether a NestJS HttpException or an
 * unexpected runtime error — into the single consistent shape required by
 * Phase 4B: { success: false, message }. This is the ONLY place in the
 * application that decides what an error response looks like on the wire.
 *
 * Unexpected (non-HttpException) errors are logged in full server-side for
 * debugging, but their internal details (stack traces, raw error messages)
 * are NEVER sent back to the client — the client only ever receives a
 * generic "Internal server error" message for those cases.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      let message: string | string[];

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else {
        const responseObject = exceptionResponse as Record<string, unknown>;
        message =
          (responseObject.message as string | string[] | undefined) ?? exception.message;
      }

      const body: ApiErrorResponse = { success: false, message };
      response.status(statusCode).json(body);
      return;
    }

    // Unexpected error: log full detail server-side only.
    this.logger.error(
      exception instanceof Error ? exception.stack : String(exception),
    );

    const body: ApiErrorResponse = { success: false, message: 'Internal server error' };
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(body);
  }
}

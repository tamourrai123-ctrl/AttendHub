import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import { MonitoringService } from '../../monitoring/monitoring.service';
import { HttpMethod } from '../../monitoring/interfaces/api-log.interface';

/**
 * Global interceptor — records method/endpoint/statusCode/responseTime plus
 * userId/companyId (when the request was authenticated) into
 * MonitoringService's in-memory store, for the Super Admin API Monitoring
 * page to consume via GET /api/monitoring.
 *
 * Scope (per product decision): the API Monitoring page exists to watch
 * Company Admin's own HR-system integration traffic — not every request
 * the whole backend serves. So only requests that (a) hit one of the
 * /integrations* routes (integrations.controller.ts, endpoints.controller.ts,
 * field-mappings.controller.ts, integration-tools.controller.ts,
 * hr-employees.controller.ts — every one of them is mounted under
 * "integrations") and (b) were made by a company-scoped session are
 * recorded. Super Admin's own session never carries a companyId (see
 * integrations.controller.ts's own doc comment), so this also naturally
 * excludes Super Admin's view/activate/deactivate calls to those same
 * routes — only Company Admin's calls qualify.
 *
 * Registered as an APP_INTERCEPTOR (see MonitoringModule) rather than in
 * main.ts, since it needs MonitoringService injected. Runs alongside, not
 * instead of, the existing LoggingInterceptor from Phase 4A — that one is
 * for the console; this one is for the in-memory API log a client can
 * query. Known simplification: because interceptors run after guards in
 * Nest's pipeline, a request rejected by AuthGuard/RolesGuard (401/403)
 * is not recorded here — only requests that reach a controller are.
 */
@Injectable()
export class MonitoringInterceptor implements NestInterceptor {
  constructor(private readonly monitoringService: MonitoringService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const response = context.switchToHttp().getResponse<Response>();
    const startTime = Date.now();

    return next.handle().pipe(
      tap(() => {
        const isIntegrationRoute = request.originalUrl.includes('/integrations');
        const madeByCompanyAdmin = Boolean(request.user?.companyId);
        if (!isIntegrationRoute || !madeByCompanyAdmin) {
          return;
        }

        this.monitoringService.record({
          method: request.method as HttpMethod,
          endpoint: request.originalUrl,
          statusCode: response.statusCode,
          responseTimeMs: Date.now() - startTime,
          userId: request.user?.userId,
          companyId: request.user?.companyId,
        });
      }),
    );
  }
}

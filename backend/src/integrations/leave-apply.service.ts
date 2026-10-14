import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { IntegrationsService } from './integrations.service';
import { PrismaEndpointsRepository } from './repositories/prisma-endpoints.repository';
import { PrismaFieldMappingsRepository } from './repositories/prisma-field-mappings.repository';
import { FieldMappingService } from './services/field-mapping.service';
import { IntegrationEndpointExecutorService } from './services/integration-endpoint-executor.service';
import { LEAVE_POST_ENDPOINT_NAME } from './constants/reserved-endpoint-names.constant';
import { PostLeaveApplicationDto } from './dto/post-leave-application.dto';
import { hrBodyReportsFailure } from './utils/hr-failure-body.util';

/**
 * Forwards one leave application from the mobile app to the company's HR system (POST /api/hr/leave).
 *
 * Same shape and rules as AttendancePunchService: a pure pass-through, nothing is stored on the hub side, and if
 * forwarding fails the caller is told plainly so the employee can retry. companyId / employeeId come from the
 * session (never the request body); the employee name is the HR display name carried by the session.
 *
 * Reuses the same building blocks every other integration call uses (FieldMappingService.apply() and
 * IntegrationEndpointExecutorService.execute()), so there is only one way a mapping is applied and one way a
 * request goes out to an HR system. Only the fields the Company Admin mapped on the "Apply for Leave" endpoint
 * are sent.
 */
@Injectable()
export class LeaveApplyService {
  private readonly logger = new Logger(LeaveApplyService.name);

  constructor(
    private readonly integrationsService: IntegrationsService,
    private readonly endpointsRepository: PrismaEndpointsRepository,
    private readonly fieldMappingsRepository: PrismaFieldMappingsRepository,
    private readonly fieldMappingEngine: FieldMappingService,
    private readonly executor: IntegrationEndpointExecutorService,
    private readonly systemLogsService: SystemLogsService,
  ) {}

  async apply(companyId: string, employeeId: string, dto: PostLeaveApplicationDto, employeeName?: string): Promise<void> {
    // Compared as ISO strings on purpose: for full ISO dates ("2026-11-03") lexical order is chronological order.
    if (dto.toDate.slice(0, 10) < dto.fromDate.slice(0, 10)) {
      throw new BadRequestException('"toDate" must be on or after "fromDate".');
    }

    const integration = await this.integrationsService.findMineForCompany(companyId);
    if (!integration || integration.status !== 'CONNECTED') {
      throw new BadRequestException('Leave applications are not set up (or are currently disabled) for your company.');
    }

    const endpoint = await this.endpointsRepository.findByIntegrationAndName(companyId, integration.id, LEAVE_POST_ENDPOINT_NAME);
    if (!endpoint) {
      throw new BadRequestException('Your company has not configured an "Apply for Leave" endpoint yet.');
    }

    const mappings = await this.fieldMappingsRepository.findActiveByEndpoint(companyId, integration.id, endpoint.id);
    if (mappings.length === 0) {
      throw new BadRequestException('Your company has not mapped any fields for the "Apply for Leave" endpoint yet.');
    }

    // Fixed, system-set values — never taken from the request body.
    const sourceRecord: Record<string, unknown> = {
      companyId,
      employeeCode: employeeId,
      employeeName: employeeName || undefined,
      leaveType: dto.leaveType,
      fromDate: dto.fromDate,
      toDate: dto.toDate,
      totalDays: dto.totalDays,
      reason: dto.reason,
      appliedOn: new Date().toISOString(),
      source: 'MOBILE_APP',
    };

    const domainMappings = mappings.map((mapping) => this.fieldMappingEngine.toDomainMapping(mapping));
    const mappedBody = this.fieldMappingEngine.apply(sourceRecord, domainMappings);

    const result = await this.executor.execute(companyId, integration.id, endpoint.id, {}, mappedBody);
    // HR may answer a failed insert with HTTP 2xx and a body that says so — don't report that as delivered.
    const hrRejected = result.success && hrBodyReportsFailure(result.body);
    const delivered = result.success && !hrRejected;

    // Audit trail only — outcome/status/timing. Never the application's own data (reason, dates) or the HR response body.
    this.systemLogsService.record({
      user: 'mobile-user',
      action: delivered ? 'LEAVE_APPLICATION_FORWARDED' : 'LEAVE_APPLICATION_FORWARD_FAILED',
      resource: 'LeaveApplication',
      resourceId: endpoint.id,
      severity: delivered ? 'INFO' : 'WARNING',
      description: delivered
        ? `Forwarded a leave application to HR (HTTP ${result.statusCode}).`
        : `Failed to forward a leave application to HR: ${result.error ?? (hrRejected ? 'HR reported the record as failed' : `HTTP ${result.statusCode}`)}.`,
      metadata: { companyId, integrationId: integration.id, endpointId: endpoint.id, statusCode: result.statusCode, durationMs: result.durationMs },
    });

    if (!delivered) {
      this.logger.warn(`Leave application forward failed for company ${companyId}.`);
      throw new BadGatewayException(
        result.error ??
          (hrRejected
            ? 'Your HR system did not accept this leave application. Please try again or contact your admin.'
            : 'Could not reach your HR system to submit this leave application. Please try again.'),
      );
    }
  }
}

import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { IntegrationsService } from './integrations.service';
import { PrismaEndpointsRepository } from './repositories/prisma-endpoints.repository';
import { PrismaFieldMappingsRepository } from './repositories/prisma-field-mappings.repository';
import { FieldMappingService } from './services/field-mapping.service';
import { IntegrationEndpointExecutorService } from './services/integration-endpoint-executor.service';
import { ATTENDANCE_POST_ENDPOINT_NAME } from './constants/reserved-endpoint-names.constant';
import { PostAttendancePunchDto } from './dto/post-attendance-punch.dto';
import { hrBodyReportsFailure } from './utils/hr-failure-body.util';

/**
 * Phase 2/Part B — receives one attendance punch from the mobile app and
 * forwards it to the company's HR system immediately. Deliberately has NO
 * persistence step of its own and no repository to save an attendance
 * record to — this was an explicit, discussed product decision (unlike the
 * read-only Attendance module, which will later show data fetched LIVE
 * from HR — Part C — this service never stores anything). If forwarding
 * fails for any reason, the punch is not retried or queued anywhere; the
 * caller (mobile app) is told plainly that it failed, exactly as if the
 * call had failed outright — so the mobile app is expected to let the
 * employee retry.
 *
 * Reuses the same building blocks Endpoints/FieldMappings already use for
 * configuration/testing — FieldMappingService (the same stateless apply()
 * engine EndpointsService.testEndpoint() and the standalone preview route
 * use) and IntegrationEndpointExecutorService (now able to send a request
 * body — see that class's updated execute() signature) — so there is only
 * ever one way a mapping gets applied and only one way a call actually
 * goes out to an HR system.
 */
@Injectable()
export class AttendancePunchService {
  private readonly logger = new Logger(AttendancePunchService.name);

  constructor(
    private readonly integrationsService: IntegrationsService,
    private readonly endpointsRepository: PrismaEndpointsRepository,
    private readonly fieldMappingsRepository: PrismaFieldMappingsRepository,
    private readonly fieldMappingEngine: FieldMappingService,
    private readonly executor: IntegrationEndpointExecutorService,
    private readonly systemLogsService: SystemLogsService,
  ) {}

  async postPunch(companyId: string, employeeId: string, dto: PostAttendancePunchDto, employeeName?: string): Promise<void> {
    // employeeId is the HR system's own id for the caller (from the session); nothing is looked up or stored here.

    const integration = await this.integrationsService.findMineForCompany(companyId);
    if (!integration || integration.status !== 'CONNECTED') {
      throw new BadRequestException('Attendance forwarding is not set up (or is currently disabled) for your company.');
    }

    const endpoint = await this.endpointsRepository.findByIntegrationAndName(companyId, integration.id, ATTENDANCE_POST_ENDPOINT_NAME);
    if (!endpoint) {
      throw new BadRequestException('Your company has not configured an "Attendance Post" endpoint yet.');
    }

    const mappings = await this.fieldMappingsRepository.findActiveByEndpoint(companyId, integration.id, endpoint.id);
    if (mappings.length === 0) {
      throw new BadRequestException('Your company has not mapped any fields for the "Attendance Post" endpoint yet.');
    }

    // Fixed, system-set values — never taken from the request body (see
    // PostAttendancePunchDto's doc comment for why source/addedBy/
    // employeeCode/companyId are deliberately absent from it).
    const sourceRecord: Record<string, unknown> = {
      companyId,
      employeeCode: employeeId,
      punchTime: dto.punchTime,
      state: dto.state,
      source: 'MOBILE_APP',
      latitude: dto.latitude,
      longitude: dto.longitude,
      wifi: dto.wifi,
      qrCode: dto.qrCode,
      addedBy: employeeId,
      filename: dto.filename,
      fileMimetype: dto.fileMimetype,
      employeeImage: dto.employeeImage,
      fileCharset: dto.fileCharset,
      wifiCheckStatus: dto.wifiCheckStatus,
      appVersion: dto.appVersion,
      docFileId: dto.docFileId,
      pushToken: dto.pushToken,
      manualLogoutFlag: dto.manualLogoutFlag,
      employeeName: employeeName || undefined, // from the session, never from the request body
    };

    const domainMappings = mappings.map((mapping) => this.fieldMappingEngine.toDomainMapping(mapping));
    const mappedBody = this.fieldMappingEngine.apply(sourceRecord, domainMappings);

    const result = await this.executor.execute(companyId, integration.id, endpoint.id, {}, mappedBody);
    // HR may answer a failed insert with HTTP 2xx and a body that says so — don't report that as delivered.
    const hrRejected = result.success && hrBodyReportsFailure(result.body);
    const delivered = result.success && !hrRejected;

    // Audit trail only — outcome/status/timing, exactly like every other
    // systemLogsService.record() call in this module. Never the punch's
    // own data (location/selfie/etc.) or the HR response body, both of
    // which can carry real employee PII.
    this.systemLogsService.record({
      user: 'mobile-user',
      action: delivered ? 'ATTENDANCE_PUNCH_FORWARDED' : 'ATTENDANCE_PUNCH_FORWARD_FAILED',
      resource: 'AttendancePunch',
      resourceId: endpoint.id,
      severity: delivered ? 'INFO' : 'WARNING',
      description: delivered
        ? `Forwarded a ${dto.state} punch to HR (HTTP ${result.statusCode}).`
        : `Failed to forward a ${dto.state} punch to HR: ${result.error ?? (hrRejected ? 'HR reported the record as failed' : `HTTP ${result.statusCode}`)}.`,
      metadata: { companyId, integrationId: integration.id, endpointId: endpoint.id, statusCode: result.statusCode, durationMs: result.durationMs },
    });

    if (!delivered) {
      this.logger.warn(`Attendance punch forward failed for company ${companyId}.`);
      throw new BadGatewayException(
        result.error ?? (hrRejected ? 'Your HR system did not accept this attendance record. Please try again or contact your admin.' : 'Could not reach your HR system to record this attendance. Please try again.'),
      );
    }
  }
}

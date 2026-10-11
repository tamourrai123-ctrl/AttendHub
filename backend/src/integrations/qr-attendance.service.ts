import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { IntegrationsService } from './integrations.service';
import { PrismaEndpointsRepository } from './repositories/prisma-endpoints.repository';
import { IntegrationEndpointExecutorService } from './services/integration-endpoint-executor.service';
import { QR_ATTENDANCE_ENDPOINT_NAME } from './constants/reserved-endpoint-names.constant';
import { hrBodyReportsFailure } from './utils/hr-failure-body.util';

/**
 * Forwards the "generate QR token" call to the company's HR system (HR's post_qrcode_attendance API). The API
 * document lists no request or response fields, so an empty JSON body is sent and only success/failure is
 * reported. Nothing is stored; the HR response body is never returned or logged.
 */
@Injectable()
export class QrAttendanceService {
  private readonly logger = new Logger(QrAttendanceService.name);

  constructor(
    private readonly integrationsService: IntegrationsService,
    private readonly endpointsRepository: PrismaEndpointsRepository,
    private readonly executor: IntegrationEndpointExecutorService,
    private readonly systemLogsService: SystemLogsService,
  ) {}

  async generate(companyId: string): Promise<{ delivered: true }> {
    const integration = await this.integrationsService.findMineForCompany(companyId);
    if (!integration || integration.status !== 'CONNECTED') {
      throw new BadRequestException('Your HR integration is not set up yet (or is currently disabled).');
    }

    const endpoint = await this.endpointsRepository.findByIntegrationAndName(companyId, integration.id, QR_ATTENDANCE_ENDPOINT_NAME);
    if (!endpoint) {
      throw new BadRequestException('Your company has not configured a "QR Code Attendance" endpoint yet.');
    }

    const result = await this.executor.execute(companyId, integration.id, endpoint.id, {}, {});
    const hrRejected = result.success && hrBodyReportsFailure(result.body);
    const delivered = result.success && !hrRejected;

    this.systemLogsService.record({
      user: 'company-admin',
      action: delivered ? 'QR_TOKEN_REQUESTED' : 'QR_TOKEN_REQUEST_FAILED',
      resource: 'AttendancePunch',
      resourceId: endpoint.id,
      severity: delivered ? 'INFO' : 'WARNING',
      description: delivered
        ? `Asked HR to generate a QR token (HTTP ${result.statusCode}).`
        : `Failed to ask HR to generate a QR token: ${result.error ?? (hrRejected ? 'HR reported the request as failed' : `HTTP ${result.statusCode}`)}.`,
      metadata: { companyId, integrationId: integration.id, endpointId: endpoint.id, statusCode: result.statusCode, durationMs: result.durationMs },
    });

    if (!delivered) {
      this.logger.warn(`QR token request failed for company ${companyId}.`);
      throw new BadGatewayException(result.error ?? (hrRejected ? 'Your HR system did not accept the QR token request.' : 'Could not reach your HR system to generate the QR token.'));
    }
    return { delivered: true };
  }
}

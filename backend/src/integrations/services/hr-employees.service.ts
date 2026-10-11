import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaEndpointsRepository } from '../repositories/prisma-endpoints.repository';
import { PrismaFieldMappingsRepository } from '../repositories/prisma-field-mappings.repository';
import { IntegrationEndpointExecutorService } from './integration-endpoint-executor.service';
import { FieldMappingService } from './field-mapping.service';
import { EMPLOYEES_ENDPOINT_NAME } from '../constants/reserved-endpoint-names.constant';

/** One HR employee record, shaped entirely by whatever field mappings the Company Admin configured on the EMPLOYEES endpoint — this service has no opinion on what fields exist beyond the "externalId" convention documented below. */
export type HrEmployeeRecord = Record<string, unknown>;

/**
 * Generic, vendor-agnostic "fetch employees from the HR system" capability.
 *
 * Deliberately does NOT implement the legacy HRProvider interface
 * (src/integrations/interfaces/hr-provider.interface.ts) — that interface
 * assumes one hand-written adapter class per HR vendor, which doesn't fit
 * this codebase's actual model: every company configures ITS OWN HR
 * connection generically (base URL, auth, endpoints, field mappings), with
 * no vendor-specific code anywhere. This service is built entirely on the
 * pieces that generic model already produced —
 * IntegrationEndpointExecutorService (makes the real call) and
 * FieldMappingService (shapes the response) — the same two services
 * EndpointsService.testEndpoint() already uses for its live preview.
 *
 * Nothing here persists anything. Every call is live: this fetches from the
 * HR system on demand and returns the mapped result, per the product
 * decision that HR employee details (department, designation, status, etc.)
 * are displayed live rather than synced into AttendHub's own storage. The
 * only thing AttendHub stores about HR identity is what Phase A.2 already
 * added to usm_users (integration_id/external_employee_id) — this service
 * is what that identity is FOR: knowing which HR record to fetch.
 *
 * Convention this service relies on (documented for whoever configures a
 * company's integration): exactly one of the configured endpoints must be
 * named "EMPLOYEES" (EMPLOYEES_ENDPOINT_NAME) — same reserved-name pattern
 * already used for the OAuth2 token endpoint — and, for single-employee
 * lookup to work, at least one active field mapping on that endpoint must
 * target the field "externalId".
 */
@Injectable()
export class HrEmployeesService {
  constructor(
    private readonly endpointsRepository: PrismaEndpointsRepository,
    private readonly fieldMappingsRepository: PrismaFieldMappingsRepository,
    private readonly executor: IntegrationEndpointExecutorService,
    private readonly fieldMappingEngine: FieldMappingService,
  ) {}

  /** List every HR employee the configured EMPLOYEES endpoint returns, mapped through the endpoint's active field mappings. Used by the Company Admin's employee-linking picker. */
  async listEmployees(companyId: string, integrationId: string): Promise<HrEmployeeRecord[]> {
    return this.fetchAndMap(companyId, integrationId, {});
  }

  /**
   * Fetch one employee's live HR details by AttendHub's stored
   * externalEmployeeId (see usm_users.external_employee_id, Phase A.2).
   *
   * Passes externalEmployeeId as a query param to the executor, which fills
   * a `{{externalEmployeeId}}` placeholder in the EMPLOYEES endpoint's
   * configured path IF the Company Admin's HR API supports per-id fetching
   * (e.g. "/employees/{{externalEmployeeId}}") — the HR system then does the
   * filtering itself. If the configured path has no such placeholder, the
   * substitution is a no-op, the full list comes back, and this method
   * filters it client-side by matching the "externalId" field every mapping
   * set is expected to produce (see class doc comment).
   */
  async getEmployeeDetail(companyId: string, integrationId: string, externalEmployeeId: string): Promise<HrEmployeeRecord> {
    const mapped = await this.fetchAndMap(companyId, integrationId, { externalEmployeeId });

    const match = mapped.find((record) => String(record.externalId ?? '') === externalEmployeeId);
    if (!match) {
      throw new NotFoundException(
        `No HR employee found with externalEmployeeId "${externalEmployeeId}". Confirm the EMPLOYEES endpoint's ` +
          'field mappings include one targeting "externalId", and that this id still exists in the HR system.',
      );
    }
    return match;
  }

  private async fetchAndMap(
    companyId: string,
    integrationId: string,
    queryParams: Record<string, string>,
  ): Promise<HrEmployeeRecord[]> {
    const endpoint = await this.endpointsRepository.findByIntegrationAndName(companyId, integrationId, EMPLOYEES_ENDPOINT_NAME);
    if (!endpoint) {
      throw new BadRequestException(
        `No endpoint named "${EMPLOYEES_ENDPOINT_NAME}" is configured for this integration. Create one (the ` +
          "endpoint that returns the HR system's employee list) before fetching HR employees.",
      );
    }

    const mappings = await this.fieldMappingsRepository.findActiveByEndpoint(companyId, integrationId, endpoint.id);
    if (mappings.length === 0) {
      throw new BadRequestException(
        `The "${EMPLOYEES_ENDPOINT_NAME}" endpoint has no active field mappings configured yet. Configure at ` +
          'least one before fetching HR employees — only mapped fields are ever returned, never the HR system\'s raw response shape.',
      );
    }

    const result = await this.executor.execute(companyId, integrationId, endpoint.id, queryParams);
    if (!result.success) {
      throw new BadRequestException(result.error ?? `The HR system returned an unsuccessful response (HTTP ${result.statusCode}).`);
    }

    const domainMappings = mappings.map((mapping) => this.fieldMappingEngine.toDomainMapping(mapping));
    const applied = this.fieldMappingEngine.applyToResponse(result.body, domainMappings);
    return Array.isArray(applied) ? (applied as HrEmployeeRecord[]) : [applied as HrEmployeeRecord];
  }
}

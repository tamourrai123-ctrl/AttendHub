import { Injectable, Logger } from '@nestjs/common';
import { EmployeesService } from '../../employees/employees.service';
import { HrEmployeesService, HrEmployeeRecord } from './hr-employees.service';
import { EmployeeSyncResult } from '../interfaces/employee-sync-result.interface';

/**
 * Attributed as the actor on every employee record this service
 * creates/updates — a real Company Admin never performed these writes, HR
 * sync did. Shows up in system_logs and in Employee.metadata the same way a
 * human actor's name would.
 */
const SYNC_ACTOR_NAME = 'HR Sync';

/**
 * Continuous employee sync: reconciles AttendHub's own employee roster
 * against the connected HR system's live employee list (the same
 * "EMPLOYEES" endpoint HrEmployeesService already uses for the one-off
 * linking picker), so employee records reach AttendHub without a Company
 * Admin ever typing them in by hand.
 *
 * This is an explicit product decision, confirmed with the Company Admin's
 * stakeholder: sync is ADDITIVE AND UPDATING ONLY.
 *   - An HR record with no matching AttendHub employee (by
 *     integrationId + externalEmployeeId, the Phase A.2 identity key) is
 *     CREATED.
 *   - An HR record that already matches an AttendHub employee, but whose
 *     name/email differs, is UPDATED to match.
 *   - An HR record that already matches and already agrees is left alone
 *     (counted as `unchanged`, no write performed).
 *   - An AttendHub employee is NEVER deleted or deactivated just because
 *     the HR system stopped returning them this pass — a temporary HR-side
 *     hiccup (a slow page, a filtered response, a brief outage) must never
 *     look like a mass termination. Removing an employee, if ever wanted,
 *     is a deliberate separate action, not a side effect of sync.
 *
 * Called from two places, both producing the exact same result shape and
 * running the exact same reconciliation: the manual "Sync Now" button
 * (HrEmployeesController.sync()) and the background scheduler
 * (EmployeeSyncSchedulerService, on a timer) — see EmployeeSyncResult's own
 * doc comment.
 *
 * Lives in IntegrationsModule (not EmployeesModule) because EmployeesModule
 * does not import IntegrationsModule — putting this service in
 * EmployeesModule instead would require EmployeesModule to import
 * IntegrationsModule, creating a circular dependency. IntegrationsModule
 * already imports EmployeesModule and already provides HrEmployeesService,
 * so both dependencies this service needs are available here.
 */
@Injectable()
export class EmployeeSyncService {
  private readonly logger = new Logger(EmployeeSyncService.name);

  constructor(
    private readonly hrEmployeesService: HrEmployeesService,
    private readonly employeesService: EmployeesService,
  ) {}

  async syncCompany(companyId: string, integrationId: string): Promise<EmployeeSyncResult> {
    const hrEmployees = await this.hrEmployeesService.listEmployees(companyId, integrationId);

    const result: EmployeeSyncResult = {
      companyId,
      integrationId,
      totalFetched: hrEmployees.length,
      created: 0,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    };

    for (const record of hrEmployees) {
      try {
        await this.syncOne(companyId, integrationId, record, result);
      } catch (error) {
        result.failed += 1;
        const message = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Failed to sync one HR record: ${message}`);
        this.logger.error(`Employee sync failed for a record under integration ${integrationId} (company ${companyId}): ${message}`);
      }
    }

    return result;
  }

  /**
   * `record` is whatever HrEmployeesService's field-mapping engine produced
   * — guaranteed (per the EMPLOYEES purpose's fixed field list, see
   * endpoint-purposes.constant.ts) to use the keys `externalId`/`name`/
   * `email` when the Company Admin mapped them, but a mapping is
   * config-driven, so a record can still arrive with a field missing or of
   * the wrong type if the mapping is incomplete — handled below as `skipped`,
   * never thrown.
   */
  private async syncOne(
    companyId: string,
    integrationId: string,
    record: HrEmployeeRecord,
    result: EmployeeSyncResult,
  ): Promise<void> {
    const externalId = this.readNonEmptyString(record.externalId);
    const name = this.readNonEmptyString(record.name);
    const email = this.readNonEmptyString(record.email);

    if (!externalId || !name || !email) {
      result.skipped += 1;
      result.errors.push(
        'Skipped an HR record missing a required mapped field (externalId/name/email). Check the EMPLOYEES ' +
          'endpoint\'s field mappings.',
      );
      return;
    }

    const existing = await this.employeesService.findByExternalIdentity(companyId, integrationId, externalId);

    if (!existing) {
      await this.employeesService.create(
        { name, email, integrationId, externalEmployeeId: externalId },
        companyId,
        SYNC_ACTOR_NAME,
      );
      result.created += 1;
      return;
    }

    if (existing.name === name && existing.email === email) {
      result.unchanged += 1;
      return;
    }

    await this.employeesService.update(existing.id, companyId, { name, email }, SYNC_ACTOR_NAME);
    result.updated += 1;
  }

  private readNonEmptyString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaEndpointsRepository } from '../repositories/prisma-endpoints.repository';
import { EmployeeSyncService } from './employee-sync.service';
import { EMPLOYEES_ENDPOINT_NAME } from '../constants/reserved-endpoint-names.constant';

/** How often the background pass runs. A manual "Sync Now" (HrEmployeesController.sync()) is unaffected by this and can be triggered any time in between. */
const SYNC_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Background half of the Employee Sync feature. The manual "Sync Now"
 * button and this scheduler both call the exact same
 * EmployeeSyncService.syncCompany() — the reconciliation logic (create new,
 * update changed, never delete) is identical either way. This class only
 * adds "run it automatically, for every company that has it configured, on
 * a timer" — confirmed as a requirement alongside (not instead of) the
 * manual button.
 *
 * Enumerates every (company_id, integration_id) pair with an active
 * endpoint named EMPLOYEES under an active integration
 * (PrismaEndpointsRepository.findActiveEmployeesEndpoints()), then syncs
 * each one independently, wrapped in its own try/catch — one company's HR
 * system being unreachable, misconfigured, or slow must never stop any
 * other company's sync from running this tick.
 */
@Injectable()
export class EmployeeSyncSchedulerService {
  private readonly logger = new Logger(EmployeeSyncSchedulerService.name);
  private running = false;

  constructor(
    private readonly endpointsRepository: PrismaEndpointsRepository,
    private readonly employeeSyncService: EmployeeSyncService,
  ) {}

  @Interval(SYNC_INTERVAL_MS)
  async handleScheduledSync(): Promise<void> {
    // Guards against overlap if one full pass over every company ever takes
    // longer than SYNC_INTERVAL_MS — skip this tick rather than running two
    // passes concurrently.
    if (this.running) {
      this.logger.warn('Skipped a scheduled employee sync tick — the previous pass is still running.');
      return;
    }

    this.running = true;
    try {
      const targets = await this.endpointsRepository.findActiveEmployeesEndpoints(EMPLOYEES_ENDPOINT_NAME);
      for (const target of targets) {
        try {
          const result = await this.employeeSyncService.syncCompany(target.companyId, target.integrationId);
          this.logger.log(
            `Scheduled sync — company ${target.companyId}, integration ${target.integrationId}: ` +
              `${result.totalFetched} fetched, ${result.created} created, ${result.updated} updated, ` +
              `${result.unchanged} unchanged, ${result.skipped} skipped, ${result.failed} failed.`,
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(
            `Scheduled sync failed — company ${target.companyId}, integration ${target.integrationId}: ${message}`,
          );
        }
      }
    } finally {
      this.running = false;
    }
  }
}

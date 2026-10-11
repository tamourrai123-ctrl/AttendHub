import { Injectable, Logger } from '@nestjs/common';
import { PrismaSettingsRepository } from './repositories/prisma-settings.repository';
import { NotificationKind, PlatformSettings } from './interfaces/platform-settings.interface';
import { UpdateSettingsDto } from './dto/update-settings.dto';

/**
 * SettingsModule is deliberately a leaf module — it imports nothing of its
 * own (see settings.module.ts). That means SettingsService can be safely
 * injected into AuthModule, SystemLogsModule, MonitoringModule, and
 * IntegrationsModule without ever risking a circular module dependency
 * (those modules importing SettingsModule, which imports one of them back).
 *
 * The one thing this trades away: a Settings change itself is never
 * written to System Logs, since that would require importing
 * SystemLogsModule here. Not a request from this phase's scope, and not
 * worth the circular-DI risk to add speculatively.
 *
 * Postgres migration: backed by PrismaSettingsRepository now (a singleton
 * `platform_settings` row) instead of InMemorySettingsRepository's
 * process-wide value that used to reset on every server restart — see
 * scripts/create-platform-settings-table.ts. Every method that touches the
 * repository is now async as a result; notifyIfEnabled() alone keeps its
 * synchronous-looking `void` signature (fire-and-forget, same pattern as
 * SystemLogsService.record()/MonitoringService.record()) so its three
 * existing non-awaiting call sites needed no changes.
 */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(private readonly repository: PrismaSettingsRepository) {}

  async findAll(): Promise<PlatformSettings> {
    return this.repository.find();
  }

  /**
   * Merges each provided group onto the currently-stored settings —
   * omitting `notifications` entirely, say, leaves it untouched; providing
   * `notifications` but omitting one field within it leaves just that
   * field untouched. This is why every field on both DTOs is optional
   * (see update-settings.dto.ts).
   */
  async update(dto: UpdateSettingsDto): Promise<PlatformSettings> {
    const current = await this.repository.find();

    const next: PlatformSettings = {
      security: {
        ...current.security,
        ...(dto.security ?? {}),
      },
      notifications: {
        ...current.notifications,
        ...(dto.notifications ?? {}),
      },
    };

    return this.repository.save(next);
  }

  /**
   * Single source of truth for "how long should a freshly-issued session
   * live" — used by AuthService.issueSession() (JWT expiry) and
   * PrismaSessionsRepository.create() (the DB row's expiresAt), so the two
   * can never drift out of sync with each other or with what a Super Admin
   * last set.
   */
  async getSessionTimeoutSeconds(): Promise<number> {
    const settings = await this.repository.find();
    return settings.security.sessionTimeoutMinutes * 60;
  }

  /**
   * Console-log-only "email" alert (per this phase's own scope decision —
   * no real mail delivery yet). Called from three fire-and-forget hook
   * points: SystemLogsService.record() (systemErrorAlerts),
   * MonitoringService.record() (apiFailureAlerts), and
   * IntegrationsService.setStatusForCompany() (integrationWarnings). Each
   * caller is responsible for deciding WHEN its own event qualifies (e.g.
   * "severity is ERROR or CRITICAL") — this method only checks whether the
   * matching toggle is currently on, then logs.
   *
   * Kept `void`-returning on the outside (none of its three call sites
   * await it) even though the repository read behind it is now async — the
   * read is kicked off and handled with .catch(), never thrown, same shape
   * as SystemLogsService.record()/MonitoringService.record().
   */
  notifyIfEnabled(kind: NotificationKind, subject: string, detail: string): void {
    this.repository
      .find()
      .then((settings) => {
        if (!settings.notifications[kind]) {
          return;
        }
        this.logger.warn(`[ALERT:${kind}] ${subject} — ${detail}`);
      })
      .catch((error) => {
        this.logger.error(`Failed to check "${kind}" notification setting: ${error instanceof Error ? error.message : error}`);
      });
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DEFAULT_PLATFORM_SETTINGS, PlatformSettings } from '../interfaces/platform-settings.interface';

/** There is exactly one platform, so exactly one settings row — always id=1. See scripts/create-platform-settings-table.ts. */
const SINGLETON_ID = 1;

/**
 * Postgres-backed replacement for InMemorySettingsRepository. Same public
 * shape (`find()`/`save()`), so SettingsService did not need to change how
 * it talks to its repository — only the injected type.
 *
 * find() upserts defensively on every call: if the singleton row was ever
 * deleted by hand (or this runs before create-platform-settings-table.ts's
 * own seed step reaches this environment), the app still gets a sensible
 * row back instead of throwing, and that row is created using the exact
 * same defaults as DEFAULT_PLATFORM_SETTINGS.
 */
@Injectable()
export class PrismaSettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async find(): Promise<PlatformSettings> {
    const row = await this.prisma.platform_settings.upsert({
      where: { id: SINGLETON_ID },
      update: {},
      create: {
        id: SINGLETON_ID,
        session_timeout_minutes: DEFAULT_PLATFORM_SETTINGS.security.sessionTimeoutMinutes,
        require_two_step_login: DEFAULT_PLATFORM_SETTINGS.security.requireTwoStepLogin ? 'Y' : 'N',
        system_error_alerts: DEFAULT_PLATFORM_SETTINGS.notifications.systemErrorAlerts ? 'Y' : 'N',
        api_failure_alerts: DEFAULT_PLATFORM_SETTINGS.notifications.apiFailureAlerts ? 'Y' : 'N',
        integration_warnings: DEFAULT_PLATFORM_SETTINGS.notifications.integrationWarnings ? 'Y' : 'N',
      },
    });

    return this.toSettings(row);
  }

  /** edit_by is left null for now — see create-platform-settings-table.ts's doc comment (no @CurrentUser() on the PATCH route yet). */
  async save(settings: PlatformSettings): Promise<PlatformSettings> {
    const row = await this.prisma.platform_settings.upsert({
      where: { id: SINGLETON_ID },
      update: {
        session_timeout_minutes: settings.security.sessionTimeoutMinutes,
        require_two_step_login: settings.security.requireTwoStepLogin ? 'Y' : 'N',
        system_error_alerts: settings.notifications.systemErrorAlerts ? 'Y' : 'N',
        api_failure_alerts: settings.notifications.apiFailureAlerts ? 'Y' : 'N',
        integration_warnings: settings.notifications.integrationWarnings ? 'Y' : 'N',
        edit_date: new Date(),
      },
      create: {
        id: SINGLETON_ID,
        session_timeout_minutes: settings.security.sessionTimeoutMinutes,
        require_two_step_login: settings.security.requireTwoStepLogin ? 'Y' : 'N',
        system_error_alerts: settings.notifications.systemErrorAlerts ? 'Y' : 'N',
        api_failure_alerts: settings.notifications.apiFailureAlerts ? 'Y' : 'N',
        integration_warnings: settings.notifications.integrationWarnings ? 'Y' : 'N',
        edit_date: new Date(),
      },
    });

    return this.toSettings(row);
  }

  private toSettings(row: {
    session_timeout_minutes: number;
    require_two_step_login: string;
    system_error_alerts: string;
    api_failure_alerts: string;
    integration_warnings: string;
  }): PlatformSettings {
    return {
      security: {
        sessionTimeoutMinutes: row.session_timeout_minutes,
        requireTwoStepLogin: row.require_two_step_login === 'Y',
      },
      notifications: {
        systemErrorAlerts: row.system_error_alerts === 'Y',
        apiFailureAlerts: row.api_failure_alerts === 'Y',
        integrationWarnings: row.integration_warnings === 'Y',
      },
    };
  }
}

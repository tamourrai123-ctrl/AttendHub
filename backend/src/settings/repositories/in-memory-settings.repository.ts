import { Injectable } from '@nestjs/common';
import { DEFAULT_PLATFORM_SETTINGS, PlatformSettings } from '../interfaces/platform-settings.interface';

/**
 * In-memory only — there is no `platform_settings` table (or equivalent)
 * in the database yet. This matches how every other still-mock module
 * (Pricing, Monitoring) started before its own migration: a single
 * process-wide value, reset to DEFAULT_PLATFORM_SETTINGS on every server
 * restart. A future phase can migrate this to Prisma the same way those
 * did, without SettingsService's public methods needing to change.
 */
function clone(settings: PlatformSettings): PlatformSettings {
  // Plain object spread rather than structuredClone() — PlatformSettings is
  // only ever two levels deep (security/notifications, both flat), so a
  // shallow-per-level copy is enough, and it avoids relying on a global
  // that may not be declared depending on this project's TS lib/target.
  return {
    security: { ...settings.security },
    notifications: { ...settings.notifications },
  };
}

@Injectable()
export class InMemorySettingsRepository {
  private settings: PlatformSettings = clone(DEFAULT_PLATFORM_SETTINGS);

  find(): PlatformSettings {
    return clone(this.settings);
  }

  save(settings: PlatformSettings): PlatformSettings {
    this.settings = clone(settings);
    return clone(this.settings);
  }
}

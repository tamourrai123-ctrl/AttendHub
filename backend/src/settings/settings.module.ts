import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { PrismaSettingsRepository } from './repositories/prisma-settings.repository';

/**
 * Settings module — deliberately a LEAF module: no `imports` at all.
 * (PrismaService is available anyway without an import — PrismaModule is
 * @Global(), see prisma.module.ts.)
 *
 * AuthModule, SystemLogsModule, MonitoringModule, and IntegrationsModule
 * each import this module directly to get SettingsService (session
 * timeout, notification toggles). If SettingsModule imported any of
 * THEM back — e.g. to audit-log a settings change via SystemLogsService —
 * that would be a circular module dependency, which NestJS only supports
 * via forwardRef() on both sides. forwardRef circular-DI issues often only
 * surface at runtime, not at compile time, and there's no way to run this
 * app here to catch that — so the safer choice is to keep this module
 * dependency-free and give up the one nice-to-have (audit-logging settings
 * changes) rather than ship something that might break in a way a build
 * error wouldn't catch.
 *
 * Postgres migration: providers swapped InMemorySettingsRepository ->
 * PrismaSettingsRepository — see settings.service.ts's doc comment.
 */
@Module({
  controllers: [SettingsController],
  providers: [SettingsService, PrismaSettingsRepository],
  exports: [SettingsService],
})
export class SettingsModule {}

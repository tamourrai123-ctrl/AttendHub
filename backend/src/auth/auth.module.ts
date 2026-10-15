import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SystemLogsModule } from '../system-logs/system-logs.module';
import { SettingsModule } from '../settings/settings.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './guards/auth.guard';
import { InMemoryUsersRepository } from './repositories/in-memory-users.repository';
import { PrismaUsersRepository } from './repositories/prisma-users.repository';
import { PrismaSessionsRepository } from './repositories/prisma-sessions.repository';
import { EmailService } from './email/email.service';
import { GoogleAuthService } from './google/google-auth.service';
import { SESSION_TTL_SECONDS } from './constants/auth.constants';

/**
 * Auth module.
 *
 * Real, DB-backed authentication as of Phase 4G: PrismaUsersRepository
 * (usm_users) and PrismaSessionsRepository (usm_user_sessions) are now the
 * primary data sources. InMemoryUsersRepository is KEPT and still exported
 * — not because sessions are still in-memory (they aren't, see
 * PrismaSessionsRepository), but because:
 *   1. AuthService.login() still accepts its three legacy demo accounts as
 *      a fallback (see AuthService's class doc comment).
 *   2. Five other controllers across the app (Companies/Employees/
 *      Integrations/Endpoints/FieldMappings) inject InMemoryUsersRepository
 *      directly to resolve an actor's display name for system_logs
 *      (`this.usersRepository.findById(user.userId)?.name`). Real,
 *      signed-up users' ids don't match anything in that repository, so
 *      their audit-log entries show their raw id instead of a display name
 *      for now — a known, deferred gap, not a crash (see the final
 *      report's "deferred work" section) — left alone this phase rather
 *      than touching five more controllers' constructors.
 *
 * InMemorySessionsRepository is no longer wired in here at all (left on
 * disk, unused, the same way InMemoryCompaniesRepository/
 * InMemoryIntegrationsRepository were left after their own migrations).
 *
 * JwtModule's own signOptions.expiresIn below is only ever a FALLBACK — in
 * practice AuthService.issueSession() always passes an explicit
 * `{ expiresIn }` override (now sourced from SettingsService, see
 * auth.service.ts), which NestJS's JwtService applies per-call over this
 * module-level default. SESSION_TTL_SECONDS is kept here purely as that
 * static fallback's value, not as the value actually used for real logins
 * anymore.
 *
 * SettingsModule is imported so AuthService can inject SettingsService and
 * read the Super-Admin-configurable session timeout — see SettingsModule's
 * own doc comment for why it's safe to import here (it's a leaf module,
 * so this can never become a circular dependency).
 */
@Module({
  imports: [
    SystemLogsModule,
    SettingsModule,
    SubscriptionsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('app.jwtSecret'),
        signOptions: { expiresIn: `${SESSION_TTL_SECONDS}s` },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    InMemoryUsersRepository,
    PrismaUsersRepository,
    PrismaSessionsRepository,
    EmailService,
    GoogleAuthService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [InMemoryUsersRepository, PrismaUsersRepository, PrismaSessionsRepository, JwtModule],
})
export class AuthModule {}

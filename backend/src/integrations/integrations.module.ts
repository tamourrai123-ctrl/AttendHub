import { Module } from '@nestjs/common';
import { SystemLogsModule } from '../system-logs/system-logs.module';
import { AuthModule } from '../auth/auth.module';
import { CompaniesModule } from '../companies/companies.module';
import { EmployeesModule } from '../employees/employees.module';
import { LovModule } from '../lov/lov.module';
import { SettingsModule } from '../settings/settings.module';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { EndpointsController } from './endpoints.controller';
import { EndpointsService } from './endpoints.service';
import { IntegrationToolsController } from './integration-tools.controller';
import { FieldMappingsController } from './field-mappings.controller';
import { FieldMappingsService } from './field-mappings.service';
import { HrEmployeesController } from './hr-employees.controller';
import { HrEmployeesService } from './services/hr-employees.service';
import { EmployeeSyncService } from './services/employee-sync.service';
import { EmployeeSyncSchedulerService } from './services/employee-sync-scheduler.service';
import { AttendancePunchController } from './attendance-punch.controller';
import { AttendancePunchService } from './attendance-punch.service';
import { LoginSessionService } from './login-session.service';
import { LeaveApplyService } from './leave-apply.service';
import { QrAttendanceService } from './qr-attendance.service';
import { MobileAuthController } from './mobile-auth.controller';
import { MobileAuthService } from './mobile-auth.service';
import { PrismaIntegrationsRepository } from './repositories/prisma-integrations.repository';
import { PrismaEndpointsRepository } from './repositories/prisma-endpoints.repository';
import { PrismaFieldMappingsRepository } from './repositories/prisma-field-mappings.repository';
import { ApiKeyGateway } from './gateways/api-key.gateway';
import { BasicAuthGateway } from './gateways/basic-auth.gateway';
import { OAuth2Gateway } from './gateways/oauth2.gateway';
import { IntegrationGatewayFactory } from './gateways/integration-gateway.factory';
import { IntegrationEndpointExecutorService } from './services/integration-endpoint-executor.service';
import { ResponseFieldDetectorService } from './services/response-field-detector.service';
import { FieldMappingService } from './services/field-mapping.service';
import { HrLiveFetchService } from './services/hr-live-fetch.service';
import { HrLookupController } from './hr-lookup.controller';
import { HrLookupService } from './hr-lookup.service';

/**
 * Integrations module — configuration records (integration_master) via
 * IntegrationsController/Service, endpoint configuration (integration_detail)
 * via EndpointsController/Service, the auth-gateway factory
 * (ApiKeyGateway/BasicAuthGateway/OAuth2Gateway + IntegrationGatewayFactory),
 * the request executor (IntegrationEndpointExecutorService), the two
 * stateless tools (ResponseFieldDetectorService/FieldMappingService) behind
 * IntegrationToolsController, persisted field mappings
 * (integration_field_mapping) via FieldMappingsController/FieldMappingsService,
 * and the live HR-employee capability (HrEmployeesController/
 * HrEmployeesService), which reuses IntegrationEndpointExecutorService and
 * FieldMappingService rather than adding a second execution/mapping path.
 *
 * Phase 2/Part B adds AttendancePunchController/AttendancePunchService —
 * the mobile app's own attendance-punch route. It forwards a punch to HR
 * via the exact same executor + field-mapping engine as everything else
 * here, with no persistence step of its own (see AttendancePunchService's
 * doc comment). It needs EmployeesModule (now exported — see that module)
 * to resolve the calling Employee's externalEmployeeId.
 *
 * Phase 2/Part C adds HrLiveFetchService — the shared "resolve a company's
 * own integration, find a purpose endpoint, fetch + map it live" helper
 * used by AttendanceModule and LeaveModule (both live outside this module,
 * so it's exported here, unlike HrEmployeesService which is only ever used
 * from within this module's own controller). See that file's own doc
 * comment for why it's a separate class from HrEmployeesService.
 *
 * Employee Sync adds EmployeeSyncService (the reconciliation logic,
 * triggered by HrEmployeesController's "Sync Now" route) and
 * EmployeeSyncSchedulerService (the same logic on a timer, via @Interval).
 * Both live here rather than in EmployeesModule because EmployeesModule
 * does not import IntegrationsModule — the dependency only runs one way
 * (this module already imports EmployeesModule and already provides
 * HrEmployeesService), so putting them in EmployeesModule instead would
 * create a circular dependency. Neither is exported: nothing outside this
 * module calls them directly. ScheduleModule.forRoot() itself is registered
 * once in AppModule, not here — @nestjs/schedule discovers @Interval/@Cron
 * methods across the whole application once that's done, regardless of
 * which module declares them.
 *
 * Mobile Login adds MobileAuthController/MobileAuthService
 * (POST /auth/mobile/login) — the mobile app's own authentication route,
 * distinct from AuthController's web admin /auth/login. Lives here rather
 * than in AuthModule for the same reason AttendancePunchService/
 * EmployeeSyncService do: it needs this module's own executor/endpoints/
 * field-mapping providers plus EmployeesModule, and AuthModule cannot
 * import IntegrationsModule back (this module already imports AuthModule)
 * without creating a cycle. Session issuance reuses AuthModule's exported
 * JwtModule and PrismaSessionsRepository directly rather than adding
 * AuthService itself to AuthModule's exports for this one caller — see
 * MobileAuthService's own doc comment.
 *
 * LovModule is imported here (not made global) because, right now, the
 * Integrations module is the only consumer of LOV data in this codebase —
 * see src/lov/constants/lov-groups.constant.ts.
 *
 * SettingsModule is imported so IntegrationsService can inject
 * SettingsService and check the "Integration Warnings" notification toggle
 * whenever a company's integration status is set to DISCONNECTED — see
 * SettingsModule's own doc comment for why this can never become a
 * circular dependency (it's a leaf module).
 *
 * InMemoryIntegrationsRepository is still not wired in here — see the
 * original migration report.
 */
@Module({
  imports: [SystemLogsModule, AuthModule, CompaniesModule, EmployeesModule, LovModule, SettingsModule],
  controllers: [
    IntegrationsController,
    EndpointsController,
    IntegrationToolsController,
    FieldMappingsController,
    HrEmployeesController,
    AttendancePunchController,
    MobileAuthController,
    HrLookupController,
  ],
  providers: [
    IntegrationsService,
    PrismaIntegrationsRepository,
    EndpointsService,
    PrismaEndpointsRepository,
    FieldMappingsService,
    PrismaFieldMappingsRepository,
    HrEmployeesService,
    EmployeeSyncService,
    EmployeeSyncSchedulerService,
    AttendancePunchService,
    LeaveApplyService,
    LoginSessionService,
    QrAttendanceService,
    MobileAuthService,
    ApiKeyGateway,
    BasicAuthGateway,
    OAuth2Gateway,
    IntegrationGatewayFactory,
    IntegrationEndpointExecutorService,
    ResponseFieldDetectorService,
    FieldMappingService,
    HrLiveFetchService,
    HrLookupService,
  ],
  exports: [PrismaIntegrationsRepository, HrLiveFetchService],
})
export class IntegrationsModule {}

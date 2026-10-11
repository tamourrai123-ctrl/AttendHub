import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/constants/roles.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { ok, okMessage } from '../common/dto/api-response.dto';
import { InMemoryUsersRepository } from '../auth/repositories/in-memory-users.repository';
import { IntegrationsService } from './integrations.service';
import { CreateIntegrationDto } from './dto/create-integration.dto';
import { UpdateIntegrationDto } from './dto/update-integration.dto';
import { UpdateIntegrationStatusDto } from './dto/update-integration-status.dto';

/**
 * integration_master's real primary key is composite: (company_id, id) —
 * see the Integrations migration report, section E. SUPER_ADMIN has no
 * ambient company (AuthenticatedUser.companyId is undefined for that
 * role), so GET/PATCH(status)/DELETE by id require a `companyId` query
 * parameter identifying which company's row is meant.
 *
 * RBAC (revised — connection ownership moved to Company Admin):
 * - findAll: Super Admin only (platform-wide list — unchanged).
 * - findOne: Super Admin + Company Admin, scoped to their own company via
 *   resolveCompanyId() — this is Super Admin's "view" capability over a
 *   specific company's integration.
 * - create: Company Admin only, always for their own company. companyId is
 *   taken from the session (@CurrentUser()), never the request body — see
 *   CreateIntegrationDto's doc comment for why. Super Admin can no longer
 *   create a company's integration.
 * - update (full edit — integrationType/authType/baseUrl/credentials, and
 *   still status too since it's their own integration): Company Admin
 *   only. Super Admin no longer has blanket write access here.
 * - updateStatus (activate/deactivate ONLY): Super Admin only, via its own
 *   narrow route + DTO that cannot carry baseUrl/apiKey/apiSecret/type
 *   even by accident.
 * - remove: Super Admin + Company Admin — both may delete, unchanged.
 *
 * A COMPANY_ADMIN may use the id-based routes only for their own company:
 * resolveCompanyId() rejects any mismatch with 403 before the service is
 * ever called, so the authenticated company can never be overridden by an
 * arbitrary query value, and a missing companyId is rejected with 400
 * rather than silently resolving to "no filter".
 *
 * findAll's response shape: paginated { items, meta }, same as every other
 * list endpoint in the app (Companies/Employees) — see the Prisma
 * repository audit report.
 */
@ApiTags('integrations')
@ApiBearerAuth()
@Controller('integrations')
@Roles(Role.SUPER_ADMIN)
export class IntegrationsController {
  constructor(
    private readonly integrationsService: IntegrationsService,
    private readonly usersRepository: InMemoryUsersRepository,
  ) {}

  private actorName(user: AuthenticatedUser): string {
    return this.usersRepository.findById(user.userId)?.name ?? user.userId;
  }

  /**
   * Requires companyId to be present, and — for anyone other than
   * SUPER_ADMIN — requires it to match the caller's own company. Never
   * trusts the query value on its own for a company-scoped caller.
   */
  private resolveCompanyId(user: AuthenticatedUser, companyId: string | undefined): string {
    if (!companyId) {
      throw new BadRequestException('companyId query parameter is required.');
    }
    if (user.role !== Role.SUPER_ADMIN && user.companyId !== companyId) {
      throw new ForbiddenException("You do not have permission to access this company's integration.");
    }
    return companyId;
  }

  @Get()
  @ApiOperation({ summary: 'List integration configuration records, paginated (Super Admin only).' })
  async findAll(@Query() query: PaginationQueryDto) {
    return ok(await this.integrationsService.findAll(query.page ?? 1, query.limit ?? 20));
  }

  /**
   * Placed before the ':id' route on purpose — Nest matches routes in
   * declaration order, and 'mine' would otherwise be swallowed by ':id'
   * (Nest would try to look up an integration literally named "mine").
   *
   * Company Admin's own "do we have an integration yet" check — no id to
   * pass, since a brand-new company hasn't created one and the frontend
   * shouldn't have to separately remember its id. Returns `null` (not a
   * 404) when none exists yet; that is this route's normal "not set up"
   * response, not an error.
   */
  @Get('mine')
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({ summary: "Get the caller's own company's integration, if one exists (Company Admin only)." })
  async findMine(@CurrentUser() user: AuthenticatedUser) {
    if (!user.companyId) {
      throw new BadRequestException('Your session has no associated company.');
    }
    const integration = await this.integrationsService.findMineForCompany(user.companyId);
    return ok(integration ?? null);
  }

  @Get(':id')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN)
  @ApiQuery({ name: 'companyId', required: true, description: "Company this integration belongs to — required, the real primary key is composite (company_id, id)." })
  @ApiOperation({ summary: 'Get one integration configuration record, scoped to the given company.' })
  async findOne(
    @Param('id') id: string,
    @Query('companyId') companyId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const resolvedCompanyId = this.resolveCompanyId(user, companyId);
    return ok(await this.integrationsService.findOneForCompany(resolvedCompanyId, id));
  }

  @Post()
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({
    summary: "Create an integration configuration record for the caller's own company (Company Admin only).",
    description:
      "Creates a configuration record only — does not make any real outbound call to an HR system. companyId is " +
      "always the caller's own company, taken from the session; it is not a request field.",
  })
  async create(@Body() dto: CreateIntegrationDto, @CurrentUser() user: AuthenticatedUser) {
    if (!user.companyId) {
      throw new BadRequestException('Your session has no associated company.');
    }
    return ok(await this.integrationsService.create(user.companyId, dto, this.actorName(user)));
  }

  @Patch(':id')
  @Roles(Role.COMPANY_ADMIN)
  @ApiQuery({ name: 'companyId', required: true, description: "Company this integration belongs to — required, the real primary key is composite (company_id, id)." })
  @ApiOperation({ summary: "Update an integration configuration record's full configuration (Company Admin only)." })
  async update(
    @Param('id') id: string,
    @Query('companyId') companyId: string | undefined,
    @Body() dto: UpdateIntegrationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const resolvedCompanyId = this.resolveCompanyId(user, companyId);
    return ok(await this.integrationsService.updateForCompany(resolvedCompanyId, id, dto, this.actorName(user)));
  }

  /**
   * Base-connection-only test — no endpoint required (Endpoints tab is
   * gated behind this passing; see EndpointsController for endpoint-level
   * testing once endpoints exist). Company Admin only, since this exercises
   * their own stored credentials; Super Admin has no need to trigger it.
   */
  @Post(':id/test-connection')
  @Roles(Role.COMPANY_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiQuery({ name: 'companyId', required: true, description: "Company this integration belongs to — required, the real primary key is composite (company_id, id)." })
  @ApiOperation({
    summary: "Test an integration's base connection (reachability only, no business endpoint) — Company Admin only.",
    description:
      "Attaches the stored credentials to a plain GET against the integration's base URL. Any completed HTTP " +
      "response (even 401/404) is reported as reachable — only a network-level failure (DNS/timeout/connection " +
      "refused) is not. Does not assert the credentials are correct, since there is no business endpoint yet to " +
      "judge that against.",
  })
  async testConnection(
    @Param('id') id: string,
    @Query('companyId') companyId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const resolvedCompanyId = this.resolveCompanyId(user, companyId);
    return ok(await this.integrationsService.testConnection(resolvedCompanyId, id, this.actorName(user)));
  }

  @Patch(':id/status')
  @Roles(Role.SUPER_ADMIN)
  @ApiQuery({ name: 'companyId', required: true, description: "Company this integration belongs to — required, the real primary key is composite (company_id, id)." })
  @ApiOperation({
    summary: "Activate or deactivate a company's integration (Super Admin only).",
    description:
      'Narrow status-only toggle. Cannot change integrationType/authType/baseUrl/apiKey/apiSecret — use the ' +
      'Company-Admin-only full update route for that.',
  })
  async updateStatus(
    @Param('id') id: string,
    @Query('companyId') companyId: string | undefined,
    @Body() dto: UpdateIntegrationStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const resolvedCompanyId = this.resolveCompanyId(user, companyId);
    return ok(
      await this.integrationsService.setStatusForCompany(resolvedCompanyId, id, dto.status, this.actorName(user)),
    );
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiQuery({ name: 'companyId', required: true, description: "Company this integration belongs to — required, the real primary key is composite (company_id, id)." })
  @ApiOperation({ summary: 'Delete an integration configuration record, scoped to the given company.' })
  async remove(
    @Param('id') id: string,
    @Query('companyId') companyId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const resolvedCompanyId = this.resolveCompanyId(user, companyId);
    await this.integrationsService.removeForCompany(resolvedCompanyId, id, this.actorName(user));
    return okMessage('Integration deleted successfully.');
  }
}

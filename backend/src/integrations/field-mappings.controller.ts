import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/constants/roles.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { ok, okMessage } from '../common/dto/api-response.dto';
import { InMemoryUsersRepository } from '../auth/repositories/in-memory-users.repository';
import { FieldMappingsService } from './field-mappings.service';
import { CreateFieldMappingDto } from './dto/create-field-mapping.dto';
import { UpdateFieldMappingDto } from './dto/update-field-mapping.dto';
import { ListFieldMappingsQueryDto } from './dto/list-field-mappings-query.dto';

/**
 * Persisted field-mapping (integration_field_mapping) CRUD, nested under a
 * specific endpoint under a specific integration:
 * /integrations/:integrationId/endpoints/:endpointId/mappings.
 *
 * Uses the exact same companyId-resolution pattern as
 * EndpointsController/IntegrationsController (a required `companyId` query
 * parameter, checked against the caller's own company for anyone other than
 * SUPER_ADMIN) — see IntegrationsController's resolveCompanyId() for the
 * original rationale.
 *
 * RBAC (revised — field mapping ownership moved fully to Company Admin):
 * - findAll/findOne: Super Admin + Company Admin. Super Admin can view a
 *   specific company's field mappings from their dashboard, but not edit
 *   them.
 * - create/update/remove: Company Admin only — the same day-to-day
 *   configuration authority they already have over that integration's
 *   endpoints. EMPLOYEE has none of this (the @Roles guard rejects it
 *   before any handler runs).
 */
@ApiTags('integration-field-mappings')
@ApiBearerAuth()
@Controller('integrations/:integrationId/endpoints/:endpointId/mappings')
@Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN)
export class FieldMappingsController {
  constructor(
    private readonly fieldMappingsService: FieldMappingsService,
    private readonly usersRepository: InMemoryUsersRepository,
  ) {}

  private actorName(user: AuthenticatedUser): string {
    return this.usersRepository.findById(user.userId)?.name ?? user.userId;
  }

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
  @ApiQuery({ name: 'companyId', required: true })
  @ApiOperation({ summary: 'List field mappings configured under one endpoint, paginated, ordered by sortOrder.' })
  async findAll(
    @Param('integrationId') integrationId: string,
    @Param('endpointId') endpointId: string,
    @Query() query: ListFieldMappingsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const resolvedCompanyId = this.resolveCompanyId(user, query.companyId);
    return ok(
      await this.fieldMappingsService.findAll(resolvedCompanyId, integrationId, endpointId, query.page ?? 1, query.limit ?? 20),
    );
  }

  @Get(':mappingId')
  @ApiQuery({ name: 'companyId', required: true })
  @ApiOperation({ summary: 'Get one field mapping.' })
  async findOne(
    @Param('integrationId') integrationId: string,
    @Param('endpointId') endpointId: string,
    @Param('mappingId') mappingId: string,
    @Query('companyId') companyId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const resolvedCompanyId = this.resolveCompanyId(user, companyId);
    return ok(await this.fieldMappingsService.findOne(resolvedCompanyId, integrationId, endpointId, mappingId));
  }

  @Post()
  @Roles(Role.COMPANY_ADMIN)
  @ApiQuery({ name: 'companyId', required: true })
  @ApiOperation({ summary: 'Create a field mapping under this endpoint (Company Admin only).' })
  async create(
    @Param('integrationId') integrationId: string,
    @Param('endpointId') endpointId: string,
    @Query('companyId') companyId: string | undefined,
    @Body() dto: CreateFieldMappingDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const resolvedCompanyId = this.resolveCompanyId(user, companyId);
    return ok(await this.fieldMappingsService.create(resolvedCompanyId, integrationId, endpointId, dto, this.actorName(user)));
  }

  @Patch(':mappingId')
  @Roles(Role.COMPANY_ADMIN)
  @ApiQuery({ name: 'companyId', required: true })
  @ApiOperation({ summary: 'Update a field mapping (Company Admin only).' })
  async update(
    @Param('integrationId') integrationId: string,
    @Param('endpointId') endpointId: string,
    @Param('mappingId') mappingId: string,
    @Query('companyId') companyId: string | undefined,
    @Body() dto: UpdateFieldMappingDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const resolvedCompanyId = this.resolveCompanyId(user, companyId);
    return ok(
      await this.fieldMappingsService.update(resolvedCompanyId, integrationId, endpointId, mappingId, dto, this.actorName(user)),
    );
  }

  @Delete(':mappingId')
  @Roles(Role.COMPANY_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiQuery({ name: 'companyId', required: true })
  @ApiOperation({ summary: 'Delete a field mapping (Company Admin only).' })
  async remove(
    @Param('integrationId') integrationId: string,
    @Param('endpointId') endpointId: string,
    @Param('mappingId') mappingId: string,
    @Query('companyId') companyId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const resolvedCompanyId = this.resolveCompanyId(user, companyId);
    await this.fieldMappingsService.remove(resolvedCompanyId, integrationId, endpointId, mappingId, this.actorName(user));
    return okMessage('Field mapping deleted successfully.');
  }
}

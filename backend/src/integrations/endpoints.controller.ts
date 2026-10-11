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
import { ok, okMessage } from '../common/dto/api-response.dto';
import { InMemoryUsersRepository } from '../auth/repositories/in-memory-users.repository';
import { EndpointsService } from './endpoints.service';
import { CreateEndpointDto } from './dto/create-endpoint.dto';
import { UpdateEndpointDto } from './dto/update-endpoint.dto';
import { TestEndpointDto } from './dto/test-endpoint.dto';
import { ListEndpointsQueryDto } from './dto/list-endpoints-query.dto';

/**
 * Endpoint (integration_detail) CRUD + the sanitized test-endpoint route,
 * nested under a specific integration: /integrations/:integrationId/endpoints.
 *
 * Uses the exact same companyId-resolution pattern as IntegrationsController
 * (a required `companyId` query parameter, checked against the caller's own
 * company for anyone other than SUPER_ADMIN) — see that controller's
 * resolveCompanyId() for the original rationale.
 *
 * RBAC (revised — endpoint management moved fully to Company Admin):
 * - findAll/findOne: Super Admin + Company Admin. This is Super Admin's
 *   "view" capability — they can see a specific company's endpoints from
 *   their dashboard, but cannot change them.
 * - create/update/remove/test: Company Admin only. Configuring which
 *   endpoints an integration exposes, and testing them, is day-to-day setup
 *   that belongs entirely to the company that owns the integration; Super
 *   Admin no longer has write access here.
 */
@ApiTags('integration-endpoints')
@ApiBearerAuth()
@Controller('integrations/:integrationId/endpoints')
@Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN)
export class EndpointsController {
  constructor(
    private readonly endpointsService: EndpointsService,
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
  @ApiOperation({ summary: 'List endpoints configured under one integration, paginated.' })
  async findAll(
    @Param('integrationId') integrationId: string,
    @Query() query: ListEndpointsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const resolvedCompanyId = this.resolveCompanyId(user, query.companyId);
    return ok(await this.endpointsService.findAll(resolvedCompanyId, integrationId, query.page ?? 1, query.limit ?? 20));
  }

  @Get(':endpointId')
  @ApiQuery({ name: 'companyId', required: true })
  @ApiOperation({ summary: 'Get one endpoint.' })
  async findOne(
    @Param('integrationId') integrationId: string,
    @Param('endpointId') endpointId: string,
    @Query('companyId') companyId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const resolvedCompanyId = this.resolveCompanyId(user, companyId);
    return ok(await this.endpointsService.findOne(resolvedCompanyId, integrationId, endpointId));
  }

  @Post()
  @Roles(Role.COMPANY_ADMIN)
  @ApiQuery({ name: 'companyId', required: true })
  @ApiOperation({ summary: 'Create an endpoint under this integration (Company Admin only).' })
  async create(
    @Param('integrationId') integrationId: string,
    @Query('companyId') companyId: string | undefined,
    @Body() dto: CreateEndpointDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const resolvedCompanyId = this.resolveCompanyId(user, companyId);
    return ok(await this.endpointsService.create(resolvedCompanyId, integrationId, dto, this.actorName(user)));
  }

  @Patch(':endpointId')
  @Roles(Role.COMPANY_ADMIN)
  @ApiQuery({ name: 'companyId', required: true })
  @ApiOperation({ summary: 'Update an endpoint (Company Admin only).' })
  async update(
    @Param('integrationId') integrationId: string,
    @Param('endpointId') endpointId: string,
    @Query('companyId') companyId: string | undefined,
    @Body() dto: UpdateEndpointDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const resolvedCompanyId = this.resolveCompanyId(user, companyId);
    return ok(await this.endpointsService.update(resolvedCompanyId, integrationId, endpointId, dto, this.actorName(user)));
  }

  @Delete(':endpointId')
  @Roles(Role.COMPANY_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiQuery({ name: 'companyId', required: true })
  @ApiOperation({ summary: 'Delete an endpoint (Company Admin only).' })
  async remove(
    @Param('integrationId') integrationId: string,
    @Param('endpointId') endpointId: string,
    @Query('companyId') companyId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const resolvedCompanyId = this.resolveCompanyId(user, companyId);
    await this.endpointsService.remove(resolvedCompanyId, integrationId, endpointId, this.actorName(user));
    return okMessage('Endpoint deleted successfully.');
  }

  @Post(':endpointId/test')
  @Roles(Role.COMPANY_ADMIN)
  @ApiQuery({ name: 'companyId', required: true })
  @ApiOperation({
    summary: 'Test this endpoint with a real outbound call (Company Admin only).',
    description:
      'Executes a real call to the external HR system using this integration\'s configured auth. Never returns ' +
      'credentials or resolved auth headers — only the outcome, a bounded sample of the response body, and its ' +
      'detected field shape.',
  })
  async test(
    @Param('integrationId') integrationId: string,
    @Param('endpointId') endpointId: string,
    @Query('companyId') companyId: string | undefined,
    @Body() dto: TestEndpointDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const resolvedCompanyId = this.resolveCompanyId(user, companyId);
    return ok(
      await this.endpointsService.testEndpoint(
        resolvedCompanyId,
        integrationId,
        endpointId,
        dto.queryParams,
        this.actorName(user),
        dto.sampleRecord,
      ),
    );
  }
}

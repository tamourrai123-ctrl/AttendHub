import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/constants/roles.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { ok, okMessage } from '../common/dto/api-response.dto';
import { InMemoryUsersRepository } from '../auth/repositories/in-memory-users.repository';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { UpdateCompanySettingsDto } from './dto/update-company-settings.dto';

/**
 * Super Admin only by default (class-level @Roles) — this is the global
 * list of tenant companies, not scoped to any single company (see
 * EmployeesController for the tenant-scoped equivalent).
 *
 * The two "mine" routes below are the one exception: they carry their own
 * @Roles(Role.COMPANY_ADMIN), which overrides the class-level decorator
 * (RolesGuard reads the closest one via Reflector.getAllAndOverride() — the
 * same pattern SystemLogsController/IntegrationsController use for their own
 * Company-Admin-facing routes). They must stay declared before their
 * `:id`-shaped siblings (@Get(':id')/@Patch(':id')) or Nest will try to
 * match "mine" as an id.
 */
@ApiTags('companies')
@ApiBearerAuth()
@Controller('companies')
@Roles(Role.SUPER_ADMIN)
export class CompaniesController {
  constructor(
    private readonly companiesService: CompaniesService,
    private readonly usersRepository: InMemoryUsersRepository,
  ) {}

  private actorName(user: AuthenticatedUser): string {
    return this.usersRepository.findById(user.userId)?.name ?? user.userId;
  }

  private requireCompanyId(user: AuthenticatedUser): string {
    if (!user.companyId) {
      throw new ForbiddenException('This account is not associated with a company.');
    }
    return user.companyId;
  }

  @Get()
  @ApiOperation({ summary: 'List all companies on the platform (Super Admin only).' })
  async findAll(@Query() query: PaginationQueryDto) {
    return ok(await this.companiesService.findAll(query.page ?? 1, query.limit ?? 20));
  }

  /**
   * Company Admin's own "Company Settings" page (Phase 2 follow-up). Only
   * the profile fields that actually exist on `usm_company` for a Company
   * Admin to see/edit — see interfaces/company-settings.interface.ts.
   */
  @Get('mine')
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({ summary: "Get the authenticated Company Admin's own company settings." })
  async findMine(@CurrentUser() user: AuthenticatedUser) {
    return ok(await this.companiesService.findMySettings(this.requireCompanyId(user)));
  }

  @Patch('mine')
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({ summary: "Update the authenticated Company Admin's own company settings." })
  async updateMine(@Body() dto: UpdateCompanySettingsDto, @CurrentUser() user: AuthenticatedUser) {
    return ok(await this.companiesService.updateMySettings(this.requireCompanyId(user), dto, this.actorName(user)));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one company by id (Super Admin only).' })
  async findOne(@Param('id') id: string) {
    return ok(await this.companiesService.findOne(id));
  }

  @Post()
  @ApiOperation({ summary: 'Create a new company (Super Admin only).' })
  async create(@Body() dto: CreateCompanyDto, @CurrentUser() user: AuthenticatedUser) {
    return ok(await this.companiesService.create(dto, this.actorName(user)));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a company (Super Admin only).' })
  async update(@Param('id') id: string, @Body() dto: UpdateCompanyDto, @CurrentUser() user: AuthenticatedUser) {
    return ok(await this.companiesService.update(id, dto, this.actorName(user)));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a company (Super Admin only).' })
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.companiesService.remove(id, this.actorName(user));
    return okMessage('Company deleted successfully.');
  }
}

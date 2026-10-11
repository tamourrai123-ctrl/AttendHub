import { Controller, ForbiddenException, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/constants/roles.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { ok } from '../common/dto/api-response.dto';
import { SystemLogsService } from './system-logs.service';

@ApiTags('system-logs')
@ApiBearerAuth()
@Controller('system-logs')
@Roles(Role.SUPER_ADMIN)
export class SystemLogsController {
  constructor(private readonly systemLogsService: SystemLogsService) {}

  @Get()
  @ApiOperation({ summary: 'List platform system/audit logs (Super Admin only).' })
  async findAll(@Query() query: PaginationQueryDto) {
    return ok(await this.systemLogsService.findAll(query.page ?? 1, query.limit ?? 20));
  }

  /**
   * Phase 2/Part C follow-up — the Company Admin's own "recent activity"
   * feed (used by the Dashboard's Recent Activity panel). Declared before
   * the `:id` route below so NestJS doesn't try to match "mine" as an id.
   *
   * `@Roles(Role.COMPANY_ADMIN)` here overrides the class-level
   * `@Roles(Role.SUPER_ADMIN)` — RolesGuard reads the closest decorator via
   * Reflector.getAllAndOverride(), so a method-level @Roles always wins over
   * the class-level one, the same pattern AttendanceController/LeaveController
   * use for their own per-route role splits.
   */
  @Get('mine')
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({ summary: "List the authenticated Company Admin's own company's recent activity." })
  async findMine(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    if (!user.companyId) {
      throw new ForbiddenException('This account is not associated with a company.');
    }
    return ok(await this.systemLogsService.findAllForCompany(user.companyId, query.page ?? 1, query.limit ?? 20));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one system log entry, including its metadata (Super Admin only).' })
  async findOne(@Param('id') id: string) {
    const entry = await this.systemLogsService.findById(id);
    if (!entry) {
      throw new NotFoundException('System log entry not found.');
    }
    return ok(entry);
  }
}

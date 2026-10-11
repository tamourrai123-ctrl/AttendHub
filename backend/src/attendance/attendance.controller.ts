import { Controller, ForbiddenException, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/constants/roles.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { ok } from '../common/dto/api-response.dto';
import { AttendanceService } from './attendance.service';
import { AttendanceQueryDto } from './dto/attendance-query.dto';

/**
 * Read-only. There is intentionally no POST/PATCH/DELETE anywhere in this
 * controller — see AttendanceService's class comment. HR software remains
 * the authoritative source of attendance; this API only ever surfaces what
 * it fetches live from HR, on every call (Phase 2/Part C).
 */
@ApiTags('attendance')
@ApiBearerAuth()
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get()
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({ summary: "List attendance for the authenticated Company Admin's own company, fetched live from HR." })
  async findForCompany(@CurrentUser() user: AuthenticatedUser, @Query() query: AttendanceQueryDto) {
    if (!user.companyId) {
      throw new ForbiddenException('This account is not associated with a company.');
    }
    return ok(await this.attendanceService.findForCompany(user.companyId, query));
  }

  @Get('me')
  @Roles(Role.EMPLOYEE)
  @ApiOperation({ summary: "List the authenticated Employee's own attendance only, fetched live from HR." })
  async findForSelf(@CurrentUser() user: AuthenticatedUser, @Query() query: AttendanceQueryDto) {
    if (!user.companyId) {
      throw new ForbiddenException('This account is not associated with a company.');
    }
    if (!user.employeeId) {
      throw new ForbiddenException('This account has no associated employee profile.');
    }
    // employeeId always comes from the session — a client-supplied
    // employeeId in the query string is never trusted for this route.
    return ok(await this.attendanceService.findForEmployee(user.companyId, user.employeeId, query));
  }
}

import { Controller, ForbiddenException, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/constants/roles.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { ok } from '../common/dto/api-response.dto';
import { ReportsService } from './reports.service';
import { AttendanceReportQueryDto } from './dto/attendance-report-query.dto';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
@Roles(Role.COMPANY_ADMIN)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('attendance')
  @ApiOperation({ summary: "Simple attendance report for the caller's own company, aggregated from live HR attendance data." })
  async attendanceReport(@CurrentUser() user: AuthenticatedUser, @Query() query: AttendanceReportQueryDto) {
    if (!user.companyId) {
      throw new ForbiddenException('This account is not associated with a company.');
    }
    return ok(await this.reportsService.attendanceReport(user.companyId, query));
  }
}

import { Body, Controller, ForbiddenException, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/constants/roles.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { okMessage } from '../common/dto/api-response.dto';
import { nameFromStatelessUserKey } from './utils/stateless-session.util';
import { AttendancePunchService } from './attendance-punch.service';
import { PostAttendancePunchDto } from './dto/post-attendance-punch.dto';

/**
 * Mobile-app-facing route (Phase 2/Part B) — a separate controller class
 * from the read-only AttendanceController (see that class's own doc
 * comment: "intentionally no POST/PATCH/DELETE anywhere in this
 * controller"). Sharing the "attendance" path segment is intentional
 * (still the same resource family) and does not collide with
 * GET /attendance or GET /attendance/me, which live on that other class.
 *
 * companyId/employeeId are always taken from the caller's own session
 * (@CurrentUser()), never the request body — same pattern used everywhere
 * else a tenant/identity field exists in this codebase.
 */
@ApiTags('attendance')
@ApiBearerAuth()
@Controller('attendance')
@Roles(Role.EMPLOYEE)
export class AttendancePunchController {
  constructor(private readonly attendancePunchService: AttendancePunchService) {}

  @Post('punch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Record the authenticated Employee's own attendance punch and forward it to their company's HR system immediately.",
    description:
      'Never stores the punch anywhere on AttendHub\'s own side — this is a pure pass-through to the company\'s ' +
      '"Attendance Post" endpoint via its configured field mapping. If forwarding to HR fails for any reason ' +
      '(HR system down, endpoint/mapping not configured, employee not linked to an HR record), this call fails ' +
      'and nothing is saved; the mobile app is expected to let the employee retry.',
  })
  async punch(@CurrentUser() user: AuthenticatedUser, @Body() dto: PostAttendancePunchDto) {
    if (!user.companyId || !user.employeeId) {
      throw new ForbiddenException('This account has no associated employee profile.');
    }
    await this.attendancePunchService.postPunch(user.companyId, user.employeeId, dto, nameFromStatelessUserKey(user.userId));
    return okMessage('Attendance recorded.');
  }
}

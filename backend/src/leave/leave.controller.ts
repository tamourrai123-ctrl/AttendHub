import { Controller, ForbiddenException, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/constants/roles.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { ok } from '../common/dto/api-response.dto';
import { LeaveService } from './leave.service';
import { LeaveQueryDto } from './dto/leave-query.dto';

/**
 * Company Admin, view-only. There is no employee-facing leave-request
 * endpoint anywhere in this module — that functionality lives in the
 * existing mobile app and is deliberately not duplicated here. Phase 2/Part
 * C: now a live leave-BALANCE view fetched from HR on every call, rather
 * than a locally-stored request/approval list — see LeaveRecord's doc
 * comment.
 */
@ApiTags('leave')
@ApiBearerAuth()
@Controller('leave')
@Roles(Role.COMPANY_ADMIN)
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  @Get()
  @ApiOperation({ summary: "List live leave balances for the authenticated Company Admin's own company (view-only)." })
  async findForCompany(@CurrentUser() user: AuthenticatedUser, @Query() query: LeaveQueryDto) {
    if (!user.companyId) {
      throw new ForbiddenException('This account is not associated with a company.');
    }
    return ok(await this.leaveService.findForCompany(user.companyId, query));
  }
}

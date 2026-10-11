import { Controller, ForbiddenException, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/constants/roles.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { ok } from '../common/dto/api-response.dto';
import { EmployeesService } from './employees.service';

/**
 * GET /api/me — an Employee's own profile.
 *
 * Deliberately its own controller/route rather than nested under
 * /api/employees/:id: both the companyId and the id used are always the
 * caller's own session claims (@CurrentUser()), never a client-supplied
 * value, so there is no way to request another employee's profile through
 * this endpoint at all — satisfies the composite-key lookup (company_id,
 * user_id) without ever trusting the request for either half of it.
 */
@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
@Roles(Role.EMPLOYEE)
export class MeController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @ApiOperation({ summary: "Get the authenticated Employee's own profile." })
  async getProfile(@CurrentUser() user: AuthenticatedUser) {
    if (!user.employeeId || !user.companyId) {
      throw new ForbiddenException('This account has no associated employee profile.');
    }
    return ok(await this.employeesService.findSelf(user.companyId, user.employeeId));
  }
}

import { Controller, ForbiddenException, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/constants/roles.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { ok } from '../common/dto/api-response.dto';
import { PaymentsService } from './payments.service';
import { ListPaymentsDto } from './dto/list-payments.dto';

@ApiTags('payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Super Admin: payment history of all companies (filter by companyId and status).' })
  async listAll(@Query() query: ListPaymentsDto) {
    return ok(await this.paymentsService.listAll(query));
  }

  @Get('mine')
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({ summary: "Company Admin: my company's payment history." })
  async mine(@CurrentUser() user: AuthenticatedUser, @Query() query: ListPaymentsDto) {
    if (!user.companyId) throw new ForbiddenException('This account is not tied to a company.');
    return ok(await this.paymentsService.listForCompany(user.companyId, query));
  }
}

import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/constants/roles.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { ok, okMessage } from '../common/dto/api-response.dto';
import { SubscriptionsService } from './subscriptions.service';
import { ChangePlanDto } from './dto/change-plan.dto';

/**
 * Plan / subscription routes. The company is ALWAYS taken from the caller's
 * own session for the /mine routes — never from the request.
 */
@ApiTags('subscription')
@ApiBearerAuth()
@Controller('subscription')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  private companyOf(user: AuthenticatedUser): string {
    if (!user.companyId) throw new ForbiddenException('This account is not tied to a company.');
    return user.companyId;
  }

  @Get('mine')
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({ summary: "Company Admin: my company's plan, trial status and app-user usage." })
  async mine(@CurrentUser() user: AuthenticatedUser) {
    return ok(await this.subscriptionsService.getSubscription(this.companyOf(user)));
  }

  @Post('mine/plan')
  @Roles(Role.COMPANY_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Company Admin: choose or change my company\'s plan (upgrade/downgrade).',
    description: 'Takes effect immediately (no payment step yet). A downgrade is refused while the company has more app users than the new plan allows.',
  })
  async changeMyPlan(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePlanDto) {
    const companyId = this.companyOf(user);
    const actor = await this.subscriptionsService.actorName(user.userId);
    return ok(await this.subscriptionsService.assignPlan(companyId, dto.planId, actor));
  }

  @Get('mine/app-users')
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Company Admin: employees currently holding a mobile-app seat on my plan.' })
  async myAppUsers(@CurrentUser() user: AuthenticatedUser) {
    return ok(await this.subscriptionsService.listAppUsers(this.companyOf(user)));
  }

  @Delete('mine/app-users/:externalEmployeeId')
  @Roles(Role.COMPANY_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Company Admin: free one app-user seat (e.g. an employee who left).',
    description: 'The employee takes a seat again on their next mobile login, if one is free.',
  })
  async removeMyAppUser(@CurrentUser() user: AuthenticatedUser, @Param('externalEmployeeId') externalEmployeeId: string) {
    const companyId = this.companyOf(user);
    const actor = await this.subscriptionsService.actorName(user.userId);
    await this.subscriptionsService.removeAppUser(companyId, externalEmployeeId, actor);
    return okMessage('App user removed.');
  }

  @Get('companies/:companyId')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: "Super Admin: any company's plan, trial status and app-user usage." })
  async forCompany(@Param('companyId') companyId: string) {
    return ok(await this.subscriptionsService.getSubscription(companyId));
  }

  @Post('companies/:companyId/plan')
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Super Admin: put a company on a plan." })
  async setCompanyPlan(@Param('companyId') companyId: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePlanDto) {
    const actor = await this.subscriptionsService.actorName(user.userId);
    return ok(await this.subscriptionsService.assignPlan(companyId, dto.planId, actor));
  }
}

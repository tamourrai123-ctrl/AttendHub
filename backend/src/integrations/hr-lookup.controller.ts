import { Body, Controller, ForbiddenException, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/constants/roles.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { ok, okMessage } from '../common/dto/api-response.dto';
import { HrLookupService } from './hr-lookup.service';
import { LoginSessionService } from './login-session.service';
import { QrAttendanceService } from './qr-attendance.service';
import { HrLoginSessionDto } from './dto/hr-login-session.dto';
import { HrWifiLookupDto } from './dto/hr-wifi-lookup.dto';
import { PostLeaveApplicationDto } from './dto/post-leave-application.dto';
import { LeaveApplyService } from './leave-apply.service';
import { nameFromStatelessUserKey } from './utils/stateless-session.util';
import { HrDeviceInfoLookupDto } from './dto/hr-device-info-lookup.dto';
import { HrCustomService } from './services/hr-custom.service';

/**
 * Mobile-app-facing live lookups, forwarded to the caller's own company's HR
 * system (see HrLookupService). companyId/employeeId always come from the
 * caller's session, never the request. Nothing is stored on the hub side.
 */
@ApiTags('hr')
@ApiBearerAuth()
@Controller('hr')
export class HrLookupController {
  constructor(
    private readonly hrLookupService: HrLookupService,
    private readonly loginSessionService: LoginSessionService,
    private readonly qrAttendanceService: QrAttendanceService,
    private readonly leaveApplyService: LeaveApplyService,
    private readonly hrCustomService: HrCustomService,
  ) {}

  @Get('company-info')
  @Roles(Role.EMPLOYEE, Role.COMPANY_ADMIN)
  @ApiOperation({ summary: "Live company settings (geo-fencing, wifi validation, server time, ...) from the caller's own company's HR system." })
  async companyInfo(@CurrentUser() user: AuthenticatedUser) {
    return ok(await this.hrLookupService.getCompanyInfo(this.requireCompany(user)));
  }

  @Get('shift')
  @Roles(Role.EMPLOYEE)
  @ApiOperation({ summary: "The authenticated Employee's own current shift, live from HR." })
  async shift(@CurrentUser() user: AuthenticatedUser) {
    const companyId = this.requireCompany(user);
    if (!user.employeeId) {
      throw new ForbiddenException('This session has no employee id.');
    }
    return ok(await this.hrLookupService.getShift(companyId, user.employeeId));
  }

  @Get('leave')
  @Roles(Role.EMPLOYEE)
  @ApiOperation({ summary: "The authenticated Employee's own leave report, live from HR (uses the company's LEAVE endpoint mapping)." })
  async leave(@CurrentUser() user: AuthenticatedUser) {
    const companyId = this.requireCompany(user);
    if (!user.employeeId) {
      throw new ForbiddenException('This session has no employee id.');
    }
    return ok(await this.hrLookupService.getLeave(companyId, user.employeeId));
  }

  @Post('leave')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.EMPLOYEE)
  @ApiOperation({
    summary: "Submit the authenticated Employee's leave application to their company's HR system.",
    description:
      'Pure pass-through to the company\'s "Apply for Leave" endpoint via its configured field mapping: nothing is stored on ' +
      "AttendHub's side. If HR is unreachable or rejects it, this call fails and the employee can retry. Employee identity " +
      'always comes from the session, never the body.',
  })
  async applyLeave(@CurrentUser() user: AuthenticatedUser, @Body() dto: PostLeaveApplicationDto) {
    if (!user.employeeId) {
      throw new ForbiddenException('This session has no employee id.');
    }
    await this.leaveApplyService.apply(this.requireCompany(user), user.employeeId, dto, nameFromStatelessUserKey(user.userId));
    return okMessage('Leave application submitted.');
  }

  @Get('holidays')
  @Roles(Role.EMPLOYEE, Role.COMPANY_ADMIN)
  @ApiOperation({ summary: "The company's holiday list, live from HR." })
  async holidays(@CurrentUser() user: AuthenticatedUser) {
    return ok(await this.hrLookupService.getHolidays(this.requireCompany(user), user.employeeId));
  }

  @Get('announcements')
  @Roles(Role.EMPLOYEE, Role.COMPANY_ADMIN)
  @ApiOperation({ summary: "The company's announcements, live from HR." })
  async announcements(@CurrentUser() user: AuthenticatedUser) {
    return ok(await this.hrLookupService.getAnnouncements(this.requireCompany(user), user.employeeId));
  }

  @Get('attendance-punches')
  @Roles(Role.EMPLOYEE)
  @ApiOperation({
    summary: "The authenticated Employee's own raw punch history, live from HR — one row per punch, NOT grouped into days.",
    description: 'The app groups punches into days itself. No date filter or paging: HR returns what it returns.',
  })
  async attendancePunches(@CurrentUser() user: AuthenticatedUser) {
    const companyId = this.requireCompany(user);
    if (!user.employeeId) {
      throw new ForbiddenException('This session has no employee id.');
    }
    return ok(await this.hrLookupService.getAttendancePunches(companyId, user.employeeId, user.userId));
  }

  @Post('wifi')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.EMPLOYEE)
  @ApiOperation({
    summary: 'Office WiFi information for one WiFi name, live from HR.',
    description: 'POST, not GET, on purpose: the WiFi name is sent in the body so it never appears in request-URL logs.',
  })
  async wifi(@CurrentUser() user: AuthenticatedUser, @Body() dto: HrWifiLookupDto) {
    return ok(await this.hrLookupService.getWifi(this.requireCompany(user), dto.wifiName));
  }

  @Post('device-info')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({
    summary: "A user's device/session record from the Company Admin's own company's HR system.",
    description:
      'Company Admin only. POST, not GET, on purpose: the username is sent in the body so it never appears in request-URL ' +
      'logs. Access/refresh tokens are returned only if the admin mapped them, only to the Company Admin, and are never logged or stored.',
  })
  async deviceInfo(@CurrentUser() user: AuthenticatedUser, @Body() dto: HrDeviceInfoLookupDto) {
    return ok(await this.hrLookupService.getDeviceInfo(this.requireCompany(user), dto.username));
  }

  @Post('login-session')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.EMPLOYEE)
  @ApiOperation({
    summary: "Register this device's login session with the caller's own company's HR system.",
    description:
      "Forwards the device facts through the company's \"Login Session\" endpoint mapping. company_id comes from the " +
      'session. Only the fields the admin mapped are sent; nothing is stored or logged.',
  })
  async loginSession(@CurrentUser() user: AuthenticatedUser, @Body() dto: HrLoginSessionDto) {
    if (!user.employeeId) {
      throw new ForbiddenException('This session has no employee id.');
    }
    return ok(await this.loginSessionService.register(this.requireCompany(user), user.employeeId, dto));
  }

  @Post('qr-attendance/generate')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({
    summary: "Ask the Company Admin's own company's HR system to generate a new QR attendance token.",
    description: "Forwards HR's post_qrcode_attendance call (HR replaces the previous token every 30 seconds). Returns only whether HR accepted it.",
  })
  async generateQrToken(@CurrentUser() user: AuthenticatedUser) {
    return ok(await this.qrAttendanceService.generate(this.requireCompany(user)));
  }

  @Get('custom')
  @Roles(Role.EMPLOYEE, Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Custom endpoints your company set up that this account may call, with the inputs each one needs.' })
  async customList(@CurrentUser() user: AuthenticatedUser) {
    return ok(await this.hrCustomService.list(this.customCaller(user)));
  }

  @Get('custom/:endpointName')
  @Roles(Role.EMPLOYEE, Role.COMPANY_ADMIN)
  @ApiOperation({
    summary: 'Call a custom GET endpoint by name.',
    description:
      'Every path placeholder the endpoint needs is read from the query string (e.g. ?date=20-OCT-2026). shortname is filled from your company; date defaults to today (DD-MON-YYYY). The reply goes through the endpoint\'s field mappings.',
  })
  async customGet(@CurrentUser() user: AuthenticatedUser, @Param('endpointName') endpointName: string, @Query() query: Record<string, unknown>) {
    return ok(await this.hrCustomService.call(this.customCaller(user), endpointName, query ?? {}, 'GET'));
  }

  @Post('custom/:endpointName')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.EMPLOYEE, Role.COMPANY_ADMIN)
  @ApiOperation({
    summary: 'Call a custom POST endpoint by name.',
    description: 'Body: { "params": { ...path placeholders }, "data": { ...record to send, in AttendHub field names } }. The record is sent through the endpoint\'s field mappings.',
  })
  async customPost(@CurrentUser() user: AuthenticatedUser, @Param('endpointName') endpointName: string, @Body() body: Record<string, unknown>) {
    return ok(await this.hrCustomService.call(this.customCaller(user), endpointName, body ?? {}, 'POST'));
  }

  private customCaller(user: AuthenticatedUser) {
    return { companyId: this.requireCompany(user), role: user.role, employeeId: user.employeeId, name: nameFromStatelessUserKey(user.userId) || undefined };
  }

  private requireCompany(user: AuthenticatedUser): string {
    if (!user.companyId) {
      throw new ForbiddenException('This account is not associated with a company.');
    }
    return user.companyId;
  }
}

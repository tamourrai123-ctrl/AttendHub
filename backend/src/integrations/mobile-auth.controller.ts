import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { ok, okMessage } from '../common/dto/api-response.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/constants/roles.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { MobileAuthService } from './mobile-auth.service';
import { MobileLoginDto } from './dto/mobile-login.dto';

/**
 * Mobile app authentication route — distinct from AuthController's
 * /auth/login (web admin, email + password checked against AttendHub's own
 * database). This route is @Public() (no bearer token required, same as
 * /auth/login) since it's how a session is obtained in the first place.
 *
 * Placed here, under IntegrationsModule, rather than AuthModule — see
 * MobileAuthService's own doc comment for why (avoids a circular module
 * dependency). The route path itself (`auth/mobile`) has no bearing on
 * which module physically declares the controller.
 */
@ApiTags('auth-mobile')
@Controller('auth/mobile')
export class MobileAuthController {
  constructor(private readonly mobileAuthService: MobileAuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mobile app employee login (Employee role) — distinct from the web admin /auth/login.',
    description:
      'Forwards the supplied username/password to the company\'s configured "Employee Login" HR endpoint — never ' +
      "checked against AttendHub's own database, since employee credentials live only in the connected HR system. " +
      'On success, resolves the HR-returned employee id to an already-linked AttendHub employee (see Employee ' +
      'Sync) and issues a session for them, plus the company\'s mobile-attendance config flags.',
  })
  @ApiBody({ type: MobileLoginDto })
  async login(@Body() dto: MobileLoginDto) {
    return ok(await this.mobileAuthService.login(dto));
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.EMPLOYEE)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Log out of the mobile app: revokes the caller's own session token.",
    description: 'The token stops working immediately. Idempotent. The app should also delete its stored token.',
  })
  async logout(@Headers('authorization') authorization: string) {
    await this.mobileAuthService.logout(bearerToken(authorization));
    return okMessage('Logged out.');
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.EMPLOYEE)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Swap a still-valid mobile session token for a new one with a fresh lifetime.',
    description:
      'Send the current token as the Bearer token; the response carries a NEW token (and its expiry) and the old one is ' +
      'revoked. An expired or revoked token cannot be refreshed — call this before the token expires, otherwise log in again. ' +
      'HR is not contacted, so the password is not re-checked.',
  })
  async refresh(@Headers('authorization') authorization: string, @CurrentUser() user: AuthenticatedUser) {
    return ok(await this.mobileAuthService.refresh(bearerToken(authorization), user));
  }
}

/** The raw token from an "Authorization: Bearer <token>" header (AuthGuard has already validated the header on these routes). */
function bearerToken(authorization: string | undefined): string {
  return (authorization ?? '').replace(/^Bearer\s+/i, '').trim();
}

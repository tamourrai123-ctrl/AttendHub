import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { ok } from '../common/dto/api-response.dto';
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
}

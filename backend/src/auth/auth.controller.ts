import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { ok, okMessage } from '../common/dto/api-response.dto';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { GoogleSignupDto } from './dto/google-signup.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log in.',
    description:
      'Verifies against real usm_users accounts (bcrypt-hashed passwords). The three legacy demo accounts ' +
      '(SUPER_ADMIN/COMPANY_ADMIN/EMPLOYEE) still work as a fallback for now — see AuthService\'s class doc comment.',
  })
  @ApiBody({ type: LoginDto })
  async login(@Body() dto: LoginDto) {
    return ok(await this.authService.login(dto));
  }

  @Public()
  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Self-signup: create a new company and its first admin account.',
    description:
      'Creates usm_company and its first usm_users admin row (is_admin=Y) in one transaction, sends a ' +
      'verification email (logged only — no real email provider is wired up yet), and logs the new admin in.',
  })
  @ApiBody({ type: SignupDto })
  async signup(@Body() dto: SignupDto) {
    return ok(await this.authService.signup(dto));
  }

  @Public()
  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Continue with Google (step 1): sign in, or start sign-up for a new email.',
    description:
      'Send the Google ID token. Returns { status: "LOGGED_IN", token, user } for an existing Company Admin ' +
      '(or the Super Admin whose email equals SUPER_ADMIN_EMAIL), or { status: "SIGNUP_REQUIRED", signupToken, email, name } ' +
      'for a new email — the frontend then shows the pricing page and company form and calls POST /auth/google/signup. ' +
      'The Google-verified email counts as verified.',
  })
  @ApiBody({ type: GoogleLoginDto })
  async google(@Body() dto: GoogleLoginDto) {
    return ok(await this.authService.googleLogin(dto));
  }

  @Public()
  @Post('google/signup')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Continue with Google (step 2): create the company + first Company Admin for a new Google user.',
    description:
      'Needs the signupToken from POST /auth/google plus company name, short name and the chosen planId. ' +
      'A plan with a free trial starts its trial now. Logs the new admin in.',
  })
  @ApiBody({ type: GoogleSignupDto })
  async googleSignup(@Body() dto: GoogleSignupDto) {
    return ok(await this.authService.googleSignup(dto));
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Log out and revoke the current session token.' })
  async logout(@Req() request: Request, @CurrentUser() user: AuthenticatedUser) {
    const token = (request.headers.authorization ?? '').replace('Bearer ', '').trim();
    await this.authService.logout(token, user);
    return okMessage('Logged out successfully.');
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get the current session's user identity (any authenticated role)." })
  async me(@CurrentUser() user: AuthenticatedUser) {
    return ok(await this.authService.me(user));
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request a password reset email.',
    description:
      'Always returns the same generic success message whether or not the email matches an account — this ' +
      'endpoint never reveals account existence.',
  })
  @ApiBody({ type: ForgotPasswordDto })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto);
    return okMessage('If an account with that email exists, password reset instructions have been sent.');
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete a password reset using the token emailed by /auth/forgot-password.' })
  @ApiBody({ type: ResetPasswordDto })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto);
    return okMessage('Your password has been reset. Please log in again.');
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Change the authenticated user's own password (requires the current password)." })
  @ApiBody({ type: ChangePasswordDto })
  async changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePasswordDto) {
    await this.authService.changePassword(user, dto);
    return okMessage('Your password has been changed. Please log in again.');
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify an email address using the token emailed at signup.' })
  @ApiBody({ type: VerifyEmailDto })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    await this.authService.verifyEmail(dto);
    return okMessage('Email address verified successfully.');
  }
}

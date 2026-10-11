import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Role } from '../common/constants/roles.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { ok, okMessage } from '../common/dto/api-response.dto';
import { InMemoryUsersRepository } from '../auth/repositories/in-memory-users.repository';
import { PricingService } from './pricing.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

/**
 * Mounted at /api/plans (not /api/pricing) to match the Phase 4B spec's
 * endpoint list exactly. No class-level @Roles() here — routes are guarded
 * individually because GET /api/plans is public and everything else is
 * Super Admin only.
 */
@ApiTags('plans')
@Controller('plans')
export class PlansController {
  constructor(
    private readonly pricingService: PricingService,
    private readonly usersRepository: InMemoryUsersRepository,
  ) {}

  private actorName(user: AuthenticatedUser): string {
    return this.usersRepository.findById(user.userId)?.name ?? user.userId;
  }

  @Get()
  @Public()
  @ApiOperation({
    summary: 'Public: list active pricing plans only.',
    description: 'No administrative fields exposed; inactive plans are never returned here.',
  })
  async findActive() {
    return ok(await this.pricingService.findActive());
  }

  @Get('all')
  @Roles(Role.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Super Admin: list every plan, including inactive ones.' })
  async findAll() {
    return ok(await this.pricingService.findAll());
  }

  @Get(':id')
  @Roles(Role.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get one plan by id (Super Admin only).' })
  async findOne(@Param('id') id: string) {
    return ok(await this.pricingService.findOne(id));
  }

  @Post()
  @Roles(Role.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a pricing plan (Super Admin only, maximum 5 plans total).' })
  async create(@Body() dto: CreatePlanDto, @CurrentUser() user: AuthenticatedUser) {
    return ok(await this.pricingService.create(dto, this.actorName(user)));
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a pricing plan (Super Admin only).' })
  async update(@Param('id') id: string, @Body() dto: UpdatePlanDto, @CurrentUser() user: AuthenticatedUser) {
    return ok(await this.pricingService.update(id, dto, this.actorName(user)));
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a pricing plan (Super Admin only).' })
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.pricingService.remove(id, this.actorName(user));
    return okMessage('Pricing plan deleted successfully.');
  }
}

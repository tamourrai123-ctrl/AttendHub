import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/constants/roles.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { ok, okMessage } from '../common/dto/api-response.dto';
import { InMemoryUsersRepository } from '../auth/repositories/in-memory-users.repository';
import { GlobalEndpointsService } from './global-endpoints.service';
import { CreateGlobalEndpointDto, ListGlobalEndpointsDto, UpdateGlobalEndpointDto } from './dto/global-endpoint.dto';

@ApiTags('global-endpoints')
@ApiBearerAuth()
@Controller('global-endpoints')
export class GlobalEndpointsController {
  constructor(
    private readonly service: GlobalEndpointsService,
    private readonly usersRepository: InMemoryUsersRepository,
  ) {}

  private actorName(user: AuthenticatedUser): string {
    return this.usersRepository.findById(user.userId)?.name ?? user.userId;
  }

  /** Declared before ":id" routes so "available" is never read as an id. */
  @Get('available')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Active global endpoints a Company Admin can pick when adding an endpoint.' })
  async available() {
    return ok(await this.service.available());
  }

  @Get()
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Super Admin: every global endpoint, paginated.' })
  async list(@Query() query: ListGlobalEndpointsDto) {
    return ok(await this.service.list(query.page ?? 1, query.limit ?? 20));
  }

  @Post()
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Super Admin: create a global endpoint.' })
  async create(@Body() dto: CreateGlobalEndpointDto, @CurrentUser() user: AuthenticatedUser) {
    return ok(await this.service.create(dto, this.actorName(user)));
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Super Admin: edit, enable or disable a global endpoint.' })
  async update(@Param('id') id: string, @Body() dto: UpdateGlobalEndpointDto, @CurrentUser() user: AuthenticatedUser) {
    return ok(await this.service.update(id, dto, this.actorName(user)));
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Super Admin: delete a global endpoint (company endpoints already made from it keep working).' })
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.service.remove(id, this.actorName(user));
    return okMessage('Global endpoint deleted successfully.');
  }
}

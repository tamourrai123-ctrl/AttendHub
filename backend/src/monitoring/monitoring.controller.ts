import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/constants/roles.enum';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { ok } from '../common/dto/api-response.dto';
import { MonitoringService } from './monitoring.service';

@ApiTags('monitoring')
@ApiBearerAuth()
@Controller('monitoring')
@Roles(Role.SUPER_ADMIN)
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  @Get()
  @ApiOperation({ summary: 'List recorded API requests, newest first (Super Admin only).' })
  async findAll(@Query() query: PaginationQueryDto) {
    return ok(await this.monitoringService.findAll(query.page ?? 1, query.limit ?? 20));
  }

  @Get('summary')
  @ApiOperation({ summary: "Today's request volume/success/failure/average response time (Super Admin only)." })
  async summary() {
    return ok(await this.monitoringService.summary());
  }
}

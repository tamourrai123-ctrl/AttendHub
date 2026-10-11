import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/constants/roles.enum';
import { ok } from '../common/dto/api-response.dto';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

/**
 * Mounted at /api/settings. Super Admin only — a platform-wide setting has
 * no per-company meaning, so unlike most other modules there's no
 * resolveCompanyId()-style scoping here at all.
 */
@ApiTags('settings')
@Controller('settings')
@Roles(Role.SUPER_ADMIN)
@ApiBearerAuth()
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get the current platform settings (Super Admin only).' })
  async findAll() {
    return ok(await this.settingsService.findAll());
  }

  @Patch()
  @ApiOperation({ summary: 'Update platform settings (Super Admin only). Only the fields provided are changed.' })
  async update(@Body() dto: UpdateSettingsDto) {
    return ok(await this.settingsService.update(dto));
  }
}

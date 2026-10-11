import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/constants/roles.enum';
import { ok } from '../common/dto/api-response.dto';
import { LovService } from '../lov/lov.service';
import { LOV_GROUPS } from '../lov/constants/lov-groups.constant';
import { ResponseFieldDetectorService } from './services/response-field-detector.service';
import { FieldMappingService } from './services/field-mapping.service';
import { DetectResponseFieldsDto } from './dto/detect-response-fields.dto';
import { PreviewFieldMappingDto } from './dto/preview-field-mapping.dto';
import { ENDPOINT_PURPOSES } from './constants/endpoint-purposes.constant';

/**
 * Stateless utility routes for the HR Integration Gateway frontend — none
 * of these touch a specific company's data or credentials, so none needs a
 * companyId/tenant check; they operate purely on their request body (or,
 * for auth-types, on shared LOV data). Kept separate from
 * EndpointsController/IntegrationsController, which are tenant-scoped, so
 * that distinction stays obvious from the routing alone.
 */
@ApiTags('integration-tools')
@ApiBearerAuth()
@Controller('integrations/tools')
@Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN)
export class IntegrationToolsController {
  constructor(
    private readonly lovService: LovService,
    private readonly fieldDetector: ResponseFieldDetectorService,
    private readonly fieldMappingService: FieldMappingService,
  ) {}

  @Get('auth-types')
  @ApiOperation({
    summary: 'List the currently configured integration auth type options (LOV-driven).',
    description:
      'Reads app_lov_master/app_lov_detail for the INTEGRATION_AUTH_TYPE group — returns [] if that group has not ' +
      'been seeded yet (see scripts/seed-integration-auth-type-lov.ts) rather than a hardcoded list.',
  })
  async authTypes() {
    return ok(await this.lovService.getActiveOptions(LOV_GROUPS.INTEGRATION_AUTH_TYPE));
  }

  @Get('endpoint-purposes')
  @ApiOperation({
    summary: 'List the fixed set of endpoint "purposes" (Phase 2) a Company Admin can configure, with each one\'s direction, default HTTP method, and fixed AttendHub-side field list.',
    description:
      'Static, code-defined reference data (see constants/endpoint-purposes.constant.ts) — not read from the ' +
      'database. Deliberately a fixed catalogue, not open-ended: see that file\'s doc comment for why.',
  })
  endpointPurposes() {
    return ok(ENDPOINT_PURPOSES);
  }

  @Post('detect-response-fields')
  @ApiOperation({ summary: 'Detect the structural field shape of a sample JSON response (no live call).' })
  detectResponseFields(@Body() dto: DetectResponseFieldsDto) {
    return ok({ fields: this.fieldDetector.detect(dto.sampleResponse) });
  }

  @Post('preview-field-mapping')
  @ApiOperation({ summary: 'Apply a set of field mappings to one sample record and return the mapped output.' })
  previewFieldMapping(@Body() dto: PreviewFieldMappingDto) {
    return ok({ mapped: this.fieldMappingService.apply(dto.sampleRecord, dto.mappings) });
  }
}

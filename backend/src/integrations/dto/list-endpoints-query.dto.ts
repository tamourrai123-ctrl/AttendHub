import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

/**
 * Combines the shared page/limit fields with companyId into ONE query DTO.
 *
 * Root cause this fixes: the global ValidationPipe runs with
 * `forbidNonWhitelisted: true`. When a handler has an object-shaped
 * `@Query() dto: SomeDto` param AND a separate named `@Query('companyId')`
 * param on the SAME route, Nest still validates the *entire* raw query
 * object against SomeDto — `companyId` then fails whitelist validation as
 * an unrecognized property, before the handler body (and its own
 * companyId/tenant check) ever runs. That is exactly the 400 this file's
 * findAll() route was returning instead of 200/403/404. Every other route
 * in this codebase that reads `companyId` (IntegrationsController's
 * id-based routes, EndpointsController's other routes) only ever uses a
 * single `@Query('companyId')` param with no sibling `@Query() dto`, so
 * this bug had no earlier precedent to catch it. The fix is to never mix
 * the two — companyId now lives on the same validated DTO as page/limit.
 */
export class ListEndpointsQueryDto extends PaginationQueryDto {
  @ApiProperty({ required: true })
  @IsOptional() // still enforced as required at runtime by resolveCompanyId(), which throws 400 with a clearer message than a bare validation error would
  @IsString()
  companyId?: string;
}

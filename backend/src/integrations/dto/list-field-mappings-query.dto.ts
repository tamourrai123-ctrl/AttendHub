import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

/**
 * Combines page/limit with companyId into ONE query DTO — see
 * ListEndpointsQueryDto's doc comment for the exact bug this pattern avoids
 * (a sibling named `@Query('companyId')` param alongside a whole-object
 * `@Query() dto` param gets the whole query rejected by the global
 * `forbidNonWhitelisted` ValidationPipe). Every list route added since that
 * fix follows this same single-DTO shape.
 */
export class ListFieldMappingsQueryDto extends PaginationQueryDto {
  @ApiProperty({ required: true })
  @IsOptional() // still enforced as required at runtime by resolveCompanyId(), which throws 400 with a clearer message than a bare validation error would
  @IsString()
  companyId?: string;
}

import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

/**
 * Shared query params for any list endpoint. Extend this with
 * endpoint-specific filters (see e.g. employees/dto/list-employees.dto.ts)
 * rather than repeating page/limit on every DTO.
 */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}

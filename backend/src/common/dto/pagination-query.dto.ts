import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Largest page size a client may ask for — keeps one request from pulling an entire table. Walk the pages for more. */
export const MAX_PAGE_LIMIT = 100;

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
  @Max(MAX_PAGE_LIMIT)
  limit?: number = 20;
}

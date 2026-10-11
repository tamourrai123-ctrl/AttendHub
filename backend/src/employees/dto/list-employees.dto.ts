import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

/**
 * status/department filters were removed — usm_users has no corresponding
 * columns (see the Employees migration report, sections H/N). `search`
 * still matches against name/email.
 */
export class ListEmployeesDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;
}

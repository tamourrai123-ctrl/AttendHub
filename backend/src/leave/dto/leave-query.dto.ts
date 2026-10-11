import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

/**
 * Phase 2/Part C — the old fixed `status` enum (PENDING/APPROVED/REJECTED/
 * ALL) is gone along with the request/approval model it belonged to (see
 * LeaveRecord's doc comment): `leaveStatus` is now freeform text from the
 * HR system, so it isn't a meaningful `@IsIn` filter value here.
 */
export class LeaveQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsString()
  leaveType?: string;

  /** Matches employeeName or leaveType, case-insensitive. */
  @IsOptional()
  @IsString()
  search?: string;
}

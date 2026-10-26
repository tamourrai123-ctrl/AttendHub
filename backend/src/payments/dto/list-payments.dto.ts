import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { PAYMENT_STATUSES, PaymentStatus } from '../interfaces/payment.interface';

export class ListPaymentsDto extends PaginationQueryDto {
  /** Super Admin only: narrow to one company. Ignored for a Company Admin, whose company always comes from the session. */
  @IsOptional()
  @IsString()
  @Length(1, 2)
  companyId?: string;

  @IsOptional()
  @IsIn(PAYMENT_STATUSES)
  status?: PaymentStatus;
}

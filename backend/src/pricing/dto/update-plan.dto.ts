import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';
import { CreatePlanDto } from './create-plan.dto';

export class UpdatePlanDto extends PartialType(CreatePlanDto) {
  @ApiProperty({ required: false, example: 2, description: 'Lower numbers render first on the public website.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;
}

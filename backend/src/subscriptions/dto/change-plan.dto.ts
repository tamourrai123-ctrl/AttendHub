import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class ChangePlanDto {
  @ApiProperty({ example: '2', description: 'Id of an ACTIVE pricing plan (from GET /api/plans).' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+$/, { message: 'planId must be a numeric plan id.' })
  planId!: string;
}

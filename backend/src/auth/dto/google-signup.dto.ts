import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

/** Second step for a brand-new Google user: the company details plus the plan they picked on the pricing page. */
export class GoogleSignupDto {
  @ApiProperty({ description: 'The signupToken returned by POST /auth/google (valid for 15 minutes).' })
  @IsString()
  @IsNotEmpty()
  signupToken!: string;

  @ApiProperty({ example: 'Acme Pvt Ltd' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  companyName!: string;

  @ApiProperty({ example: 'ACME', description: 'Short unique company name (max 10 characters).' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 10)
  companyShortname!: string;

  @ApiProperty({ example: '2', description: 'Id of the plan chosen on the pricing page (GET /api/plans). A plan with a free trial starts its trial now.' })
  @IsString()
  @Matches(/^\d+$/, { message: 'planId must be a numeric plan id.' })
  planId!: string;

  @ApiProperty({ required: false, example: 'Jane Doe', description: 'Defaults to the name on the Google account.' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  adminName?: string;

  @ApiProperty({ required: false, example: '+92 300 1234567' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ required: false, example: 1 })
  @IsOptional()
  @IsInt()
  country?: number;
}

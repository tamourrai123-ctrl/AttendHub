import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDefined,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** One dynamic plan feature. `value` may be a string, number or boolean — checked in PricingService (class-validator has no union type). */
export class PlanCustomFeatureDto {
  @ApiProperty({ example: 'prioritySupport', description: 'Machine key, letters/digits/underscore, starts with a letter, unique within the plan.' })
  @IsString()
  @Matches(/^[a-zA-Z][a-zA-Z0-9_]{0,49}$/, { message: 'key must start with a letter and contain only letters, digits and underscores (max 50).' })
  key!: string;

  @ApiProperty({ example: 'Priority support' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  label!: string;

  @ApiProperty({ example: true, description: 'string, number or boolean.' })
  @IsDefined()
  value!: string | number | boolean;
}

export class CreatePlanDto {
  // Definite-assignment assertions (!) on required fields: these DTOs are
  // populated by Nest's ValidationPipe via class-transformer, never by
  // `new CreatePlanDto()`, so strictPropertyInitialization can't see that
  // the fields are actually assigned.
  @ApiProperty({ example: 'Starter' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'For small teams just getting started.' })
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiProperty({ example: 9 })
  @IsNumber()
  @Min(0)
  monthlyPrice!: number;

  @ApiProperty({ example: 90 })
  @IsNumber()
  @Min(0)
  yearlyPrice!: number;

  @ApiProperty({ example: 'USD' })
  @IsString()
  @IsNotEmpty()
  currency!: string;

  @ApiProperty({ example: ['Up to 25 employees', '1 HR integration'] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  features!: string[];

  @ApiProperty({ example: false })
  @IsBoolean()
  recommended!: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  active!: boolean;

  @ApiProperty({ required: false, nullable: true, example: 50, description: 'Max mobile-app users for this plan. Omit or null = unlimited.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUsers?: number | null;

  @ApiProperty({ required: false, example: 14, description: 'Free-trial days when a company first picks this plan. 0 = no trial.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  trialDays?: number;

  @ApiProperty({ required: false, type: [PlanCustomFeatureDto], description: 'Dynamic custom features (max 30).' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => PlanCustomFeatureDto)
  customFeatures?: PlanCustomFeatureDto[];
}

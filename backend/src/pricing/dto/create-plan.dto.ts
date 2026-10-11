import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsBoolean, IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

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
}

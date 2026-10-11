import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateCompanyDto } from './create-company.dto';

// `id` is the primary key — excluded here so it can never be changed via
// PATCH, only supplied once at creation.
export class UpdateCompanyDto extends PartialType(OmitType(CreateCompanyDto, ['id'] as const)) {}

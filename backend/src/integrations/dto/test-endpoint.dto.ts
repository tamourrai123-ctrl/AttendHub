import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsOptional } from 'class-validator';

/**
 * Values for any "{{name}}" placeholders in the endpoint's stored path
 * (see IntegrationEndpoint.endpoint) — supplied at test/execute time since
 * integration_detail has no structured query-parameter storage. Every
 * value is coerced to a string before substitution; this DTO deliberately
 * accepts a flat Record<string, string> only (no nested objects/arrays) to
 * keep substitution simple and safe.
 */
export class TestEndpointDto {
  @ApiProperty({ required: false, type: Object, example: { department: 'sales' } })
  @IsOptional()
  @IsObject()
  queryParams?: Record<string, string>;

  /**
   * For a POST (Outbound) endpoint: one sample AttendHub record (keys = the purpose's AttendHub field names). The
   * hub runs it through the endpoint's active field mappings and sends the result to the HR system for real.
   */
  @ApiProperty({ required: false, type: Object, example: { employeeCode: '000008', state: 'IN' } })
  @IsOptional()
  @IsObject()
  sampleRecord?: Record<string, unknown>;
}

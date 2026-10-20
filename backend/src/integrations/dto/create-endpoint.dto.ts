import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Length, Matches, Min } from 'class-validator';
import { EndpointHttpMethod, EndpointPayloadType } from '../interfaces/endpoint.interface';

const HTTP_METHODS: EndpointHttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const PAYLOAD_TYPES: EndpointPayloadType[] = ['JSON', 'XML', 'FORM'];

/**
 * Fields map onto integration_detail columns. companyId/integrationId are
 * NOT part of this DTO — they come from the route (:integrationId) and the
 * resolved, tenant-checked companyId (see EndpointsController), never from
 * the request body, the same pattern IntegrationsController already uses
 * for integration_master's id-based routes.
 *
 * `endpoint` must be a relative path (no scheme/host) — the base URL always
 * comes from the parent integration_master.base_url, so an endpoint config
 * can never be pointed at an arbitrary external host.
 */
export class CreateEndpointDto {
  @ApiProperty({ example: 'List employees' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  name!: string;

  @ApiProperty({ required: false, example: 'Returns all active employees for the tenant.' })
  @IsOptional()
  @IsString()
  @Length(0, 255)
  description?: string;

  @ApiProperty({
    example: '/employees?status=active',
    description:
      'Relative path (and optional static query string) appended to the integration\'s base_url. Must start with "/". May contain "{{name}}" placeholders filled in at test/execute time.',
  })
  @IsString()
  @Length(1, 500)
  @Matches(/^\/(?!\/)/, { message: 'endpoint must be a relative path starting with "/" (no scheme or host).' })
  endpoint!: string;

  @ApiProperty({ enum: HTTP_METHODS })
  @IsIn(HTTP_METHODS)
  httpMethod!: EndpointHttpMethod;

  @ApiProperty({ enum: PAYLOAD_TYPES, default: 'JSON' })
  @IsIn(PAYLOAD_TYPES)
  requestType!: EndpointPayloadType;

  @ApiProperty({ enum: PAYLOAD_TYPES, default: 'JSON' })
  @IsIn(PAYLOAD_TYPES)
  responseType!: EndpointPayloadType;

  @ApiProperty({ required: false, default: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  sortOrder?: number;

  @ApiProperty({ required: false, enum: ['ADMIN', 'ALL'], description: 'Custom endpoints only: who may call it from the app. ADMIN (default) = company admin only; ALL = admin and employees.' })
  @IsOptional()
  @IsIn(['ADMIN', 'ALL'])
  callableBy?: 'ADMIN' | 'ALL';
}

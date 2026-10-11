import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Length, Matches, Min } from 'class-validator';
import { EndpointHttpMethod, EndpointPayloadType, EndpointStatus } from '../interfaces/endpoint.interface';

const HTTP_METHODS: EndpointHttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const PAYLOAD_TYPES: EndpointPayloadType[] = ['JSON', 'XML', 'FORM'];
const STATUSES: EndpointStatus[] = ['ACTIVE', 'INACTIVE'];

export class UpdateEndpointDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(0, 255)
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  @Matches(/^\/(?!\/)/, { message: 'endpoint must be a relative path starting with "/" (no scheme or host).' })
  endpoint?: string;

  @ApiProperty({ required: false, enum: HTTP_METHODS })
  @IsOptional()
  @IsIn(HTTP_METHODS)
  httpMethod?: EndpointHttpMethod;

  @ApiProperty({ required: false, enum: PAYLOAD_TYPES })
  @IsOptional()
  @IsIn(PAYLOAD_TYPES)
  requestType?: EndpointPayloadType;

  @ApiProperty({ required: false, enum: PAYLOAD_TYPES })
  @IsOptional()
  @IsIn(PAYLOAD_TYPES)
  responseType?: EndpointPayloadType;

  @ApiProperty({ required: false, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  sortOrder?: number;

  @ApiProperty({ required: false, enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: EndpointStatus;
}

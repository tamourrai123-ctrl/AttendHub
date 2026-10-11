import { ApiProperty } from '@nestjs/swagger';
import { IsDefined } from 'class-validator';

/**
 * Stateless field-detection endpoint's request body — accepts any JSON
 * value (object, array, or scalar) as a sample response body. This is
 * intentionally decoupled from a live test call (see EndpointsController's
 * /test route, which also runs detection on its own live response): the
 * task lists "Response field detection" as its own concern separate from
 * "Test endpoint", and a frontend may want to detect fields from a
 * previously-captured sample without re-hitting the external API.
 */
export class DetectResponseFieldsDto {
  @ApiProperty({ type: Object, description: 'A sample JSON response body, exactly as the external API would return it.' })
  @IsDefined()
  sampleResponse!: unknown;
}

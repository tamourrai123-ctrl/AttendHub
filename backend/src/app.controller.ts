import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from './common/decorators/public.decorator';
import { AppService } from './app.service';

@ApiTags('health')
@Controller('health')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Health check',
    description:
      'Returns basic service status. Does not check database connectivity (no database exists yet in this phase).',
  })
  @ApiResponse({ status: 200, description: 'Service is up and running.' })
  getHealth(): { success: true; message: string } {
    return this.appService.getHealth();
  }
}

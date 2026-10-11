import { Module } from '@nestjs/common';
import { LovService } from './lov.service';

/**
 * Exposes LovService to any module that needs to read app_lov_master /
 * app_lov_detail (see lov.service.ts). PrismaModule is @Global(), so it
 * does not need to be imported here.
 */
@Module({
  providers: [LovService],
  exports: [LovService],
})
export class LovModule {}

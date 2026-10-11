import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Global so any future repository in any domain module can inject
 * PrismaService without importing PrismaModule everywhere — the same
 * "register once, use anywhere" shape as SystemLogsModule/AuthModule's
 * global guards.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}

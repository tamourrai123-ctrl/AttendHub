import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Thin wrapper around the generated PrismaClient that hooks it into Nest's
 * lifecycle. This is the ONLY place PostgreSQL connectivity is established.
 *
 * Nothing in this phase reads or writes through this service yet — the
 * existing InMemory*Repository classes are untouched and remain the
 * authoritative data source for every domain module. This service exists
 * so a future phase can inject PrismaService into a real repository
 * implementation without any new wiring.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to PostgreSQL via Prisma');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

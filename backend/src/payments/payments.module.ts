import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PrismaPaymentsRepository } from './repositories/prisma-payments.repository';

/** Payment history (read-only for people; a payment gateway will write it later). Leaf module: depends only on the global PrismaModule. */
@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, PrismaPaymentsRepository],
  exports: [PaymentsService],
})
export class PaymentsModule {}

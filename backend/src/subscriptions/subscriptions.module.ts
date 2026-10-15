import { Module } from '@nestjs/common';
import { SystemLogsModule } from '../system-logs/system-logs.module';
import { PrismaPlansRepository } from '../pricing/repositories/prisma-plans.repository';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { PrismaSubscriptionsRepository } from './repositories/prisma-subscriptions.repository';

/**
 * Subscriptions: company <-> pricing-plan link, free trial, and the
 * mobile-app user limit. A leaf module on purpose (it depends only on the
 * global PrismaModule and SystemLogsModule) so AuthModule and
 * IntegrationsModule can both import it without creating a cycle — which is
 * also why it provides its own copy of the (stateless) PrismaPlansRepository
 * instead of importing PricingModule. The global AuthGuard/RolesGuard apply
 * to its controller automatically.
 */
@Module({
  imports: [SystemLogsModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, PrismaSubscriptionsRepository, PrismaPlansRepository],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}

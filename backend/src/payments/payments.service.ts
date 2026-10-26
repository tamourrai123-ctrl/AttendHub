import { Injectable } from '@nestjs/common';
import { paginatedResult, PaginatedResult, toSkipTake } from '../common/utils/paginate';
import { Payment, PaymentStatus, RecordPaymentInput } from './interfaces/payment.interface';
import { PrismaPaymentsRepository } from './repositories/prisma-payments.repository';

/**
 * Payment history, read-only for people. Rows are created only through recordPayment(), which a payment gateway's
 * webhook will call once one is connected. Nothing is entered by hand and nothing here talks to a gateway.
 */
@Injectable()
export class PaymentsService {
  constructor(private readonly repository: PrismaPaymentsRepository) {}

  /** Super Admin: every company's payments, optionally narrowed to one company and/or a status. */
  async listAll(query: { companyId?: string; status?: PaymentStatus; page?: number; limit?: number }): Promise<PaginatedResult<Payment>> {
    return this.page(query.companyId, query);
  }

  /** Company Admin: only the caller's own company (taken from the session by the controller). */
  async listForCompany(companyId: string, query: { status?: PaymentStatus; page?: number; limit?: number }): Promise<PaginatedResult<Payment>> {
    return this.page(companyId, query);
  }

  /** For the future gateway webhook. */
  async recordPayment(input: RecordPaymentInput): Promise<void> {
    await this.repository.create(input);
  }

  private async page(companyId: string | undefined, query: { status?: PaymentStatus; page?: number; limit?: number }): Promise<PaginatedResult<Payment>> {
    const { skip, take, page, limit } = toSkipTake(query.page, query.limit);
    const { payments, total } = await this.repository.findPage({ companyId, status: query.status, skip, take });
    return paginatedResult(payments, page, limit, total);
  }
}

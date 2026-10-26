import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Payment, PaymentStatus, RecordPaymentInput } from '../interfaces/payment.interface';

type PaymentRow = Prisma.paymentsGetPayload<{ include: { usm_company: { select: { title: true } } } }>;

@Injectable()
export class PrismaPaymentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findPage(params: { companyId?: string; status?: PaymentStatus; skip: number; take: number }): Promise<{ payments: Payment[]; total: number }> {
    const where: Prisma.paymentsWhereInput = {
      ...(params.companyId && { company_id: params.companyId }),
      ...(params.status && { status: params.status }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.payments.findMany({
        where,
        include: { usm_company: { select: { title: true } } },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.payments.count({ where }),
    ]);
    return { payments: rows.map((row) => this.toPayment(row)), total };
  }

  async create(input: RecordPaymentInput): Promise<void> {
    await this.prisma.payments.create({
      data: {
        company_id: input.companyId,
        plan_name: input.planName,
        amount: input.amount,
        currency: input.currency.toUpperCase(),
        status: input.status,
        method: input.method,
        provider: input.provider,
        reference: input.reference,
        period_start: input.periodStart,
        period_end: input.periodEnd,
        paid_at: input.paidAt,
      },
    });
  }

  private toPayment(row: PaymentRow): Payment {
    return {
      id: row.id.toString(),
      companyId: row.company_id,
      companyName: row.usm_company?.title ?? null,
      planName: row.plan_name,
      amount: Number(row.amount),
      currency: row.currency,
      status: row.status as PaymentStatus,
      method: row.method,
      provider: row.provider,
      reference: row.reference,
      periodStart: row.period_start ? row.period_start.toISOString() : null,
      periodEnd: row.period_end ? row.period_end.toISOString() : null,
      paidAt: row.paid_at ? row.paid_at.toISOString() : null,
      createdAt: row.created_at.toISOString(),
    };
  }
}

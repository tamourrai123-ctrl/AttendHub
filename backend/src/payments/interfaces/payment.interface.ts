export type PaymentStatus = 'PAID' | 'PENDING' | 'FAILED' | 'REFUNDED';
export const PAYMENT_STATUSES: PaymentStatus[] = ['PAID', 'PENDING', 'FAILED', 'REFUNDED'];

export interface Payment {
  id: string;
  companyId: string;
  companyName: string | null;
  planName: string | null;
  amount: number;
  currency: string;
  status: PaymentStatus;
  method: string | null;
  provider: string | null;
  reference: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  paidAt: string | null;
  createdAt: string;
}

/** What a payment gateway's webhook hands over once it knows a payment happened. */
export interface RecordPaymentInput {
  companyId: string;
  planName?: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  method?: string;
  provider?: string;
  reference?: string;
  periodStart?: Date;
  periodEnd?: Date;
  paidAt?: Date;
}

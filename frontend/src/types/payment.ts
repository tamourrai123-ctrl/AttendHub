/** Mirrors backend/src/payments/interfaces/payment.interface.ts. */
export type PaymentStatus = "PAID" | "PENDING" | "FAILED" | "REFUNDED";

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

export interface PaymentListQuery {
  page?: number;
  limit?: number;
  status?: PaymentStatus;
  /** Super Admin only. */
  companyId?: string;
}

export interface PaymentListResult {
  items: Payment[];
  page: number;
  limit: number;
  total: number;
}

import { apiClient, type ApiSuccessResponse } from "./client";
import type { PaymentListQuery, PaymentListResult, Payment } from "../types/payment";

/**
 * Payment history (read-only). Rows are written by the payment gateway's webhook on the backend:
 *   GET /payments        Super Admin (query: page, limit, status, companyId)
 *   GET /payments/mine   Company Admin (own company only; query: page, limit, status)
 */
interface RawPaymentList {
  items: Payment[];
  meta: { page: number; limit: number; total: number };
}

function toResult(data: RawPaymentList): PaymentListResult {
  return { items: data.items, page: data.meta.page, limit: data.meta.limit, total: data.meta.total };
}

export async function getPayments(query: PaymentListQuery = {}): Promise<PaymentListResult> {
  const response = await apiClient.get<ApiSuccessResponse<RawPaymentList>>("/payments", {
    page: query.page,
    limit: query.limit,
    status: query.status,
    companyId: query.companyId,
  });
  return toResult(response.data);
}

export async function getMyPayments(query: PaymentListQuery = {}): Promise<PaymentListResult> {
  const response = await apiClient.get<ApiSuccessResponse<RawPaymentList>>("/payments/mine", {
    page: query.page,
    limit: query.limit,
    status: query.status,
  });
  return toResult(response.data);
}

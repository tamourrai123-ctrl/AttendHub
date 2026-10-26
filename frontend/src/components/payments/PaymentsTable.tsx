import { useCallback, useEffect, useRef, useState } from "react";
import { Receipt } from "lucide-react";
import Table from "../ui/Table";
import Badge from "../ui/Badge";
import Pagination from "../ui/Pagination";
import EmptyState from "../ui/EmptyState";
import LoadingState from "../ui/LoadingState";
import ErrorState from "../ui/ErrorState";
import { ApiError } from "../../api/client";
import { lastPageOf } from "../../lib/paginate";
import { formatDate } from "../../lib/format";
import type { BadgeStatus, TableColumn } from "../../types/common";
import type { Payment, PaymentListQuery, PaymentListResult, PaymentStatus } from "../../types/payment";

const STATUS_BADGE: Record<PaymentStatus, BadgeStatus> = {
  PAID: "active",
  PENDING: "pending",
  FAILED: "error",
  REFUNDED: "warning",
};

const STATUS_LABEL: Record<PaymentStatus, string> = {
  PAID: "Paid",
  PENDING: "Pending",
  FAILED: "Failed",
  REFUNDED: "Refunded",
};

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

interface PaymentsTableProps {
  fetchPage: (query: PaymentListQuery) => Promise<PaymentListResult>;
  /** Super Admin lists show which company each payment belongs to. */
  showCompany?: boolean;
  /** Super Admin gets a status filter. */
  showStatusFilter?: boolean;
  pageSize?: number;
  /** Changing this reloads from page 1 (e.g. a different company in a drawer). */
  resetKey?: string;
}

/** Payment history list with its own loading, empty, error and pagination states. Read-only. */
export default function PaymentsTable({ fetchPage, showCompany = false, showStatusFilter = false, pageSize = 10, resetKey = "" }: PaymentsTableProps) {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | "">("");
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [result, setResult] = useState<PaymentListResult | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const requestId = useRef(0);

  useEffect(() => {
    setPage(1);
  }, [resetKey, statusFilter]);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setState("loading");
    try {
      const data = await fetchPage({ page, limit: pageSize, status: statusFilter || undefined });
      if (id !== requestId.current) return;
      const lastPage = lastPageOf(data.total, data.limit);
      if (page > lastPage) {
        setPage(lastPage);
        return;
      }
      setResult(data);
      setState("success");
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err instanceof ApiError ? err.message : "We couldn't load the payment history.");
      setState("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, statusFilter, resetKey]);

  useEffect(() => {
    load();
  }, [load]);

  const columns: TableColumn<Payment>[] = [
    { key: "date", header: "Date", render: (row) => formatDate(row.paidAt ?? row.createdAt) },
    ...(showCompany ? [{ key: "company", header: "Company", render: (row: Payment) => row.companyName ?? row.companyId } as TableColumn<Payment>] : []),
    { key: "plan", header: "Plan", render: (row) => row.planName ?? "—" },
    { key: "amount", header: "Amount", className: "font-medium text-slate-900", render: (row) => formatMoney(row.amount, row.currency) },
    { key: "status", header: "Status", render: (row) => <Badge status={STATUS_BADGE[row.status]}>{STATUS_LABEL[row.status]}</Badge> },
    { key: "method", header: "Paid with", render: (row) => [row.method, row.provider].filter(Boolean).join(" · ") || "—" },
    {
      key: "period",
      header: "Covers",
      render: (row) => (row.periodStart && row.periodEnd ? `${formatDate(row.periodStart)} to ${formatDate(row.periodEnd)}` : "—"),
    },
    { key: "reference", header: "Reference", render: (row) => <span className="font-mono text-xs">{row.reference ?? "—"}</span> },
  ];

  return (
    <div>
      {showStatusFilter && (
        <div className="mb-3 flex justify-end">
          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as PaymentStatus | "")}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          >
            <option value="">All statuses</option>
            {(Object.keys(STATUS_LABEL) as PaymentStatus[]).map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </div>
      )}

      {state === "loading" && <LoadingState variant="table" rows={Math.min(pageSize, 5)} />}
      {state === "error" && <ErrorState description={error} onRetry={load} />}
      {state === "success" && result && result.items.length === 0 && (
        <EmptyState icon={Receipt} title="No payments yet" description="Payments will appear here once they are made." />
      )}
      {state === "success" && result && result.items.length > 0 && (
        <>
          <Table<Payment> rowKey={(row) => row.id} data={result.items} columns={columns} />
          <Pagination page={result.page} pageSize={result.limit} total={result.total} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}

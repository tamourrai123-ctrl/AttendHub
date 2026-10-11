import { useCallback, useEffect, useState } from "react";
import { Activity, CheckCircle2, Clock, XCircle } from "lucide-react";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import Table from "../../components/ui/Table";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import StatCard from "../../components/ui/StatCard";
import Pagination from "../../components/ui/Pagination";
import EmptyState from "../../components/ui/EmptyState";
import LoadingState from "../../components/ui/LoadingState";
import ErrorState from "../../components/ui/ErrorState";
import ApiLogDetailDrawer from "./monitoring/ApiLogDetailDrawer";
import { getApiLogs, getApiMonitoringSummary } from "../../api/monitoring";
import { ApiError } from "../../api/client";
import { formatDateTime } from "../../lib/format";
import { API_STATUS_GROUP_BADGE } from "../../lib/statusBadges";
import { statusGroupOf } from "../../types/apiLog";
import type { ApiLog, ApiLogListResult, ApiMonitoringSummary } from "../../types/apiLog";
import type { AsyncStatus } from "../../types/common";

/**
 * Real backend integration. Requests are logged live by a global
 * interceptor (MonitoringInterceptor) — this data has been real since the
 * backend was built, it just wasn't wired to this screen yet.
 *
 * Scope (per product decision): this interceptor only records a request
 * when it hit one of the /integrations* routes AND was made by a
 * company-scoped session — i.e. a company admin's own HR-system
 * integration traffic (creating/editing the connection, testing it,
 * managing endpoints/field mappings, fetching HR employees), never Super
 * Admin's own view/activate calls to those same routes and never unrelated
 * platform traffic (companies, auth, pricing, etc.). See
 * monitoring.interceptor.ts's doc comment for the exact rule. See
 * types/apiLog.ts for what else changed from the old mock shape (no more
 * companyName or captured headers/bodies — the real interceptor never
 * records those).
 *
 * Same pagination convention as Companies/SystemLogs/Integrations: the real
 * `GET /monitoring` endpoint only accepts `page`/`limit` — no server-side
 * search, company, status, or method filtering — so those controls have
 * been removed rather than faked against a single loaded page.
 */

const PAGE_SIZE = 10;

function errorMessageFor(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

export default function ApiMonitoring() {
  const [page, setPage] = useState(1);

  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [result, setResult] = useState<ApiLogListResult | null>(null);
  const [summary, setSummary] = useState<ApiMonitoringSummary | null>(null);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState<ApiLog | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const [logData, summaryData] = await Promise.all([getApiLogs({ page, limit: PAGE_SIZE }), getApiMonitoringSummary()]);
      setResult(logData);
      setSummary(summaryData);
      setStatus("success");
    } catch (err) {
      setLoadError(errorMessageFor(err, "We couldn't load the API request log."));
      setStatus("error");
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <PageHeader title="API Monitoring" description="Watch each company admin's own HR integration requests — not general platform traffic." />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Activity} label="Requests" value={summary ? summary.requestsToday.toLocaleString() : "—"} helpText="Logged today" />
        <StatCard icon={CheckCircle2} label="Successful" value={summary ? summary.successfulRequests.toLocaleString() : "—"} helpText="Status code below 400" />
        <StatCard icon={XCircle} label="Failed" value={summary ? summary.failedRequests.toLocaleString() : "—"} helpText="Status code 400 or above" />
        <StatCard icon={Clock} label="Avg Response Time" value={summary ? `${summary.averageResponseTimeMs}ms` : "—"} helpText="Across today's requests" />
      </div>

      <Card padded={false}>
        <div className="p-4">
          {status === "loading" && <LoadingState variant="table" rows={PAGE_SIZE} />}

          {status === "error" && <ErrorState description={loadError} onRetry={load} />}

          {status === "success" && result && result.items.length === 0 && (
            <EmptyState
              icon={Activity}
              title="No integration requests yet"
              description="This only shows requests a company admin makes to their own HR system connection (create/update, test, endpoints, field mappings, fetching HR employees) — not general platform traffic."
            />
          )}

          {status === "success" && result && result.items.length > 0 && (
            <Table<ApiLog>
              rowKey={(row) => row.id}
              data={result.items}
              columns={[
                { key: "timestamp", header: "Timestamp", render: (row) => formatDateTime(row.timestamp) },
                {
                  key: "endpoint",
                  header: "Request",
                  render: (row) => (
                    <span className="font-mono text-xs text-slate-700">
                      <span className="mr-1.5 font-semibold text-slate-500">{row.method}</span>
                      {row.endpoint}
                    </span>
                  ),
                },
                {
                  key: "status",
                  header: "Status",
                  render: (row) => <Badge status={API_STATUS_GROUP_BADGE[statusGroupOf(row.statusCode)]}>{row.statusCode}</Badge>,
                },
                { key: "responseTime", header: "Response Time", render: (row) => `${row.responseTimeMs}ms` },
                {
                  key: "actions",
                  header: "",
                  className: "text-right",
                  render: (row) => (
                    <div className="flex justify-end">
                      <Button variant="ghost" size="sm" onClick={() => setSelected(row)}>
                        View
                      </Button>
                    </div>
                  ),
                },
              ]}
            />
          )}
        </div>

        {status === "success" && result && result.items.length > 0 && (
          <Pagination page={result.page} pageSize={result.limit} total={result.total} onPageChange={setPage} />
        )}
      </Card>

      <ApiLogDetailDrawer log={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

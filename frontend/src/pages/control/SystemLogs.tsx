import { useCallback, useEffect, useRef, useState } from "react";
import { lastPageOf } from "../../lib/paginate";
import { FileText } from "lucide-react";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import Table from "../../components/ui/Table";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Pagination from "../../components/ui/Pagination";
import EmptyState from "../../components/ui/EmptyState";
import LoadingState from "../../components/ui/LoadingState";
import ErrorState from "../../components/ui/ErrorState";
import SystemLogDetailDrawer from "./logs/SystemLogDetailDrawer";
import { getSystemLogs, type SystemLogListResult } from "../../api/systemLogs";
import { ApiError } from "../../api/client";
import { formatDateTime } from "../../lib/format";
import { SEVERITY_BADGE, SEVERITY_LABEL } from "../../lib/statusBadges";
import type { SystemLogDetail } from "../../types/systemLog";
import type { AsyncStatus } from "../../types/common";

/**
 * Real backend integration. The old mock-backed search box and
 * severity/resource filter dropdowns have been removed rather than kept as
 * client-side-only decorations: the real `GET /system-logs` endpoint only
 * accepts `page`/`limit` query params (confirmed against
 * backend/src/system-logs/system-logs.controller.ts, which passes
 * PaginationQueryDto straight through with no extension) — there is no
 * server-side search or filtering. Faking those against a single loaded
 * page of results would silently mislead a Super Admin once there are more
 * log entries than fit on one page. Same decision Companies.tsx already
 * made for the same reason — see its own comment.
 */

const PAGE_SIZE = 10;

function errorMessageFor(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

export default function SystemLogs() {
  const [page, setPage] = useState(1);

  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [result, setResult] = useState<SystemLogListResult | null>(null);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState<SystemLogDetail | null>(null);

  // Only the newest request may update the screen — a slow earlier page must not overwrite a later one.
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setStatus("loading");
    try {
      const data = await getSystemLogs({ page, limit: PAGE_SIZE });
      if (id !== requestId.current) return;
      const lastPage = lastPageOf(data.total, data.limit);
      if (page > lastPage) {
        setPage(lastPage);
        return;
      }
      setResult(data);
      setStatus("success");
    } catch (err) {
      if (id !== requestId.current) return;
      setLoadError(errorMessageFor(err, "We couldn't load the system log."));
      setStatus("error");
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <PageHeader title="System Logs" description="Audit trail of administrative and platform-level events." />

      <Card padded={false}>
        <div className="p-4">
          {status === "loading" && <LoadingState variant="table" rows={PAGE_SIZE} />}

          {status === "error" && <ErrorState description={loadError} onRetry={load} />}

          {status === "success" && result && result.items.length === 0 && (
            <EmptyState icon={FileText} title="No log entries found" description="Administrative and system events will appear here." />
          )}

          {status === "success" && result && result.items.length > 0 && (
            <Table<SystemLogDetail>
              rowKey={(row) => row.id}
              data={result.items}
              columns={[
                { key: "timestamp", header: "Timestamp", render: (row) => formatDateTime(row.timestamp) },
                { key: "severity", header: "Severity", render: (row) => <Badge status={SEVERITY_BADGE[row.severity]}>{SEVERITY_LABEL[row.severity]}</Badge> },
                {
                  key: "action",
                  header: "Action",
                  render: (row) => (
                    <div>
                      <span className="block font-medium text-slate-900">{row.action}</span>
                      <span className="block text-xs text-slate-400">{row.description}</span>
                    </div>
                  ),
                },
                { key: "resource", header: "Resource", render: (row) => row.resource },
                { key: "user", header: "User", render: (row) => row.user },
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

      <SystemLogDetailDrawer log={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

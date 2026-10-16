import { useCallback, useEffect, useRef, useState } from "react";
import { lastPageOf } from "../../lib/paginate";
import { Eye, Plug, Power } from "lucide-react";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import Table from "../../components/ui/Table";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Pagination from "../../components/ui/Pagination";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import EmptyState from "../../components/ui/EmptyState";
import LoadingState from "../../components/ui/LoadingState";
import ErrorState from "../../components/ui/ErrorState";
import { useToast } from "../../components/feedback/ToastContext";
import IntegrationDetailDrawer from "./integrations/IntegrationDetailDrawer";
import { getIntegrations, updateIntegrationStatus } from "../../api/integrations";
import { ApiError } from "../../api/client";
import { INTEGRATION_STATUS_BADGE, INTEGRATION_STATUS_LABEL } from "../../lib/statusBadges";
import type { Integration, IntegrationListResult } from "../../types/integration";
import type { AsyncStatus } from "../../types/common";

/**
 * Real backend integration — Super Admin's view.
 *
 * Super Admin can no longer edit a company's connection (integration type,
 * auth type, base URL, credentials) — that now belongs to the company's own
 * admin (see integrations.controller.ts's RBAC doc comment). This screen is
 * intentionally read-only plus one action: activate/deactivate, wired to
 * the narrow `PATCH /integrations/:id/status` route that can't touch
 * anything else.
 *
 * Fake fields and statuses from the old mock UI (Provider, Last Sync, Last
 * Test, and the WARNING/ERROR/TESTING statuses) are gone — none of them
 * exist on the real `integration_master` table. A real connection is only
 * ever Connected or Disconnected.
 *
 * Same pagination convention as Companies.tsx and SystemLogs.tsx: the real
 * `GET /integrations` endpoint only accepts `page`/`limit` — no server-side
 * search or filtering — so those controls are left out rather than faked
 * against a single loaded page.
 *
 * INTEGRATION_STATUS_BADGE/LABEL are keyed by the wider (5-value)
 * IntegrationHealthStatus used elsewhere for Company.integrationStatus, but
 * CONNECTED/DISCONNECTED are a subset of those same keys, so reusing that
 * map here is type-safe and keeps status colors consistent platform-wide —
 * no new badge map needed.
 */

const PAGE_SIZE = 10;

function errorMessageFor(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

export default function Integrations() {
  const { showToast } = useToast();

  const [page, setPage] = useState(1);

  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [result, setResult] = useState<IntegrationListResult | null>(null);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);

  const [viewTarget, setViewTarget] = useState<Integration | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<Integration | null>(null);
  const [isConfirmLoading, setIsConfirmLoading] = useState(false);

  // Only the newest request may update the screen — a slow earlier page must not overwrite a later one.
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setStatus("loading");
    try {
      const data = await getIntegrations({ page, limit: PAGE_SIZE });
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
      setLoadError(errorMessageFor(err, "We couldn't load the integrations list."));
      setStatus("error");
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggleStatus = async (integration: Integration) => {
    if (integration.status === "CONNECTED") {
      setDeactivateTarget(integration);
      return;
    }
    try {
      await updateIntegrationStatus(integration.id, integration.companyId, "CONNECTED");
      showToast({ tone: "success", title: "Integration activated", description: `${integration.companyName}'s integration is now active.` });
      load();
    } catch (err) {
      showToast({ tone: "error", title: "Couldn't activate integration", description: errorMessageFor(err, "Something went wrong. Please try again.") });
    }
  };

  const confirmDeactivate = async () => {
    if (!deactivateTarget) return;
    setIsConfirmLoading(true);
    try {
      await updateIntegrationStatus(deactivateTarget.id, deactivateTarget.companyId, "DISCONNECTED");
      showToast({ tone: "success", title: "Integration deactivated", description: `${deactivateTarget.companyName}'s integration is now inactive.` });
      setDeactivateTarget(null);
      load();
    } catch (err) {
      showToast({ tone: "error", title: "Couldn't deactivate integration", description: errorMessageFor(err, "Something went wrong. Please try again.") });
    } finally {
      setIsConfirmLoading(false);
    }
  };

  return (
    <div>
      <PageHeader title="Integrations" description="View each company's HR system connection, turn it on or off, and switch custom mapping on per endpoint under Details." />

      <Card padded={false}>
        <div className="p-4">
          {status === "loading" && <LoadingState variant="table" rows={PAGE_SIZE} />}

          {status === "error" && <ErrorState description={loadError} onRetry={load} />}

          {status === "success" && result && result.items.length === 0 && (
            <EmptyState
              icon={Plug}
              title="No integrations found"
              description="Integrations will appear here once companies set up their own connection."
            />
          )}

          {status === "success" && result && result.items.length > 0 && (
            <Table<Integration>
              rowKey={(row) => row.id}
              data={result.items}
              columns={[
                {
                  key: "company",
                  header: "Company",
                  render: (row) => (
                    <div>
                      <span className="block font-medium text-slate-900">{row.companyName}</span>
                      <span className="block text-xs text-slate-400">{row.baseUrl}</span>
                    </div>
                  ),
                },
                { key: "type", header: "Integration Type", render: (row) => row.integrationType },
                { key: "authType", header: "Auth Type", render: (row) => row.authType },
                {
                  key: "credentials",
                  header: "Credentials",
                  render: (row) => (
                    <Badge status={row.credentialsConfigured ? "active" : "inactive"}>
                      {row.credentialsConfigured ? "Configured" : "Not configured"}
                    </Badge>
                  ),
                },
                {
                  key: "status",
                  header: "Status",
                  render: (row) => <Badge status={INTEGRATION_STATUS_BADGE[row.status]}>{INTEGRATION_STATUS_LABEL[row.status]}</Badge>,
                },
                {
                  key: "actions",
                  header: "",
                  className: "text-right",
                  render: (row) => (
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" size="sm" leftIcon={<Eye className="h-3.5 w-3.5" />} onClick={() => setViewTarget(row)}>
                        Details
                      </Button>
                      <Button
                        variant={row.status === "CONNECTED" ? "secondary" : "primary"}
                        size="sm"
                        leftIcon={<Power className="h-3.5 w-3.5" />}
                        onClick={() => handleToggleStatus(row)}
                      >
                        {row.status === "CONNECTED" ? "Deactivate" : "Activate"}
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

      <IntegrationDetailDrawer integration={viewTarget} onClose={() => setViewTarget(null)} />

      <ConfirmDialog
        isOpen={Boolean(deactivateTarget)}
        title="Deactivate Integration?"
        description={`${deactivateTarget?.companyName ?? "This company"} will no longer be able to sync attendance data through this integration until it's reactivated.`}
        confirmLabel="Deactivate"
        isDestructive
        isLoading={isConfirmLoading}
        onCancel={() => setDeactivateTarget(null)}
        onConfirm={confirmDeactivate}
      />
    </div>
  );
}

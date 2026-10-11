import { useEffect, useState } from "react";
import Drawer from "../../../components/ui/Drawer";
import Tabs from "../../../components/ui/Tabs";
import Badge from "../../../components/ui/Badge";
import LoadingState from "../../../components/ui/LoadingState";
import { getEndpoints } from "../../../api/endpoints";
import { getFieldMappings } from "../../../api/fieldMappings";
import { getSystemLogs } from "../../../api/systemLogs";
import { formatDateTime } from "../../../lib/format";
import { INTEGRATION_STATUS_BADGE, INTEGRATION_STATUS_LABEL } from "../../../lib/statusBadges";
import type { Integration } from "../../../types/integration";
import type { IntegrationEndpoint } from "../../../types/endpoint";
import type { FieldMappingRecord } from "../../../types/fieldMapping";
import type { SystemLogDetail } from "../../../types/systemLog";

/**
 * Read-only Super Admin view of one company's REAL integration — data comes
 * from the same backend routes the Company Admin's own screens use
 * (integrations, endpoints, field mappings, system logs). Super Admin can
 * view these (backend allows SUPER_ADMIN on the GET routes) but cannot edit
 * them or run connection tests: those are Company Admin-only on the backend,
 * so this drawer deliberately offers no edit/test buttons. Credential values
 * are never returned by the backend, so none are shown here.
 */

interface IntegrationDetailDrawerProps {
  integration: Integration | null;
  onClose: () => void;
  /** Kept for compatibility with earlier callers; this read-only drawer never changes the integration. */
  onUpdated?: (integration: Integration) => void;
}

const TABS = ["Overview", "Configuration", "Field Mapping"];

interface EndpointWithMappings {
  endpoint: IntegrationEndpoint;
  mappings: FieldMappingRecord[];
}

export default function IntegrationDetailDrawer({ integration, onClose }: IntegrationDetailDrawerProps) {
  const [tab, setTab] = useState<string>(TABS[0]);
  const [activity, setActivity] = useState<SystemLogDetail[]>([]);
  const [endpoints, setEndpoints] = useState<EndpointWithMappings[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!integration) return;
    let cancelled = false;
    setTab(TABS[0]);
    setIsLoading(true);
    setLoadError(false);

    const load = async () => {
      try {
        const [logs, endpointResult] = await Promise.all([
          getSystemLogs({ page: 1, limit: 100 }).catch(() => null),
          getEndpoints(integration.id, integration.companyId, 1, 100),
        ]);
        const withMappings = await Promise.all(
          endpointResult.items.map(async (endpoint) => {
            const mappingResult = await getFieldMappings(integration.id, endpoint.id, integration.companyId, 1, 100).catch(() => null);
            return { endpoint, mappings: mappingResult ? mappingResult.items : [] };
          })
        );
        if (cancelled) return;
        setEndpoints(withMappings);
        setActivity(
          logs
            ? logs.items
                .filter((item) => item.metadata?.companyId === integration.companyId || item.description.includes(integration.companyName))
                .slice(0, 8)
            : []
        );
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    load();

    return () => {
      cancelled = true;
    };
  }, [integration]);

  if (!integration) {
    return <Drawer isOpen={false} onClose={onClose} title="" widthClassName="max-w-2xl" />;
  }

  return (
    <Drawer isOpen={Boolean(integration)} onClose={onClose} title={integration.companyName} description="Integration details (read-only)" widthClassName="max-w-2xl">
      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      <div className="pt-5">
        {tab === "Overview" && (
          <div className="flex flex-col gap-6">
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3 sm:col-span-2">
                <span className="text-slate-500">Status</span>
                <Badge status={INTEGRATION_STATUS_BADGE[integration.status]}>{INTEGRATION_STATUS_LABEL[integration.status]}</Badge>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Integration Type</dt>
                <dd className="text-slate-800">{integration.integrationType}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Authentication</dt>
                <dd className="text-slate-800">{integration.authType}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-slate-500">Base URL</dt>
                <dd className="break-all text-slate-800">{integration.baseUrl}</dd>
              </div>
            </dl>

            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Recent Activity</h3>
              {isLoading ? (
                <LoadingState variant="cards" rows={1} />
              ) : activity.length === 0 ? (
                <p className="text-sm text-slate-500">No recent activity for this integration.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {activity.map((item) => (
                    <li key={item.id} className="text-sm text-slate-600">
                      <span className="font-medium text-slate-900">{item.action}</span> — {item.description} · {formatDateTime(item.timestamp)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {tab === "Configuration" && (
          <div className="flex flex-col gap-4 text-sm">
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <dt className="text-xs text-slate-500">Base URL</dt>
                <dd className="break-all text-slate-800">{integration.baseUrl}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Authentication Type</dt>
                <dd className="text-slate-800">{integration.authType}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Credentials</dt>
                <dd className="text-slate-800">{integration.credentialsConfigured ? "Configured" : "Not configured"}</dd>
              </div>
            </dl>
            <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
              Connection settings, credentials and connection tests are managed by the company's own admin. Credential values are never shown.
            </p>
          </div>
        )}

        {tab === "Field Mapping" && (
          <div className="flex flex-col gap-4">
            {isLoading ? (
              <LoadingState variant="cards" rows={2} />
            ) : loadError ? (
              <p className="text-sm text-red-600">Couldn't load this integration's endpoints.</p>
            ) : endpoints.length === 0 ? (
              <p className="text-sm text-slate-500">This company hasn't added any endpoints yet.</p>
            ) : (
              endpoints.map(({ endpoint, mappings }) => (
                <div key={endpoint.id} className="overflow-hidden rounded-lg border border-slate-200">
                  <div className="flex items-center justify-between bg-slate-50 px-4 py-2">
                    <span className="text-sm font-medium text-slate-800">{endpoint.name}</span>
                    <span className="text-xs text-slate-500">
                      {endpoint.httpMethod} {endpoint.endpoint}
                    </span>
                  </div>
                  {mappings.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-slate-500">No field mappings.</p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {mappings.map((mapping) => (
                        <div key={mapping.id} className="grid grid-cols-2 gap-4 px-4 py-2 text-sm">
                          <span className="break-all text-slate-700">{mapping.sourcePath}</span>
                          <span className="break-all text-slate-700">
                            → {mapping.targetField} <span className="text-xs text-slate-400">({mapping.transformType})</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </Drawer>
  );
}

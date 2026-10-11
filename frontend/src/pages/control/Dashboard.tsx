import { useCallback, useEffect, useState } from "react";
import { Building2, Users, ServerCog, Activity as ActivityIcon, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import PageHeader from "../../components/ui/PageHeader";
import StatCard from "../../components/ui/StatCard";
import Card, { CardHeader } from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import LoadingState from "../../components/ui/LoadingState";
import ErrorState from "../../components/ui/ErrorState";
import EmptyState from "../../components/ui/EmptyState";
import { useAuth } from "../../contexts/AuthContext";
import { getCompanies } from "../../api/companies";
import { getIntegrations } from "../../api/integrations";
import { getApiMonitoringSummary } from "../../api/monitoring";
import { getSystemLogs } from "../../api/systemLogs";
import { apiClient } from "../../api/client";
import { formatNumber, formatRelativeTime } from "../../lib/format";
// Everything here is real: Companies/Integrations/API Monitoring/System Logs share
// the same backend endpoints their own screens use, and Platform Health is a
// live GET /health call.
//
// API Activity is intentionally scoped: since MonitoringInterceptor only
// records a company admin's own integration requests (not every request
// the backend serves — see monitoring.interceptor.ts's doc comment), the
// numbers here reflect that same narrow scope, not total platform traffic.
import type { Company } from "../../types/company";
import type { Integration } from "../../types/integration";
import type { ApiMonitoringSummary } from "../../types/apiLog";
import type { SystemLogDetail, LogSeverity } from "../../types/systemLog";
import type { AsyncStatus } from "../../types/common";

interface DashboardData {
  companies: Company[];
  integrations: Integration[];
  apiSummary: ApiMonitoringSummary;
  recentLogs: SystemLogDetail[];
  /** Result of a real GET /health call: true = backend API answered. */
  apiUp: boolean;
}

const SEVERITY_ICON: Record<LogSeverity, { icon: typeof CheckCircle2; className: string }> = {
  INFO: { icon: ActivityIcon, className: "text-brand-500" },
  WARNING: { icon: AlertTriangle, className: "text-amber-500" },
  ERROR: { icon: XCircle, className: "text-red-500" },
  CRITICAL: { icon: XCircle, className: "text-red-600" },
};

// Real check: the backend's public GET /health. It only proves the API server
// is answering (it does not test the database), and the card says so.
async function checkApiUp(): Promise<boolean> {
  try {
    await apiClient.get("/health");
    return true;
  } catch {
    return false;
  }
}

export default function ControlDashboard() {
  const { user } = useAuth();
  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [data, setData] = useState<DashboardData | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const [companyResult, integrationResult, apiSummary, logResult, apiUp] = await Promise.all([
        getCompanies({ page: 1, limit: 1000 }),
        getIntegrations({ page: 1, limit: 500 }),
        getApiMonitoringSummary(),
        getSystemLogs({ page: 1, limit: 5 }),
        checkApiUp(),
      ]);
      setData({
        companies: companyResult.items,
        integrations: integrationResult.items,
        apiSummary,
        recentLogs: logResult.items,
        apiUp,
      });
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (status === "loading") {
    return (
      <div>
        <PageHeader title={`Welcome back, ${user?.name.split(" ")[0] ?? "Admin"}`} description="Here's what's happening across the platform today." />
        <LoadingState variant="cards" rows={4} />
      </div>
    );
  }

  if (status === "error" || !data) {
    return (
      <div>
        <PageHeader title="Dashboard" />
        <ErrorState description="We couldn't load the platform overview." onRetry={load} />
      </div>
    );
  }

  const { companies, integrations, apiSummary, recentLogs, apiUp } = data;
  const totalEmployees = companies.reduce((sum, c) => sum + c.employeeCount, 0);
  const activeCompanies = companies.filter((c) => c.status === "ACTIVE").length;

  // Only two real states exist on the backend — no more Warning/Testing/Error.
  const healthy = integrations.filter((i) => i.status === "CONNECTED").length;
  const disconnected = integrations.filter((i) => i.status === "DISCONNECTED").length;
  const totalIntegrations = Math.max(1, integrations.length);

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${user?.name.split(" ")[0] ?? "Admin"}`}
        description="Here's what's happening across the platform today."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Companies" value={companies.length} icon={Building2} helpText={`${activeCompanies} active`} />
        <StatCard label="Active Companies" value={activeCompanies} icon={ActivityIcon} helpText={`${Math.round((activeCompanies / Math.max(1, companies.length)) * 100)}% of total`} />
        <StatCard label="Total Employees" value={formatNumber(totalEmployees)} icon={Users} />
        <StatCard label="Integration Requests Today" value={formatNumber(apiSummary.requestsToday)} icon={ServerCog} helpText={`${apiSummary.failedRequests} failed`} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Integration Health" description="Current status across all configured integrations" />
          <div className="flex flex-col gap-3">
            {[
              { label: "Connected", count: healthy, icon: CheckCircle2, barClass: "bg-emerald-500", textClass: "text-emerald-600" },
              { label: "Disconnected", count: disconnected, icon: XCircle, barClass: "bg-slate-400", textClass: "text-slate-500" },
            ].map((row) => (
              <div key={row.label}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <row.icon className={`h-3.5 w-3.5 ${row.textClass}`} /> {row.label}
                  </span>
                  <span className="font-medium text-slate-900">{row.count}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full ${row.barClass}`} style={{ width: `${(row.count / totalIntegrations) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="API Activity" description="Company admin integration requests today" />
          <dl className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Successful</dt>
              <dd className="font-semibold text-emerald-600">{formatNumber(apiSummary.successfulRequests)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Failed</dt>
              <dd className="font-semibold text-red-600">{formatNumber(apiSummary.failedRequests)}</dd>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
              <dt className="text-slate-500">Average Response</dt>
              <dd className="font-semibold text-slate-900">{apiSummary.averageResponseTimeMs}ms</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <CardHeader title="Platform Health" description="Live check of the backend API server" />
          <ul className="flex flex-col gap-3">
            <li className="flex items-center justify-between text-sm">
              <span className="text-slate-600">API Server</span>
              <Badge status={apiUp ? "active" : "warning"}>{apiUp ? "Operational" : "Unreachable"}</Badge>
            </li>
          </ul>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Recent Activity" description="Latest administrative and platform events" />
        {recentLogs.length === 0 ? (
          <EmptyState title="No recent activity" description="Administrative and platform events will appear here as they happen." />
        ) : (
          <ul className="flex flex-col gap-4">
            {recentLogs.map((log) => {
              const { icon: Icon, className } = SEVERITY_ICON[log.severity];
              return (
                <li key={log.id} className="flex items-start gap-3">
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${className}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-700">
                      <span className="font-medium text-slate-900">{log.action}</span> — {log.description}
                    </p>
                    <p className="text-xs text-slate-400">
                      {log.user} · {formatRelativeTime(log.timestamp)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

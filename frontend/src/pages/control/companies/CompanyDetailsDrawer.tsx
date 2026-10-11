import { useEffect, useState } from "react";
import { Mail, Phone, User as UserIcon, Calendar, Users, Activity as ActivityIcon } from "lucide-react";
import Drawer from "../../../components/ui/Drawer";
import Badge from "../../../components/ui/Badge";
import LoadingState from "../../../components/ui/LoadingState";
import EmptyState from "../../../components/ui/EmptyState";
import { getIntegrations } from "../../../api/integrations";
import { getApiLogs } from "../../../api/monitoring";
import { getSystemLogs } from "../../../api/systemLogs";
import { formatDate, formatDateTime } from "../../../lib/format";
import { COMPANY_STATUS_BADGE, COMPANY_STATUS_LABEL, INTEGRATION_STATUS_BADGE, INTEGRATION_STATUS_LABEL } from "../../../lib/statusBadges";
import type { Company } from "../../../types/company";
import type { Integration } from "../../../types/integration";
import type { SystemLogDetail } from "../../../types/systemLog";

interface CompanyDetailsDrawerProps {
  company: Company | null;
  onClose: () => void;
}

export default function CompanyDetailsDrawer({ company, onClose }: CompanyDetailsDrawerProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [integration, setIntegration] = useState<Integration | undefined>(undefined);
  const [recentApiRequestCount, setRecentApiRequestCount] = useState(0);
  const [recentActivity, setRecentActivity] = useState<SystemLogDetail[]>([]);

  useEffect(() => {
    if (!company) return;
    let cancelled = false;
    setIsLoading(true);

    // Real backend data. Each source is fetched independently so one failing
    // call doesn't blank the whole drawer.
    Promise.all([
      getIntegrations({ page: 1, limit: 500 }).catch(() => null),
      getApiLogs({ page: 1, limit: 500 }).catch(() => null),
      getSystemLogs({ page: 1, limit: 100 }).catch(() => null),
    ]).then(([integrationResult, logs, activity]) => {
      if (cancelled) return;
      setIntegration(integrationResult?.items.find((item) => item.companyId === company.id));
      setRecentApiRequestCount(logs ? logs.items.filter((log) => log.companyId === company.id).length : 0);
      setRecentActivity(
        activity
          ? activity.items
              .filter((item) => item.metadata?.companyId === company.id || item.description.includes(company.name))
              .slice(0, 8)
          : []
      );
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [company]);

  return (
    <Drawer isOpen={Boolean(company)} onClose={onClose} title={company?.name ?? ""} description="Company details" widthClassName="max-w-xl">
      {!company ? null : isLoading ? (
        <LoadingState variant="cards" rows={2} />
      ) : (
        <div className="flex flex-col gap-6">
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Company Information</h3>
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div className="flex items-center gap-2 text-slate-600">
                <Badge status={COMPANY_STATUS_BADGE[company.status]}>{COMPANY_STATUS_LABEL[company.status]}</Badge>
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <UserIcon className="h-4 w-4 text-slate-400" /> {company.contactPerson}
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <Mail className="h-4 w-4 text-slate-400" /> {company.email}
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <Phone className="h-4 w-4 text-slate-400" /> {company.phone}
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <Calendar className="h-4 w-4 text-slate-400" /> Created {formatDate(company.createdAt)}
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Short Name</span> {company.shortname}
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Country</span> {company.country}
              </div>
            </dl>
          </section>

          <section className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-5 sm:grid-cols-4">
            <div>
              <p className="flex items-center gap-1 text-xs text-slate-500">
                <Users className="h-3.5 w-3.5" /> Employees
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{company.employeeCount}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Active</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{company.activeEmployeeCount}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Integration</p>
              <p className="mt-1">
                <Badge status={INTEGRATION_STATUS_BADGE[company.integrationStatus]}>{INTEGRATION_STATUS_LABEL[company.integrationStatus]}</Badge>
              </p>
            </div>
            <div>
              <p className="flex items-center gap-1 text-xs text-slate-500">
                <ActivityIcon className="h-3.5 w-3.5" /> API Requests
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{recentApiRequestCount}</p>
            </div>
          </section>

          <section className="border-t border-slate-100 pt-5">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Integration Summary</h3>
            {integration ? (
              <div className="rounded-lg border border-slate-200 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-900">{integration.integrationType}</span>
                  <Badge status={INTEGRATION_STATUS_BADGE[integration.status]}>{INTEGRATION_STATUS_LABEL[integration.status]}</Badge>
                </div>
                <p className="mt-1 text-xs text-slate-500">{integration.authType} · {integration.baseUrl}</p>
              </div>
            ) : (
              <EmptyState title="No integration configured" description="This company hasn't set up an integration yet." />
            )}
          </section>

          <section className="border-t border-slate-100 pt-5">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Recent Activity</h3>
            {recentActivity.length === 0 ? (
              <p className="text-sm text-slate-500">No recent activity for this company.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {recentActivity.map((item) => (
                  <li key={item.id} className="text-sm text-slate-600">
                    <span className="font-medium text-slate-900">{item.action}</span> — {item.description} · {formatDateTime(item.timestamp)}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
}

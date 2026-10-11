import Drawer from "../../../components/ui/Drawer";
import Badge from "../../../components/ui/Badge";
import { formatDateTime } from "../../../lib/format";
import { API_STATUS_GROUP_BADGE } from "../../../lib/statusBadges";
import { statusGroupOf } from "../../../types/apiLog";
import type { ApiLog } from "../../../types/apiLog";

/**
 * Simplified for the real backend: the old headers/query params/request
 * body/response body sections are gone because the real MonitoringInterceptor
 * never captures any of that — only method, endpoint, status code, response
 * time, and (when the request was authenticated) which company and user
 * made it. Showing fake headers/bodies here would misrepresent what the
 * platform actually records. See types/apiLog.ts's doc comment.
 */
interface ApiLogDetailDrawerProps {
  log: ApiLog | null;
  onClose: () => void;
}

export default function ApiLogDetailDrawer({ log, onClose }: ApiLogDetailDrawerProps) {
  return (
    <Drawer isOpen={Boolean(log)} onClose={onClose} title={log?.requestId ?? ""} description="API request details" widthClassName="max-w-2xl">
      {!log ? null : (
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3 sm:col-span-2">
            <span className="text-slate-500">Status</span>
            <Badge status={API_STATUS_GROUP_BADGE[statusGroupOf(log.statusCode)]}>{log.statusCode}</Badge>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-slate-500">Request</dt>
            <dd className="break-all font-mono text-xs text-slate-800">
              {log.method} {log.endpoint}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Timestamp</dt>
            <dd className="text-slate-800">{formatDateTime(log.timestamp)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Response Time</dt>
            <dd className="text-slate-800">{log.responseTimeMs}ms</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Company</dt>
            <dd className="text-slate-800">{log.companyId ?? "Platform-level (no company)"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">User</dt>
            <dd className="text-slate-800">{log.userId ?? "Unauthenticated"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-slate-500">Request ID</dt>
            <dd className="text-slate-800">{log.requestId}</dd>
          </div>
        </dl>
      )}
    </Drawer>
  );
}

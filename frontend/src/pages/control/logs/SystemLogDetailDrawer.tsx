import Drawer from "../../../components/ui/Drawer";
import Badge from "../../../components/ui/Badge";
import JsonViewer from "../../../components/ui/JsonViewer";
import { formatDateTime } from "../../../lib/format";
import { SEVERITY_BADGE, SEVERITY_LABEL } from "../../../lib/statusBadges";
import type { SystemLogDetail } from "../../../types/systemLog";

interface SystemLogDetailDrawerProps {
  log: SystemLogDetail | null;
  onClose: () => void;
}

export default function SystemLogDetailDrawer({ log, onClose }: SystemLogDetailDrawerProps) {
  return (
    <Drawer isOpen={Boolean(log)} onClose={onClose} title={log?.action ?? ""} description="System log details" widthClassName="max-w-xl">
      {!log ? null : (
        <div className="flex flex-col gap-6">
          <section>
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3 sm:col-span-2">
                <span className="text-slate-500">Severity</span>
                <Badge status={SEVERITY_BADGE[log.severity]}>{SEVERITY_LABEL[log.severity]}</Badge>
              </div>
              <div>
                <dt className="text-xs text-slate-500">User</dt>
                <dd className="text-slate-800">{log.user}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Timestamp</dt>
                <dd className="text-slate-800">{formatDateTime(log.timestamp)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Resource</dt>
                <dd className="text-slate-800">
                  {log.resource}
                  {log.resourceId ? ` · ${log.resourceId}` : ""}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-slate-500">Description</dt>
                <dd className="text-slate-800">{log.description}</dd>
              </div>
            </dl>
          </section>

          <section className="border-t border-slate-100 pt-5">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Metadata</h3>
            <JsonViewer data={log.metadata} />
          </section>
        </div>
      )}
    </Drawer>
  );
}

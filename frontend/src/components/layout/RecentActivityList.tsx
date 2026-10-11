import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import Card, { CardHeader } from "../ui/Card";
import EmptyState from "../ui/EmptyState";
import type { ActivityItem } from "../../types/common";

const TONE_ICON = {
  success: { icon: CheckCircle2, className: "text-emerald-500" },
  warning: { icon: TriangleAlert, className: "text-amber-500" },
  error: { icon: AlertCircle, className: "text-red-500" },
  info: { icon: Info, className: "text-brand-500" },
};

export default function RecentActivityList({ items, title = "Recent Activity" }: { items: ActivityItem[]; title?: string }) {
  return (
    <Card>
      <CardHeader title={title} />
      {items.length === 0 ? (
        <EmptyState title="No recent activity" description="Activity will appear here as it happens." />
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((item) => {
            const { icon: Icon, className } = TONE_ICON[item.tone];
            return (
              <li key={item.id} className="flex items-start gap-3">
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${className}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-700">{item.message}</p>
                  <p className="text-xs text-slate-400">{item.timestamp}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

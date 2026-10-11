import type { ReactNode } from "react";
import type { BadgeStatus } from "../../types/common";

interface BadgeProps {
  status?: BadgeStatus;
  children: ReactNode;
  className?: string;
}

const STATUS_STYLES: Record<BadgeStatus, string> = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  connected: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  inactive: "bg-slate-100 text-slate-600 ring-slate-500/20",
  disconnected: "bg-slate-100 text-slate-600 ring-slate-500/20",
  pending: "bg-amber-50 text-amber-700 ring-amber-600/20",
  error: "bg-red-50 text-red-700 ring-red-600/20",
  suspended: "bg-orange-50 text-orange-700 ring-orange-600/20",
  warning: "bg-amber-50 text-amber-700 ring-amber-600/20",
  testing: "bg-sky-50 text-sky-700 ring-sky-600/20",
  critical: "bg-rose-50 text-rose-700 ring-rose-600/20",
  info: "bg-blue-50 text-blue-700 ring-blue-600/20",
};

const DOT_STYLES: Record<BadgeStatus, string> = {
  active: "bg-emerald-500",
  connected: "bg-emerald-500",
  inactive: "bg-slate-400",
  disconnected: "bg-slate-400",
  pending: "bg-amber-500",
  error: "bg-red-500",
  suspended: "bg-orange-500",
  warning: "bg-amber-500",
  testing: "bg-sky-500",
  critical: "bg-rose-600",
  info: "bg-blue-500",
};

export default function Badge({ status, children, className = "" }: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
        status ? STATUS_STYLES[status] : "bg-slate-100 text-slate-600 ring-slate-500/20",
        className,
      ].join(" ")}
    >
      {status && <span className={`h-1.5 w-1.5 rounded-full ${DOT_STYLES[status]}`} aria-hidden="true" />}
      {children}
    </span>
  );
}

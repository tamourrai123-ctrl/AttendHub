import type { ComponentType } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import Card from "./Card";
import type { StatDatum } from "../../types/common";

interface StatCardProps extends StatDatum {
  icon?: ComponentType<{ className?: string }>;
}

const TREND_ICON = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  flat: Minus,
};

const TREND_COLOR = {
  up: "text-emerald-600",
  down: "text-red-600",
  flat: "text-slate-400",
};

export default function StatCard({ label, value, helpText, trend, icon: Icon }: StatCardProps) {
  const TrendIcon = trend ? TREND_ICON[trend.direction] : null;

  return (
    <Card>
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {Icon && (
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      {(helpText || trend) && (
        <div className="mt-1 flex items-center gap-1 text-xs">
          {trend && TrendIcon && (
            <span className={`flex items-center gap-0.5 font-medium ${TREND_COLOR[trend.direction]}`}>
              <TrendIcon className="h-3.5 w-3.5" />
              {trend.value}
            </span>
          )}
          {helpText && <span className="text-slate-400">{helpText}</span>}
        </div>
      )}
    </Card>
  );
}

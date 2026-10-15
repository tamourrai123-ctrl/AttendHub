import type { ReactNode } from "react";
import { Check } from "lucide-react";
import type { PricingPlan } from "../../types/pricing";
import { monthlyPriceLabel, planHighlights } from "../../lib/planHighlights";

interface PlanCardProps {
  plan: PricingPlan;
  /** When set, the whole card is a selectable option (signup). */
  onSelect?: () => void;
  selected?: boolean;
  /** Content under the feature list (e.g. a button on the Plan page). */
  footer?: ReactNode;
  /** Small label next to the plan name, e.g. "Current plan". */
  tag?: string;
}

function PlanCardBody({ plan, tag }: Pick<PlanCardProps, "plan" | "tag">) {
  const [limit, ...rest] = planHighlights(plan);

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-900">{plan.name}</h3>
        {(tag || plan.recommended) && (
          <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
            {tag ?? "Recommended"}
          </span>
        )}
      </div>
      {plan.description && <p className="mt-1 text-sm text-slate-500">{plan.description}</p>}

      <p className="mt-4 flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold text-slate-900">{monthlyPriceLabel(plan)}</span>
        {plan.monthlyPrice > 0 && <span className="text-sm text-slate-500">per month</span>}
      </p>

      <p className="mt-4 text-sm font-medium text-slate-900">{limit}</p>
      <ul className="mt-2 flex flex-col gap-2">
        {rest.map((line, index) => (
          <li key={`${line}-${index}`} className="flex items-start gap-2 text-sm text-slate-600">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

const BASE = "flex h-full flex-col rounded-xl border bg-white p-5 text-left";

export default function PlanCard({ plan, onSelect, selected = false, footer, tag }: PlanCardProps) {
  if (onSelect) {
    return (
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        onClick={onSelect}
        className={[
          BASE,
          "transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
          selected ? "border-brand-500 ring-2 ring-brand-500" : "border-slate-200 hover:border-slate-300",
        ].join(" ")}
      >
        <PlanCardBody plan={plan} tag={tag} />
      </button>
    );
  }

  return (
    <div className={[BASE, selected ? "border-brand-500 ring-2 ring-brand-500" : "border-slate-200"].join(" ")}>
      <PlanCardBody plan={plan} tag={tag} />
      {footer && <div className="mt-auto pt-5">{footer}</div>}
    </div>
  );
}

import { Fragment } from "react";
import { ChevronRight } from "lucide-react";

export interface BreadcrumbItem {
  label: string;
}

export default function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center text-sm text-slate-500">
      {items.map((item, index) => (
        <Fragment key={item.label}>
          {index > 0 && <ChevronRight className="mx-1.5 h-3.5 w-3.5 text-slate-300" aria-hidden="true" />}
          <span className={index === items.length - 1 ? "font-medium text-slate-900" : ""}>
            {item.label}
          </span>
        </Fragment>
      ))}
    </nav>
  );
}

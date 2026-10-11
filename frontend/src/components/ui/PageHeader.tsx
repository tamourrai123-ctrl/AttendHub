import type { ReactNode } from "react";
import Breadcrumb, { type BreadcrumbItem } from "./Breadcrumb";

interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumb?: BreadcrumbItem[];
  action?: ReactNode;
}

export default function PageHeader({ title, description, breadcrumb, action }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {breadcrumb && <div className="mb-2"><Breadcrumb items={breadcrumb} /></div>}
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

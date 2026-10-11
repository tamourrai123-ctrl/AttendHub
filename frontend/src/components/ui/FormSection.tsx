import type { ReactNode } from "react";

interface FormSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
}

/** Groups related fields under a heading — used on Settings and longer forms. */
export default function FormSection({ title, description, children }: FormSectionProps) {
  return (
    <section className="border-b border-slate-100 py-6 first:pt-0 last:border-b-0 last:pb-0">
      <div className="mb-4 grid grid-cols-1 gap-1 sm:grid-cols-3 sm:gap-6">
        <div className="sm:col-span-1">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
        </div>
        <div className="flex flex-col gap-4 sm:col-span-2">{children}</div>
      </div>
    </section>
  );
}

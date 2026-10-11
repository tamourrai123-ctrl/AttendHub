import type { ComponentType, ReactNode } from "react";
import PageHeader from "../ui/PageHeader";
import Card from "../ui/Card";

interface PlaceholderPageProps {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children?: ReactNode;
}

/**
 * Shared shell for Phase 1 "coming soon" sections. Keeps every placeholder
 * page visually consistent (icon + title + description + content area)
 * instead of re-implementing the same header markup on every page.
 */
export default function PlaceholderPage({ icon: Icon, title, description, children }: PlaceholderPageProps) {
  return (
    <div>
      <PageHeader title={title} description={description} />
      {children ?? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <Icon className="h-7 w-7" />
          </span>
          <h3 className="mt-4 text-sm font-semibold text-slate-900">Coming in a later phase</h3>
          <p className="mt-1 max-w-sm text-sm text-slate-500">
            This section's full functionality will be built out in a future phase. For now this is a
            placeholder to establish the page's place in the app.
          </p>
        </Card>
      )}
    </div>
  );
}

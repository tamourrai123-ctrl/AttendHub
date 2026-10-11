interface LoadingStateProps {
  variant?: "cards" | "table" | "spinner";
  rows?: number;
}

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200 ${className}`} />;
}

export default function LoadingState({ variant = "cards", rows = 4 }: LoadingStateProps) {
  if (variant === "spinner") {
    return (
      <div className="flex items-center justify-center py-12" role="status" aria-label="Loading">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-brand-600" />
      </div>
    );
  }

  if (variant === "table") {
    return (
      <div className="overflow-hidden rounded-lg border border-slate-200" role="status" aria-label="Loading">
        <div className="h-10 bg-slate-50" />
        <div className="divide-y divide-slate-100">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <SkeletonBlock className="h-4 w-1/4" />
              <SkeletonBlock className="h-4 w-1/3" />
              <SkeletonBlock className="h-4 w-1/6" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      role="status"
      aria-label="Loading"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-xl border border-slate-200 bg-white p-5">
          <SkeletonBlock className="h-3 w-1/2" />
          <SkeletonBlock className="mt-3 h-6 w-2/3" />
          <SkeletonBlock className="mt-3 h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

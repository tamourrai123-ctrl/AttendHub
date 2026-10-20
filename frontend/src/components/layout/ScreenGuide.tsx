import { BookOpen, X } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useGuidePrefs } from "../../lib/guidePrefs";
import { guideForPath } from "../../lib/screenGuides";

/** Short how-to for the current screen, shown above the page. The user can close it, or turn all guides off from the top bar menu. */
export default function ScreenGuide() {
  const { pathname } = useLocation();
  const { enabled, isDismissed, dismiss } = useGuidePrefs();
  const guide = guideForPath(pathname);

  if (!guide || !enabled || isDismissed(pathname)) return null;

  return (
    <section aria-label={`Guide: ${guide.title}`} className="mb-6 rounded-xl border border-brand-100 bg-brand-50 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-lg bg-white p-2 text-brand-700 shadow-card">
          <BookOpen className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-brand-800">How to use: {guide.title}</h2>
          <p className="mt-0.5 text-sm text-slate-600">{guide.intro}</p>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
            {guide.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {guide.tip && <p className="mt-3 text-sm text-slate-600">Tip: {guide.tip}</p>}
        </div>
        <button
          type="button"
          onClick={() => dismiss(pathname)}
          aria-label="Close this guide"
          className="rounded-md p-1.5 text-slate-500 hover:bg-white hover:text-slate-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}

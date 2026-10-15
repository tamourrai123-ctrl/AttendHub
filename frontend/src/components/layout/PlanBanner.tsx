import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getMySubscription, SUBSCRIPTION_CHANGED_EVENT } from "../../api/subscription";
import type { CompanySubscription } from "../../types/subscription";

type Tone = "info" | "warning" | "danger";

const TONE_CLASSES: Record<Tone, string> = {
  info: "border-brand-100 bg-brand-50 text-brand-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-red-200 bg-red-50 text-red-800",
};

function messageFor(sub: CompanySubscription): { tone: Tone; text: string; cta: string } | null {
  if (sub.status === "TRIAL" && sub.trialExpired) {
    return { tone: "danger", text: "Your free trial has ended, so the mobile app is paused.", cta: "Choose a plan" };
  }
  if (sub.status === "TRIAL" && sub.trialDaysLeft !== null) {
    const days = `${sub.trialDaysLeft} ${sub.trialDaysLeft === 1 ? "day" : "days"}`;
    return {
      tone: sub.trialDaysLeft <= 3 ? "warning" : "info",
      text: `Free trial: ${days} left.`,
      cta: "Choose a plan",
    };
  }
  if (sub.usage.maxUsers !== null && sub.usage.seatsLeft === 0) {
    return { tone: "warning", text: `All ${sub.usage.maxUsers} app-user seats are in use. New employees can't sign in on the mobile app.`, cta: "Upgrade" };
  }
  return null;
}

/** Thin notice above the company pages: trial countdown, trial ended, or no seats left. Silent otherwise. */
export default function PlanBanner() {
  const [subscription, setSubscription] = useState<CompanySubscription | null>(null);

  const load = useCallback(async () => {
    try {
      setSubscription(await getMySubscription());
    } catch {
      // The banner is a convenience; stay quiet if it can't load.
      setSubscription(null);
    }
  }, []);

  useEffect(() => {
    load();
    window.addEventListener(SUBSCRIPTION_CHANGED_EVENT, load);
    return () => window.removeEventListener(SUBSCRIPTION_CHANGED_EVENT, load);
  }, [load]);

  const message = subscription ? messageFor(subscription) : null;
  if (!message) return null;

  return (
    <div role="status" className={`mb-6 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-2.5 text-sm ${TONE_CLASSES[message.tone]}`}>
      <span>{message.text}</span>
      <Link to="/company/plan" className="font-medium underline underline-offset-2">
        {message.cta}
      </Link>
    </div>
  );
}

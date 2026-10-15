import { useCallback, useEffect, useState } from "react";
import { Smartphone, Trash2 } from "lucide-react";
import PageHeader from "../../components/ui/PageHeader";
import Card, { CardHeader } from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Table from "../../components/ui/Table";
import EmptyState from "../../components/ui/EmptyState";
import LoadingState from "../../components/ui/LoadingState";
import ErrorState from "../../components/ui/ErrorState";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import PlanCard from "../../components/plans/PlanCard";
import { useToast } from "../../components/feedback/ToastContext";
import {
  changeMyPlan,
  getMyAppUsers,
  getMySubscription,
  notifySubscriptionChanged,
  removeMyAppUser,
} from "../../api/subscription";
import { getPublicPlans } from "../../api/pricing";
import { ApiError } from "../../api/client";
import { formatDate, formatRelativeTime } from "../../lib/format";
import { monthlyPriceLabel, trialLabel, userLimitLabel } from "../../lib/planHighlights";
import type { PricingPlan } from "../../types/pricing";
import type { AppUser, CompanySubscription } from "../../types/subscription";
import type { AsyncStatus, TableColumn } from "../../types/common";

function errorMessageFor(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

/** What the button on a plan card says, relative to the plan the company is on now. */
function actionLabel(target: PricingPlan, current: CompanySubscription): string {
  if (!current.plan) return "Choose plan";
  if (current.status === "TRIAL") return "Activate plan";
  if (target.monthlyPrice > current.plan.monthlyPrice) return "Upgrade";
  if (target.monthlyPrice < current.plan.monthlyPrice) return "Downgrade";
  return "Switch";
}

function statusBadge(sub: CompanySubscription) {
  if (sub.status === "TRIAL") {
    return sub.trialExpired ? <Badge status="error">Trial ended</Badge> : <Badge status="pending">Free trial</Badge>;
  }
  if (sub.status === "ACTIVE") return <Badge status="active">Active</Badge>;
  return <Badge status="inactive">No plan</Badge>;
}

function UsageBar({ used, max }: { used: number; max: number | null }) {
  if (max === null) {
    return <p className="text-sm text-slate-600">{used} app users · no limit</p>;
  }
  const percent = Math.min(100, Math.round((used / max) * 100));
  const tone = percent >= 100 ? "bg-red-500" : percent >= 80 ? "bg-amber-500" : "bg-brand-600";
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-sm">
        <span className="font-medium text-slate-900">
          {used} of {max} app users
        </span>
        <span className="text-slate-500">{Math.max(max - used, 0)} left</span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label="App users used"
      >
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export default function Plan() {
  const { showToast } = useToast();

  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [subscription, setSubscription] = useState<CompanySubscription | null>(null);
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [appUsers, setAppUsers] = useState<AppUser[]>([]);

  const [switchTarget, setSwitchTarget] = useState<PricingPlan | null>(null);
  const [removeTarget, setRemoveTarget] = useState<AppUser | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const [sub, publicPlans, users] = await Promise.all([getMySubscription(), getPublicPlans(), getMyAppUsers()]);
      setSubscription(sub);
      setPlans(publicPlans);
      setAppUsers(users);
      setStatus("success");
    } catch (err) {
      setLoadError(errorMessageFor(err, "We couldn't load your plan."));
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refreshAfterChange = async () => {
    const [sub, users] = await Promise.all([getMySubscription(), getMyAppUsers()]);
    setSubscription(sub);
    setAppUsers(users);
    notifySubscriptionChanged();
  };

  const confirmSwitch = async () => {
    if (!switchTarget || !subscription) return;
    setIsBusy(true);
    try {
      await changeMyPlan(switchTarget.id);
      await refreshAfterChange();
      showToast({ tone: "success", title: "Plan changed", description: `You're now on ${switchTarget.name}.` });
      setSwitchTarget(null);
    } catch (err) {
      showToast({ tone: "error", title: "Couldn't change plan", description: errorMessageFor(err, "Something went wrong. Please try again.") });
    } finally {
      setIsBusy(false);
    }
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    setIsBusy(true);
    try {
      await removeMyAppUser(removeTarget.externalEmployeeId);
      await refreshAfterChange();
      showToast({ tone: "success", title: "Seat freed", description: `${removeTarget.name ?? removeTarget.externalEmployeeId} no longer uses a seat.` });
      setRemoveTarget(null);
    } catch (err) {
      showToast({ tone: "error", title: "Couldn't remove user", description: errorMessageFor(err, "Something went wrong. Please try again.") });
    } finally {
      setIsBusy(false);
    }
  };

  const columns: TableColumn<AppUser>[] = [
    {
      key: "name",
      header: "Employee",
      render: (u) => (
        <div>
          <p className="font-medium text-slate-900">{u.name ?? "—"}</p>
          <p className="text-xs text-slate-400">{u.externalEmployeeId}</p>
        </div>
      ),
    },
    { key: "first", header: "First used", render: (u) => formatDate(u.firstSeenAt) },
    { key: "last", header: "Last used", render: (u) => formatRelativeTime(u.lastSeenAt) },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (u) => (
        <Button variant="ghost" size="sm" leftIcon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setRemoveTarget(u)}>
          Remove
        </Button>
      ),
    },
  ];

  const current = subscription?.plan ?? null;
  const switchVerb = switchTarget && subscription ? actionLabel(switchTarget, subscription) : "Change plan";

  return (
    <div>
      <PageHeader title="Plan & usage" description="Your plan, how many app users it covers, and who is using a seat." />

      {status === "loading" && <LoadingState variant="cards" rows={3} />}

      {status === "error" && (
        <Card>
          <ErrorState description={loadError} onRetry={load} />
        </Card>
      )}

      {status === "success" && subscription && (
        <div className="flex flex-col gap-6">
          <Card>
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-slate-900">{current ? current.name : "No plan selected"}</h2>
                  {statusBadge(subscription)}
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {!current && "Your account has no app-user limit. Choose a plan below when you're ready."}
                  {current && subscription.status === "TRIAL" && !subscription.trialExpired && subscription.trialEndsAt &&
                    `Free trial ends ${formatDate(subscription.trialEndsAt)} · ${subscription.trialDaysLeft} ${subscription.trialDaysLeft === 1 ? "day" : "days"} left.`}
                  {current && subscription.status === "TRIAL" && subscription.trialExpired &&
                    "Your free trial has ended. The mobile app is paused until you activate a plan."}
                  {current && subscription.status === "ACTIVE" &&
                    `${monthlyPriceLabel(current)}${current.monthlyPrice > 0 ? " per month" : ""} · ${userLimitLabel(current.maxUsers)}`}
                </p>
              </div>
              <div className="w-full sm:w-72">
                <UsageBar used={subscription.usage.activeAppUsers} max={subscription.usage.maxUsers} />
              </div>
            </div>
          </Card>

          {plans.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-slate-900">Available plans</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {plans.map((plan) => {
                  const isCurrent = current?.id === plan.id;
                  const needsActivation = isCurrent && subscription.status === "TRIAL";
                  return (
                    <PlanCard
                      key={plan.id}
                      plan={plan}
                      selected={isCurrent}
                      tag={isCurrent ? "Current plan" : undefined}
                      footer={
                        isCurrent && !needsActivation ? (
                          <Button variant="secondary" className="w-full" disabled>
                            Current plan
                          </Button>
                        ) : (
                          <Button
                            variant={needsActivation ? "primary" : "secondary"}
                            className="w-full"
                            onClick={() => setSwitchTarget(plan)}
                          >
                            {actionLabel(plan, subscription)}
                          </Button>
                        )
                      }
                    />
                  );
                })}
              </div>
            </section>
          )}

          <Card>
            <CardHeader
              title="App users"
              description="Employees who signed in to the mobile app and marked attendance. Each one uses a seat."
            />
            {appUsers.length === 0 ? (
              <EmptyState
                icon={Smartphone}
                title="No app users yet"
                description="Employees appear here the first time they sign in on the mobile app."
              />
            ) : (
              <Table columns={columns} data={appUsers} rowKey={(u) => u.externalEmployeeId} />
            )}
          </Card>
        </div>
      )}

      <ConfirmDialog
        isOpen={Boolean(switchTarget)}
        title={`${switchVerb}: ${switchTarget?.name ?? ""}`}
        description={
          switchTarget
            ? `${monthlyPriceLabel(switchTarget)}${switchTarget.monthlyPrice > 0 ? " per month" : ""} · ${userLimitLabel(switchTarget.maxUsers)}.${
                switchTarget.maxUsers !== null && subscription && subscription.usage.activeAppUsers > switchTarget.maxUsers
                  ? ` You have ${subscription.usage.activeAppUsers} app users, so remove some first.`
                  : ""
              }${trialLabel(switchTarget.trialDays) && !current ? ` Includes a ${trialLabel(switchTarget.trialDays)}.` : ""}`
            : undefined
        }
        confirmLabel={switchVerb}
        isLoading={isBusy}
        onCancel={() => setSwitchTarget(null)}
        onConfirm={confirmSwitch}
      />

      <ConfirmDialog
        isOpen={Boolean(removeTarget)}
        title={`Remove ${removeTarget?.name ?? "this user"}?`}
        description="This frees their seat. They can use the mobile app again later if a seat is available."
        confirmLabel="Remove"
        isDestructive
        isLoading={isBusy}
        onCancel={() => setRemoveTarget(null)}
        onConfirm={confirmRemove}
      />
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Check, Pencil, Power, Star, Tag, Trash2 } from "lucide-react";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import LoadingState from "../../components/ui/LoadingState";
import ErrorState from "../../components/ui/ErrorState";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import { useToast } from "../../components/feedback/ToastContext";
import PricingPlanFormModal from "./pricing/PricingPlanFormModal";
import {
  createPricingPlan,
  deletePricingPlan,
  getPricingPlans,
  movePricingPlan,
  setPricingPlanActive,
  updatePricingPlan,
} from "../../api/pricing";
import { ApiError } from "../../api/client";
import { MAX_PRICING_PLANS } from "../../types/pricing";
import type { CreatePricingPlanInput, PricingPlan } from "../../types/pricing";
import type { AsyncStatus } from "../../types/common";

/**
 * Real backend integration. types/pricing.ts already matched the backend's
 * PricingPlan shape exactly, so this page only needed its data layer
 * swapped from services/mockPricingService.ts to api/pricing.ts — no
 * columns, fields, or the form modal needed to change.
 *
 * Unlike Companies/SystemLogs/Integrations, this list is NOT paginated —
 * there are at most 5 plans total (MAX_PRICING_PLANS, enforced by the
 * backend), so the real `GET /plans/all` simply returns all of them.
 */

function errorMessageFor(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

export default function Pricing() {
  const { showToast } = useToast();

  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);

  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PricingPlan | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<PricingPlan | null>(null);
  const [isConfirmLoading, setIsConfirmLoading] = useState(false);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const data = await getPricingPlans();
      setPlans(data);
      setStatus("success");
    } catch (err) {
      setLoadError(errorMessageFor(err, "We couldn't load the pricing plans."));
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const atMax = plans.length >= MAX_PRICING_PLANS;

  const openAddModal = () => {
    setEditingPlan(undefined);
    setFormModalOpen(true);
  };

  const openEditModal = (plan: PricingPlan) => {
    setEditingPlan(plan);
    setFormModalOpen(true);
  };

  const handleFormSubmit = async (input: CreatePricingPlanInput) => {
    if (editingPlan) {
      await updatePricingPlan(editingPlan.id, input);
      showToast({ tone: "success", title: "Plan updated", description: `${input.name} was updated successfully.` });
    } else {
      await createPricingPlan(input);
      showToast({ tone: "success", title: "Plan created", description: `${input.name} was added to the pricing page.` });
    }
    setFormModalOpen(false);
    load();
  };

  const handleToggleActive = async (plan: PricingPlan) => {
    setPendingActionId(plan.id);
    try {
      await setPricingPlanActive(plan.id, !plan.active);
      showToast({
        tone: "success",
        title: plan.active ? "Plan deactivated" : "Plan activated",
        description: `${plan.name} is now ${plan.active ? "hidden from" : "visible on"} the public website.`,
      });
      load();
    } catch (err) {
      showToast({ tone: "error", title: "Couldn't update plan", description: errorMessageFor(err, "Something went wrong. Please try again.") });
    } finally {
      setPendingActionId(null);
    }
  };

  const handleMove = async (plan: PricingPlan, direction: "up" | "down") => {
    setPendingActionId(plan.id);
    try {
      const reordered = await movePricingPlan(plan.id, direction);
      setPlans(reordered);
    } catch (err) {
      showToast({ tone: "error", title: "Couldn't reorder plans", description: errorMessageFor(err, "Something went wrong. Please try again.") });
    } finally {
      setPendingActionId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsConfirmLoading(true);
    try {
      await deletePricingPlan(deleteTarget.id);
      showToast({ tone: "success", title: "Plan deleted", description: `${deleteTarget.name} was removed from the pricing page.` });
      setDeleteTarget(null);
      load();
    } catch (err) {
      showToast({ tone: "error", title: "Couldn't delete plan", description: errorMessageFor(err, "Something went wrong. Please try again.") });
    } finally {
      setIsConfirmLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Pricing"
        description="Manage the plans displayed across Tamotam's public website."
        action={
          <Button leftIcon={<Tag className="h-4 w-4" />} onClick={openAddModal} disabled={atMax}>
            Create Plan
          </Button>
        }
      />

      {status === "success" && (
        <div className="mb-4 flex flex-col gap-1">
          <p className="text-sm font-medium text-slate-600">
            {plans.length} / {MAX_PRICING_PLANS} plans created
          </p>
          {atMax && (
            <p className="text-sm text-amber-600">
              You've reached the maximum of {MAX_PRICING_PLANS} pricing plans. Delete a plan to create a new one.
            </p>
          )}
        </div>
      )}

      {status === "loading" && <LoadingState variant="cards" rows={3} />}

      {status === "error" && (
        <Card>
          <ErrorState description={loadError} onRetry={load} />
        </Card>
      )}

      {status === "success" && plans.length === 0 && (
        <Card>
          <EmptyState
            icon={Tag}
            title="No pricing plans yet"
            description="Create your first pricing plan to get started."
            action={<Button onClick={openAddModal}>Create Plan</Button>}
          />
        </Card>
      )}

      {status === "success" && plans.length > 0 && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan, index) => (
            <Card
              key={plan.id}
              className={plan.recommended ? "relative ring-2 ring-brand-500" : "relative"}
            >
              {plan.recommended && (
                <span className="absolute -top-3 left-5 inline-flex items-center gap-1 rounded-full bg-brand-600 px-2.5 py-1 text-xs font-medium text-white shadow-sm">
                  <Star className="h-3 w-3 fill-current" /> Recommended
                </span>
              )}

              <div className="flex items-start justify-between gap-2">
                <h3 className="text-lg font-semibold text-slate-900">{plan.name}</h3>
                <Badge status={plan.active ? "active" : "inactive"}>{plan.active ? "Active" : "Inactive"}</Badge>
              </div>
              <p className="mt-1 text-sm text-slate-500">{plan.description}</p>

              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-2xl font-semibold text-slate-900">
                  {plan.currency} {plan.monthlyPrice}
                </span>
                <span className="text-sm text-slate-500">/ month</span>
              </div>
              <p className="text-xs text-slate-400">
                {plan.currency} {plan.yearlyPrice} / year
              </p>

              <ul className="mt-4 flex flex-col gap-2">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-slate-600">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    {feature}
                  </li>
                ))}
              </ul>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleMove(plan, "up")}
                    disabled={index === 0 || pendingActionId === plan.id}
                    aria-label="Move up"
                    className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMove(plan, "down")}
                    disabled={index === plans.length - 1 || pendingActionId === plan.id}
                    aria-label="Move down"
                    className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="secondary" size="sm" leftIcon={<Pencil className="h-3.5 w-3.5" />} onClick={() => openEditModal(plan)}>
                    Edit
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={<Power className="h-3.5 w-3.5" />}
                    isLoading={pendingActionId === plan.id}
                    onClick={() => handleToggleActive(plan)}
                  >
                    {plan.active ? "Deactivate" : "Activate"}
                  </Button>
                  <Button variant="danger" size="sm" leftIcon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setDeleteTarget(plan)}>
                    Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <PricingPlanFormModal isOpen={formModalOpen} onClose={() => setFormModalOpen(false)} onSubmit={handleFormSubmit} plan={editingPlan} />

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title={`Delete "${deleteTarget?.name ?? "this plan"}"?`}
        description="This action will permanently remove this pricing plan."
        confirmLabel="Delete"
        isDestructive
        isLoading={isConfirmLoading}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

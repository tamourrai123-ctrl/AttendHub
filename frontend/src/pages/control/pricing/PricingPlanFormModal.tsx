import { useEffect, useState, type FormEvent } from "react";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import Modal from "../../../components/ui/Modal";
import Input from "../../../components/ui/Input";
import Checkbox from "../../../components/ui/Checkbox";
import Button from "../../../components/ui/Button";
import FormSection from "../../../components/ui/FormSection";
import type { CreatePricingPlanInput, PricingPlan } from "../../../types/pricing";

interface PricingPlanFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: CreatePricingPlanInput) => Promise<void>;
  /** Present when editing an existing plan; absent when creating one. */
  plan?: PricingPlan;
}

interface FormState {
  name: string;
  description: string;
  monthlyPrice: string;
  yearlyPrice: string;
  currency: string;
  features: string[];
  recommended: boolean;
  active: boolean;
}

interface FormErrors {
  name?: string;
  description?: string;
  monthlyPrice?: string;
  yearlyPrice?: string;
  currency?: string;
  features?: string;
}

const CURRENCY_OPTIONS = ["USD", "EUR", "GBP", "PKR", "INR", "AED"];

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  monthlyPrice: "",
  yearlyPrice: "",
  currency: "USD",
  features: [""],
  recommended: false,
  active: true,
};

export default function PricingPlanFormModal({ isOpen, onClose, onSubmit, plan }: PricingPlanFormModalProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEditing = Boolean(plan);

  useEffect(() => {
    if (isOpen) {
      setForm(
        plan
          ? {
              name: plan.name,
              description: plan.description,
              monthlyPrice: String(plan.monthlyPrice),
              yearlyPrice: String(plan.yearlyPrice),
              currency: plan.currency,
              features: plan.features.length > 0 ? plan.features : [""],
              recommended: plan.recommended,
              active: plan.active,
            }
          : EMPTY_FORM
      );
      setErrors({});
      setSubmitError(null);
    }
  }, [isOpen, plan]);

  const updateFeature = (index: number, value: string) => {
    setForm((f) => ({ ...f, features: f.features.map((feat, i) => (i === index ? value : feat)) }));
  };

  const addFeature = () => {
    setForm((f) => ({ ...f, features: [...f.features, ""] }));
  };

  const removeFeature = (index: number) => {
    setForm((f) => ({ ...f, features: f.features.filter((_, i) => i !== index) }));
  };

  const validate = (): boolean => {
    const nextErrors: FormErrors = {};
    if (!form.name.trim()) nextErrors.name = "Plan name is required.";
    if (!form.description.trim()) nextErrors.description = "A short description is required.";

    const monthly = Number(form.monthlyPrice);
    if (form.monthlyPrice.trim() === "" || Number.isNaN(monthly) || monthly < 0) {
      nextErrors.monthlyPrice = "Enter a valid, non-negative monthly price.";
    }
    const yearly = Number(form.yearlyPrice);
    if (form.yearlyPrice.trim() === "" || Number.isNaN(yearly) || yearly < 0) {
      nextErrors.yearlyPrice = "Enter a valid, non-negative yearly price.";
    }
    if (!form.currency.trim()) nextErrors.currency = "Currency is required.";
    if (form.features.filter((f) => f.trim()).length === 0) {
      nextErrors.features = "Add at least one feature.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitError(null);
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        name: form.name,
        description: form.description,
        monthlyPrice: Number(form.monthlyPrice),
        yearlyPrice: Number(form.yearlyPrice),
        currency: form.currency,
        features: form.features.filter((f) => f.trim()),
        recommended: form.recommended,
        active: form.active,
      });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? "Edit Pricing Plan" : "Create Pricing Plan"}
      description={isEditing ? "Update this plan's pricing and features." : "Add a new plan to the public pricing page."}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="pricing-plan-form" isLoading={isSubmitting}>
            {isEditing ? "Save Changes" : "Create Plan"}
          </Button>
        </>
      }
    >
      <form id="pricing-plan-form" onSubmit={handleSubmit} noValidate className="flex max-h-[65vh] flex-col gap-1 overflow-y-auto pr-1">
        {submitError && (
          <div role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
            {submitError}
          </div>
        )}

        <FormSection title="Basic Information">
          <Input
            label="Plan Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            error={errors.name}
            placeholder="Professional"
          />
          <Input
            label="Short Description"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            error={errors.description}
            placeholder="For growing companies that need deeper visibility."
          />
        </FormSection>

        <FormSection title="Pricing">
          <Input
            label="Monthly Price"
            type="number"
            min={0}
            step="0.01"
            value={form.monthlyPrice}
            onChange={(e) => setForm((f) => ({ ...f, monthlyPrice: e.target.value }))}
            error={errors.monthlyPrice}
            placeholder="29"
          />
          <Input
            label="Yearly Price"
            type="number"
            min={0}
            step="0.01"
            value={form.yearlyPrice}
            onChange={(e) => setForm((f) => ({ ...f, yearlyPrice: e.target.value }))}
            error={errors.yearlyPrice}
            placeholder="290"
          />
          <div>
            <label htmlFor="plan-currency" className="mb-1.5 block text-sm font-medium text-slate-700">
              Currency
            </label>
            <select
              id="plan-currency"
              value={form.currency}
              onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            >
              {CURRENCY_OPTIONS.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
            {errors.currency && <p className="mt-1.5 text-sm text-red-600">{errors.currency}</p>}
          </div>
        </FormSection>

        <FormSection title="Features" description="Shown as a checklist on the public pricing page.">
          <div className="flex flex-col gap-2">
            {form.features.map((feature, index) => (
              <div key={index} className="flex items-center gap-2">
                <GripVertical className="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />
                <input
                  value={feature}
                  onChange={(e) => updateFeature(index, e.target.value)}
                  placeholder={`Feature ${index + 1}`}
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                />
                <button
                  type="button"
                  onClick={() => removeFeature(index)}
                  disabled={form.features.length === 1}
                  aria-label="Remove feature"
                  className="shrink-0 rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {errors.features && <p className="text-sm text-red-600">{errors.features}</p>}
            <div>
              <Button type="button" variant="secondary" size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={addFeature}>
                Add Feature
              </Button>
            </div>
          </div>
        </FormSection>

        <FormSection title="Visibility">
          <div>
            <Checkbox
              label="Recommended / Most Popular"
              checked={form.recommended}
              onChange={(e) => setForm((f) => ({ ...f, recommended: e.target.checked }))}
            />
            <p className="mt-1 pl-6 text-xs text-slate-400">Only one plan can be recommended — marking this one unmarks any other.</p>
          </div>
          <Checkbox
            label="Active (visible on the public website)"
            checked={form.active}
            onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
          />
        </FormSection>
      </form>
    </Modal>
  );
}

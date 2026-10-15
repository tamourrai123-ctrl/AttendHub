import { useEffect, useState, type FormEvent } from "react";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import Modal from "../../../components/ui/Modal";
import Input from "../../../components/ui/Input";
import Checkbox from "../../../components/ui/Checkbox";
import Button from "../../../components/ui/Button";
import FormSection from "../../../components/ui/FormSection";
import type { CreatePricingPlanInput, PlanCustomFeature, PlanFeatureValue, PricingPlan } from "../../../types/pricing";

interface PricingPlanFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: CreatePricingPlanInput) => Promise<void>;
  /** Present when editing an existing plan; absent when creating one. */
  plan?: PricingPlan;
}

type CustomType = "text" | "number" | "boolean";

interface CustomRow {
  /** Kept when editing so existing keys never change; generated from the label for new rows. */
  key: string;
  label: string;
  type: CustomType;
  value: string;
}

function typeOf(value: PlanFeatureValue): CustomType {
  return typeof value === "boolean" ? "boolean" : typeof value === "number" ? "number" : "text";
}

/** "Priority support" -> "prioritySupport"; unique among the keys already taken. */
function makeKey(label: string, taken: Set<string>): string {
  const words = label.replace(/[^a-zA-Z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  let base = words.map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())).join("");
  if (!/^[a-zA-Z]/.test(base)) base = `feature${base}`;
  base = base.slice(0, 45) || "feature";
  let key = base;
  for (let n = 2; taken.has(key); n += 1) key = `${base}${n}`;
  return key;
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
  maxUsers: string;
  trialDays: string;
  custom: CustomRow[];
}

interface FormErrors {
  name?: string;
  description?: string;
  monthlyPrice?: string;
  yearlyPrice?: string;
  currency?: string;
  features?: string;
  maxUsers?: string;
  trialDays?: string;
  custom?: string;
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
  maxUsers: "",
  trialDays: "0",
  custom: [],
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
              maxUsers: plan.maxUsers === null ? "" : String(plan.maxUsers),
              trialDays: String(plan.trialDays),
              custom: plan.customFeatures.map((c) => ({
                key: c.key,
                label: c.label,
                type: typeOf(c.value),
                value: typeof c.value === "boolean" ? (c.value ? "yes" : "no") : String(c.value),
              })),
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

  const updateCustom = (index: number, patch: Partial<CustomRow>) => {
    setForm((f) => ({ ...f, custom: f.custom.map((row, i) => (i === index ? { ...row, ...patch } : row)) }));
  };

  const addCustom = () => {
    setForm((f) => ({ ...f, custom: [...f.custom, { key: "", label: "", type: "text", value: "" }] }));
  };

  const removeCustom = (index: number) => {
    setForm((f) => ({ ...f, custom: f.custom.filter((_, i) => i !== index) }));
  };

  /** Rows with no label are ignored. Returns null when a filled row has a bad value. */
  const buildCustomFeatures = (): PlanCustomFeature[] | null => {
    const rows = form.custom.filter((row) => row.label.trim());
    const taken = new Set(rows.map((r) => r.key).filter(Boolean));
    const result: PlanCustomFeature[] = [];
    for (const row of rows) {
      let value: PlanFeatureValue;
      if (row.type === "boolean") {
        value = row.value === "yes";
      } else if (row.type === "number") {
        if (row.value.trim() === "" || Number.isNaN(Number(row.value))) return null;
        value = Number(row.value);
      } else {
        if (!row.value.trim()) return null;
        value = row.value.trim();
      }
      const key = row.key || makeKey(row.label, taken);
      taken.add(key);
      result.push({ key, label: row.label.trim(), value });
    }
    return result;
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

    if (form.maxUsers.trim() !== "") {
      const max = Number(form.maxUsers);
      if (!Number.isInteger(max) || max < 1) nextErrors.maxUsers = "Enter a whole number of 1 or more, or leave blank for unlimited.";
    }
    const trial = Number(form.trialDays === "" ? "0" : form.trialDays);
    if (!Number.isInteger(trial) || trial < 0 || trial > 365) nextErrors.trialDays = "Enter 0 to 365 days.";
    if (buildCustomFeatures() === null) nextErrors.custom = "Give every extra feature a value.";

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
        maxUsers: form.maxUsers.trim() === "" ? null : Number(form.maxUsers),
        trialDays: Number(form.trialDays === "" ? "0" : form.trialDays),
        customFeatures: buildCustomFeatures() ?? [],
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

        <FormSection title="Limits" description="What a company gets on this plan.">
          <Input
            label="Max app users"
            type="number"
            min={1}
            step={1}
            value={form.maxUsers}
            onChange={(e) => setForm((f) => ({ ...f, maxUsers: e.target.value }))}
            error={errors.maxUsers}
            hint="Employees who sign in to the mobile app. Leave blank for unlimited."
            placeholder="50"
          />
          <Input
            label="Free trial (days)"
            type="number"
            min={0}
            max={365}
            step={1}
            value={form.trialDays}
            onChange={(e) => setForm((f) => ({ ...f, trialDays: e.target.value }))}
            error={errors.trialDays}
            hint="0 means no trial."
          />
        </FormSection>

        <FormSection title="Extra features" description="Your own plan details, such as support level or report history.">
          <div className="flex flex-col gap-3">
            {form.custom.map((row, index) => (
              <div key={index} className="flex flex-wrap items-center gap-2">
                <input
                  value={row.label}
                  onChange={(e) => updateCustom(index, { label: e.target.value })}
                  maxLength={100}
                  aria-label="Feature name"
                  placeholder="Feature name"
                  className="h-10 min-w-0 flex-1 basis-32 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                />
                <select
                  value={row.type}
                  onChange={(e) => updateCustom(index, { type: e.target.value as CustomType, value: e.target.value === "boolean" ? "yes" : "" })}
                  aria-label="Value type"
                  className="h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="boolean">Yes / No</option>
                </select>
                {row.type === "boolean" ? (
                  <select
                    value={row.value === "no" ? "no" : "yes"}
                    onChange={(e) => updateCustom(index, { value: e.target.value })}
                    aria-label="Value"
                    className="h-10 w-24 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                  >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                ) : (
                  <input
                    value={row.value}
                    type={row.type === "number" ? "number" : "text"}
                    onChange={(e) => updateCustom(index, { value: e.target.value })}
                    aria-label="Value"
                    placeholder="Value"
                    className="h-10 w-24 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                  />
                )}
                <button
                  type="button"
                  onClick={() => removeCustom(index)}
                  aria-label="Remove extra feature"
                  className="shrink-0 rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {errors.custom && <p className="text-sm text-red-600">{errors.custom}</p>}
            <div>
              <Button type="button" variant="secondary" size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={addCustom}>
                Add extra feature
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

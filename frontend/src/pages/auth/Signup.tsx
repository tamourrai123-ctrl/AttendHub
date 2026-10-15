import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { Building2, Mail, User } from "lucide-react";
import Input from "../../components/ui/Input";
import PasswordInput from "../../components/ui/PasswordInput";
import Button from "../../components/ui/Button";
import LoadingState from "../../components/ui/LoadingState";
import ErrorState from "../../components/ui/ErrorState";
import PlanCard from "../../components/plans/PlanCard";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../components/feedback/ToastContext";
import { getPublicPlans } from "../../api/pricing";
import { ApiError } from "../../api/client";
import { brand } from "../../config/brand";
import { ROLE_HOME_ROUTE } from "../../lib/permissions";
import { monthlyPriceLabel, trialLabel, userLimitLabel } from "../../lib/planHighlights";
import type { PricingPlan } from "../../types/pricing";
import type { AsyncStatus } from "../../types/common";

/** Passed in router state by the login page when a new Google account needs to finish signing up. */
interface GoogleSignupState {
  signupToken: string;
  email: string;
  name: string;
}

interface FormErrors {
  companyName?: string;
  companyShortname?: string;
  adminName?: string;
  email?: string;
  password?: string;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * New-company signup, in two steps: pick a plan, then enter company details.
 * Reached either from "Create an account" on the login page (email + password)
 * or after "Continue with Google" for an email that has no account yet — in
 * which case the Google identity is already known and no password is needed.
 */
export default function Signup() {
  const { signup, signupWithGoogle, isLoggingIn, isAuthenticated, user, error, clearError } = useAuth();
  const { showToast } = useToast();
  const location = useLocation();
  const google = (location.state as { google?: GoogleSignupState } | null)?.google;

  const [planStatus, setPlanStatus] = useState<AsyncStatus>("loading");
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [planError, setPlanError] = useState<string | undefined>(undefined);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [step, setStep] = useState<"plan" | "details">("plan");

  const [companyName, setCompanyName] = useState("");
  const [companyShortname, setCompanyShortname] = useState("");
  const [adminName, setAdminName] = useState(google?.name ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});

  const loadPlans = async () => {
    setPlanStatus("loading");
    try {
      const data = await getPublicPlans();
      setPlans(data);
      setSelectedId((current) => current ?? data.find((p) => p.recommended)?.id ?? null);
      // No published plans yet: nothing to choose, go straight to the company details.
      if (data.length === 0) setStep("details");
      setPlanStatus("success");
    } catch (err) {
      setPlanError(err instanceof ApiError ? err.message : "We couldn't load the plans.");
      setPlanStatus("error");
    }
  };

  useEffect(() => {
    loadPlans();
  }, []);

  const selectedPlan = useMemo(() => plans.find((p) => p.id === selectedId) ?? null, [plans, selectedId]);

  if (isAuthenticated && user) {
    return <Navigate to={ROLE_HOME_ROUTE[user.role]} replace />;
  }

  const validate = (): boolean => {
    const errors: FormErrors = {};
    if (!companyName.trim()) errors.companyName = "Enter your company name.";
    if (!companyShortname.trim()) errors.companyShortname = "Enter a short name.";
    else if (companyShortname.trim().length > 10) errors.companyShortname = "Use 10 characters or fewer.";
    if (!adminName.trim()) errors.adminName = "Enter your name.";
    if (!google) {
      if (!email.trim()) errors.email = "Email is required.";
      else if (!isValidEmail(email)) errors.email = "Enter a valid email address.";
      if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
        errors.password = "Use at least 8 characters, with a letter and a number.";
      }
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    clearError();
    if (!validate()) return;

    try {
      if (google) {
        await signupWithGoogle({
          signupToken: google.signupToken,
          companyName,
          companyShortname,
          planId: selectedPlan?.id,
          adminName,
        });
      } else {
        await signup({ companyName, companyShortname, adminName, email, password, planId: selectedPlan?.id });
      }
      const trial = selectedPlan ? trialLabel(selectedPlan.trialDays) : null;
      showToast({
        tone: "success",
        title: "Your company is ready",
        description: trial ? `Your ${trial} has started.` : "Next, connect your HR system under Integrations.",
      });
      // The auth context now holds the new user; the redirect above takes over on re-render.
    } catch {
      // error state is surfaced via useAuth().error
    }
  };

  const submitLabel = selectedPlan && selectedPlan.trialDays > 0 ? `Start ${selectedPlan.trialDays}-day free trial` : "Create account";

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12">
      <div className={`mx-auto w-full ${step === "plan" ? "max-w-5xl" : "max-w-md"}`}>
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">
            {brand.shortName}
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {step === "plan" ? "Choose your plan" : "Set up your company"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {step === "plan"
              ? "Pick what fits today. You can change it any time."
              : google
                ? `Signing up as ${google.email}`
                : "Tell us about your company to get started."}
          </p>
        </div>

        {planStatus === "loading" && <LoadingState variant="cards" rows={3} />}

        {planStatus === "error" && (
          <ErrorState title="Couldn't load plans" description={planError} onRetry={loadPlans} />
        )}

        {planStatus === "success" && step === "plan" && (
          <>
            <div
              role="radiogroup"
              aria-label="Plans"
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            >
              {plans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  selected={plan.id === selectedId}
                  onSelect={() => setSelectedId(plan.id)}
                />
              ))}
            </div>
            <div className="mt-8 flex flex-col items-center gap-3">
              <Button size="lg" className="w-full sm:w-64" disabled={!selectedPlan} onClick={() => setStep("details")}>
                Continue
              </Button>
              <p className="text-sm text-slate-500">
                Already have an account?{" "}
                <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
                  Sign in
                </Link>
              </p>
            </div>
          </>
        )}

        {planStatus === "success" && step === "details" && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card sm:p-8">
            {selectedPlan && (
              <div className="mb-6 flex items-start justify-between gap-3 rounded-lg bg-slate-50 px-4 py-3">
                <div className="text-sm">
                  <p className="font-medium text-slate-900">
                    {selectedPlan.name} · {monthlyPriceLabel(selectedPlan)}
                    {selectedPlan.monthlyPrice > 0 ? " per month" : ""}
                  </p>
                  <p className="text-slate-500">
                    {[trialLabel(selectedPlan.trialDays), userLimitLabel(selectedPlan.maxUsers)].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStep("plan")}
                  className="shrink-0 text-sm font-medium text-brand-600 hover:text-brand-700"
                >
                  Change
                </button>
              </div>
            )}

            {error && (
              <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
              <Input
                label="Company name"
                autoComplete="organization"
                leftIcon={<Building2 className="h-4 w-4" />}
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                error={fieldErrors.companyName}
              />
              <Input
                label="Short name"
                hint="Up to 10 characters. Your employees enter it to sign in on the mobile app."
                maxLength={10}
                value={companyShortname}
                onChange={(e) => setCompanyShortname(e.target.value)}
                error={fieldErrors.companyShortname}
              />
              <Input
                label="Your name"
                autoComplete="name"
                leftIcon={<User className="h-4 w-4" />}
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                error={fieldErrors.adminName}
              />
              {!google && (
                <>
                  <Input
                    label="Work email"
                    type="email"
                    autoComplete="email"
                    leftIcon={<Mail className="h-4 w-4" />}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    error={fieldErrors.email}
                  />
                  <PasswordInput
                    label="Password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    error={fieldErrors.password}
                  />
                </>
              )}

              <Button type="submit" size="lg" isLoading={isLoggingIn} className="mt-2 w-full">
                {submitLabel}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-500">
              Already have an account?{" "}
              <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
                Sign in
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

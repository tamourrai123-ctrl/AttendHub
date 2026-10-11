import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Mail, ShieldCheck } from "lucide-react";
import Input from "../../components/ui/Input";
import PasswordInput from "../../components/ui/PasswordInput";
import Checkbox from "../../components/ui/Checkbox";
import Button from "../../components/ui/Button";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../components/feedback/ToastContext";
import { brand } from "../../config/brand";
import { DEMO_CREDENTIAL_HINTS } from "../../mock/users";
import { ROLE_HOME_ROUTE } from "../../lib/permissions";

interface FormErrors {
  email?: string;
  password?: string;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function Login() {
  const { login, isLoggingIn, isAuthenticated, user, error, clearError } = useAuth();
  const { showToast } = useToast();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});

  if (isAuthenticated && user) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from ?? ROLE_HOME_ROUTE[user.role]} replace />;
  }

  const validate = (): boolean => {
    const errors: FormErrors = {};
    if (!email.trim()) {
      errors.email = "Email is required.";
    } else if (!isValidEmail(email)) {
      errors.email = "Enter a valid email address.";
    }
    if (!password) {
      errors.password = "Password is required.";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    clearError();
    if (!validate()) return;

    try {
      await login({ email, password, rememberMe });
      showToast({ tone: "success", title: "Welcome back", description: "You've signed in successfully." });
      // No explicit navigate() here: once login() updates the auth context,
      // this component re-renders and the isAuthenticated check above
      // redirects to the role's home route (or the page the user came from).
    } catch {
      // error state is already surfaced via useAuth().error
    }
  };

  const fillDemoAccount = (demoEmail: string, demoPassword: string) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
    setFieldErrors({});
    clearError();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">
            {brand.shortName}
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">{brand.name}</h1>
          <p className="mt-1 text-sm text-slate-500">{brand.tagline}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card sm:p-8">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-slate-900">Welcome back</h2>
            <p className="mt-1 text-sm text-slate-500">Sign in to continue</p>
          </div>

          {error && (
            <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
            <Input
              label="Email or Username"
              type="email"
              autoComplete="username"
              placeholder="you@company.com"
              leftIcon={<Mail className="h-4 w-4" />}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={fieldErrors.email}
            />
            <PasswordInput
              label="Password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={fieldErrors.password}
            />

            <div className="flex items-center justify-between">
              <Checkbox
                label="Remember me"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <a href="/forgot-password" className="text-sm font-medium text-brand-600 hover:text-brand-700">
                Forgot password?
              </a>
            </div>

            <Button type="submit" size="lg" isLoading={isLoggingIn} className="mt-2 w-full">
              Sign In
            </Button>
          </form>
        </div>

        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-100/60 p-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5" /> Demo credentials (development only)
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {DEMO_CREDENTIAL_HINTS.map((hint) => (
              <button
                key={hint.email}
                type="button"
                onClick={() => fillDemoAccount(hint.email, hint.password)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs hover:border-brand-300 hover:bg-brand-50"
              >
                <span className="block font-medium text-slate-700">{hint.role}</span>
                <span className="block text-slate-400">{hint.email}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

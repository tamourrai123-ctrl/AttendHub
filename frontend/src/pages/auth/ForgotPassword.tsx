import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { MailQuestion, ArrowLeft } from "lucide-react";
import Input from "../../components/ui/Input";
import Button from "../../components/ui/Button";
import { brand } from "../../config/brand";
import { forgotPassword } from "../../api/auth";
import { ApiError } from "../../api/client";

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Connected to the real POST /api/auth/forgot-password (Phase 4G/4H). The
 * backend always returns the same generic message whether or not the email
 * matches an account — this page must not try to be "smarter" than that
 * response by inferring success/failure from anything else.
 */
export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);

    if (!email.trim()) {
      setFieldError("Email is required.");
      return;
    }
    if (!isValidEmail(email)) {
      setFieldError("Enter a valid email address.");
      return;
    }
    setFieldError(undefined);

    setIsSubmitting(true);
    try {
      const message = await forgotPassword(email);
      setResultMessage(message);
    } catch (err) {
      setErrorMessage(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-brand-600">
        <MailQuestion className="h-7 w-7" />
      </span>
      <h1 className="mt-5 text-xl font-semibold text-slate-900">Reset your password</h1>

      {resultMessage ? (
        <p className="mt-2 max-w-sm text-sm text-slate-500">{resultMessage}</p>
      ) : (
        <div className="mt-4 w-full max-w-sm text-left">
          <p className="mb-4 text-center text-sm text-slate-500">
            Enter the email on your {brand.name} account and we'll send you a link to reset your password.
          </p>
          {errorMessage && (
            <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
              {errorMessage}
            </div>
          )}
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
            <Input
              label="Email"
              type="email"
              autoComplete="username"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={fieldError}
            />
            <Button type="submit" size="lg" isLoading={isSubmitting} className="w-full">
              Send reset link
            </Button>
          </form>
        </div>
      )}

      <Link
        to="/login"
        className="mt-6 flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
      >
        <ArrowLeft className="h-4 w-4" /> Back to sign in
      </Link>
    </div>
  );
}

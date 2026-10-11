import { useEffect, useState, type FormEvent } from "react";
import Modal from "../../../components/ui/Modal";
import Input from "../../../components/ui/Input";
import Button from "../../../components/ui/Button";
import { ApiError } from "../../../api/client";
import type { Company, CompanyFormSubmission, CompanyStatus } from "../../../types/company";

interface CompanyFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (submission: CompanyFormSubmission) => Promise<void>;
  /** Present when editing an existing company; absent when creating one. */
  company?: Company;
}

interface FormState {
  id: string;
  name: string;
  shortname: string;
  email: string;
  contactPerson: string;
  phone: string;
  status: CompanyStatus;
  country: string;
}

interface FormErrors {
  id?: string;
  name?: string;
  shortname?: string;
  email?: string;
  contactPerson?: string;
  phone?: string;
  country?: string;
}

const EMPTY_FORM: FormState = {
  id: "",
  name: "",
  shortname: "",
  email: "",
  contactPerson: "",
  phone: "",
  status: "ACTIVE",
  country: "",
};

/** Known form field names, longest-first so a message that starts with a
 * more specific prefix (e.g. "contactPerson") isn't ever swallowed by a
 * shorter one. Used to route backend class-validator messages (which start
 * with the DTO property name, e.g. "shortname must be shorter than or
 * equal to 10 characters") to the matching input. */
const FIELD_NAMES: (keyof FormErrors)[] = ["contactPerson", "shortname", "country", "email", "phone", "name", "id"];

function mapFieldErrors(messages: string[]): { fieldErrors: FormErrors; unmatched: string[] } {
  const fieldErrors: FormErrors = {};
  const unmatched: string[] = [];
  for (const message of messages) {
    const lower = message.toLowerCase();
    const match = FIELD_NAMES.find((field) => lower.startsWith(field.toLowerCase()));
    if (match) {
      if (!fieldErrors[match]) fieldErrors[match] = message;
    } else {
      unmatched.push(message);
    }
  }
  return { fieldErrors, unmatched };
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidPhone(value: string): boolean {
  return /^[+\d][\d\s-]{6,}$/.test(value);
}

function isValidCountryCode(value: string): boolean {
  return /^-?\d+$/.test(value);
}

export default function CompanyFormModal({ isOpen, onClose, onSubmit, company }: CompanyFormModalProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEditing = Boolean(company);

  useEffect(() => {
    if (isOpen) {
      setForm(
        company
          ? {
              id: company.id,
              name: company.name,
              shortname: company.shortname,
              email: company.email,
              contactPerson: company.contactPerson,
              phone: company.phone,
              status: company.status,
              country: String(company.country),
            }
          : EMPTY_FORM
      );
      setErrors({});
      setSubmitError(null);
    }
  }, [isOpen, company]);

  const validate = (): boolean => {
    const nextErrors: FormErrors = {};

    if (!isEditing) {
      const trimmedId = form.id.trim();
      if (!trimmedId) {
        nextErrors.id = "Company ID is required.";
      } else if (trimmedId.length > 2) {
        // Backend DTO constraint is @Length(1, 2) — 1 to 2 characters, not "exactly 2".
        nextErrors.id = "Company ID must be 1-2 characters.";
      }
    }

    if (!form.name.trim()) nextErrors.name = "Company name is required.";

    if (!form.shortname.trim()) {
      nextErrors.shortname = "Short name is required.";
    } else if (form.shortname.trim().length > 10) {
      nextErrors.shortname = "Short name must be 10 characters or fewer.";
    }

    if (!form.email.trim()) {
      nextErrors.email = "Company email is required.";
    } else if (!isValidEmail(form.email)) {
      nextErrors.email = "Email address is invalid.";
    }

    if (!form.contactPerson.trim()) nextErrors.contactPerson = "Contact person is required.";

    if (!form.phone.trim()) {
      nextErrors.phone = "Phone number is required.";
    } else if (!isValidPhone(form.phone)) {
      nextErrors.phone = "Phone number is invalid.";
    }

    const trimmedCountry = form.country.trim();
    if (!trimmedCountry) {
      nextErrors.country = "Country code is required.";
    } else if (!isValidCountryCode(trimmedCountry)) {
      nextErrors.country = "Country code must be a whole number.";
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
      if (isEditing) {
        const submission: CompanyFormSubmission = {
          mode: "update",
          input: {
            name: form.name.trim(),
            shortname: form.shortname.trim(),
            email: form.email.trim(),
            contactPerson: form.contactPerson.trim(),
            phone: form.phone.trim(),
            status: form.status,
            country: Number(form.country.trim()),
          },
        };
        await onSubmit(submission);
      } else {
        const submission: CompanyFormSubmission = {
          mode: "create",
          input: {
            id: form.id.trim(),
            name: form.name.trim(),
            shortname: form.shortname.trim(),
            email: form.email.trim(),
            contactPerson: form.contactPerson.trim(),
            phone: form.phone.trim(),
            status: form.status,
            country: Number(form.country.trim()),
          },
        };
        await onSubmit(submission);
      }
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors && err.fieldErrors.length > 0) {
        const { fieldErrors: mapped, unmatched } = mapFieldErrors(err.fieldErrors);
        setErrors((prev) => ({ ...prev, ...mapped }));
        setSubmitError(unmatched.length > 0 ? unmatched.join(" ") : null);
      } else if (err instanceof ApiError) {
        setSubmitError(err.message);
      } else {
        setSubmitError("Something went wrong. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? "Edit Company" : "Add Company"}
      description={isEditing ? "Update this company's profile." : "Onboard a new company to the platform."}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="company-form" isLoading={isSubmitting}>
            {isEditing ? "Save Changes" : "Create Company"}
          </Button>
        </>
      }
    >
      <form id="company-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {submitError && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
            {submitError}
          </div>
        )}
        <Input
          label="Company ID"
          value={form.id}
          onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))}
          error={errors.id}
          hint={isEditing ? "Company ID cannot be changed after creation." : "1-2 characters. Chosen by you, not generated automatically."}
          placeholder="ZE"
          disabled={isEditing}
          maxLength={2}
        />
        <Input
          label="Company Name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          error={errors.name}
          placeholder="Acme Corporation"
        />
        <Input
          label="Short Name"
          value={form.shortname}
          onChange={(e) => setForm((f) => ({ ...f, shortname: e.target.value }))}
          error={errors.shortname}
          hint="Up to 10 characters. Must be unique across all companies."
          placeholder="ACME"
          maxLength={10}
        />
        <Input
          label="Company Email"
          type="email"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          error={errors.email}
          placeholder="ops@acme.test"
        />
        <Input
          label="Contact Person"
          value={form.contactPerson}
          onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))}
          error={errors.contactPerson}
          placeholder="Jane Doe"
        />
        <Input
          label="Phone"
          type="tel"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          error={errors.phone}
          placeholder="+1 555 123 4567"
        />
        <Input
          label="Country Code"
          value={form.country}
          onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
          error={errors.country}
          hint="No country list is available yet — enter the numeric country code directly."
          placeholder="e.g. 92"
          inputMode="numeric"
        />
        <div>
          <label htmlFor="company-status" className="mb-1.5 block text-sm font-medium text-slate-700">
            Status
          </label>
          <select
            id="company-status"
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as CompanyStatus }))}
            className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          >
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="SUSPENDED">Suspended</option>
          </select>
        </div>
      </form>
    </Modal>
  );
}

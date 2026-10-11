import { useEffect, useState, type FormEvent } from "react";
import Modal from "../../../components/ui/Modal";
import Input from "../../../components/ui/Input";
import Button from "../../../components/ui/Button";
import { getMyIntegration } from "../../../api/integrations";
import type { CreateEmployeeInput, Employee } from "../../../types/employee";

interface EmployeeFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: CreateEmployeeInput) => Promise<void>;
  /** Present when editing an existing employee; absent when creating one. */
  employee?: Employee;
}

interface FormErrors {
  name?: string;
  email?: string;
  hrId?: string;
}

const EMPTY_FORM: CreateEmployeeInput = {
  name: "",
  email: "",
  phone: "",
  mobile: "",
};

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Employee Credential Handling phase: this form represents an HR record,
 * not an AttendHub portal login account. There is no password field, no
 * confirm-password field, no "generate password" action, and no
 * reset/change-password action — Company Admins cannot create or manage
 * employee login credentials here or anywhere else. Employee credentials
 * originate in the connected external HR software.
 *
 * Fields match the real backend contract exactly (CreateEmployeeDto /
 * UpdateEmployeeDto): name, email, phone, mobile. No employeeCode,
 * department, designation, or status — usm_users has no corresponding
 * columns, and the global ValidationPipe (forbidNonWhitelisted: true)
 * would reject any of those fields if this form submitted them.
 */
export default function EmployeeFormModal({ isOpen, onClose, onSubmit, employee }: EmployeeFormModalProps) {
  const [form, setForm] = useState<CreateEmployeeInput>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [hrId, setHrId] = useState("");
  const [integrationId, setIntegrationId] = useState<string | null>(null);

  const isEditing = Boolean(employee);

  useEffect(() => {
    if (isOpen) {
      setForm(
        employee
          ? {
              name: employee.name,
              email: employee.email,
              phone: employee.phone ?? "",
              mobile: employee.mobile ?? "",
            }
          : EMPTY_FORM
      );
      setHrId(employee?.externalEmployeeId ?? "");
      setErrors({});
      setSubmitError(null);
      // The company has one HR integration; its id is sent automatically with the HR Employee ID.
      getMyIntegration()
        .then((i) => setIntegrationId(i ? i.id : null))
        .catch(() => setIntegrationId(null));
    }
  }, [isOpen, employee]);

  const validate = (): boolean => {
    const nextErrors: FormErrors = {};
    if (!form.name.trim()) nextErrors.name = "Full name is required.";
    if (!form.email.trim()) {
      nextErrors.email = "Email is required.";
    } else if (!isValidEmail(form.email)) {
      nextErrors.email = "Email address is invalid.";
    }
    if (hrId.trim() && !integrationId) {
      nextErrors.hrId = "Create your HR integration first, then you can link an HR Employee ID.";
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
      const hr = hrId.trim();
      await onSubmit(hr && integrationId ? { ...form, integrationId, externalEmployeeId: hr } : form);
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
      title={isEditing ? "Edit Employee" : "Add Employee"}
      description={isEditing ? "Update this employee's HR record." : "Add a new employee HR record to your company."}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="employee-form" isLoading={isSubmitting}>
            {isEditing ? "Save Changes" : "Add Employee"}
          </Button>
        </>
      }
    >
      <form id="employee-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {submitError && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
            {submitError}
          </div>
        )}
        <Input
          label="Full Name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          error={errors.name}
          placeholder="Jane Doe"
        />
        <Input
          label="Email"
          type="email"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          error={errors.email}
          placeholder="jane.doe@company.test"
        />
        <Input
          label="Phone"
          value={form.phone ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          placeholder="+92 300 1234567"
        />
        <Input
          label="Mobile"
          value={form.mobile ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value }))}
          placeholder="+92 300 7654321"
        />
        <Input
          label="HR Employee ID"
          value={hrId}
          onChange={(e) => setHrId(e.target.value)}
          error={errors.hrId}
          placeholder="e.g. 42 (the id in your HR system)"
        />
      </form>
    </Modal>
  );
}

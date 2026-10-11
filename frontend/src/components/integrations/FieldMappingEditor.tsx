import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import ConfirmDialog from "../ui/ConfirmDialog";
import EmptyState from "../ui/EmptyState";
import LoadingState from "../ui/LoadingState";
import ErrorState from "../ui/ErrorState";
import Input from "../ui/Input";
import { suggestedHrField, suggestedHrFields } from "./hrFieldSuggestions";
import { useToast } from "../feedback/ToastContext";
import { createFieldMapping, deleteFieldMapping, getFieldMappings, updateFieldMapping } from "../../api/fieldMappings";
import { ApiError } from "../../api/client";
import type { CreateFieldMappingInput, FieldMappingRecord, FieldMappingTransform } from "../../types/fieldMapping";
import type { EndpointPurpose, EndpointPurposeField, IntegrationEndpoint } from "../../types/endpoint";

const TRANSFORM_OPTIONS: { value: FieldMappingTransform; label: string }[] = [
  { value: "NONE", label: "None — copy as-is" },
  { value: "TRIM", label: "Trim whitespace" },
  { value: "UPPERCASE", label: "Uppercase" },
  { value: "LOWERCASE", label: "Lowercase" },
  { value: "TO_STRING", label: "Convert to text" },
  { value: "DATE_ISO", label: "Date / time — any format" },
  { value: "VALUE_MAP", label: "Map specific values" },
  { value: "DEFAULT_IF_EMPTY", label: "Require a default value" },
];

function errorMessageFor(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

/**
 * Only meaningful for a bidirectional purpose (purpose.requestFields/
 * responseFields set — see EndpointPurpose). REQUEST = this mapping sends an
 * AttendHub value out to HR (behaves like an OUTBOUND mapping: ownField ->
 * sourcePath). RESPONSE = this mapping reads a value back from HR's response
 * (behaves like an INBOUND mapping: ownField -> targetField).
 */
type MappingDirection = "REQUEST" | "RESPONSE";

interface FormState {
  ownField: string; // the AttendHub-side field — a fixed dropdown value when `purpose` is set, otherwise free text
  otherField: string; // the HR-system-side field — always free text
  transformType: FieldMappingTransform;
  defaultValue: string;
  inputFormat: string;
  outputFormat: string;
  valueMapText: string;
  sortOrder: string;
  direction: MappingDirection; // only used/shown when the purpose is bidirectional
}

const EMPTY_FORM: FormState = {
  ownField: "",
  otherField: "",
  transformType: "NONE",
  defaultValue: "",
  inputFormat: "",
  outputFormat: "",
  valueMapText: "",
  sortOrder: "1",
  direction: "REQUEST",
};

function isBidirectional(purpose?: EndpointPurpose): boolean {
  return Boolean(purpose && ((purpose.requestFields?.length ?? 0) > 0 || (purpose.responseFields?.length ?? 0) > 0));
}

/** For a bidirectional purpose, was this EXISTING mapping a "sending" (request) or "reading" (response) mapping? Judged by which fixed field list its targetField falls in — see assertFieldAllowedForPurpose() on the backend, which enforces the same rule. */
function directionOfExisting(mapping: FieldMappingRecord, purpose: EndpointPurpose): MappingDirection {
  const responseFieldNames = (purpose.responseFields ?? []).map((field) => field.field);
  return responseFieldNames.includes(mapping.targetField) ? "RESPONSE" : "REQUEST";
}

/** Whichever fixed AttendHub-side field list currently applies to the modal — purpose.fields for a single-direction purpose, or the request/response half of a bidirectional one depending on the chosen direction. */
function fieldOptionsFor(purpose: EndpointPurpose | undefined, direction: MappingDirection): EndpointPurposeField[] {
  if (!purpose) return [];
  if (isBidirectional(purpose)) {
    return (direction === "RESPONSE" ? purpose.responseFields : purpose.requestFields) ?? [];
  }
  return purpose.fields;
}

function toFormState(mapping: FieldMappingRecord, isInbound: boolean, purpose?: EndpointPurpose): FormState {
  const config = mapping.transformConfig ?? {};
  const valueMap = config.valueMap as Record<string, string> | undefined;
  const direction = purpose && isBidirectional(purpose) ? directionOfExisting(mapping, purpose) : "REQUEST";
  const effectiveInbound = purpose && isBidirectional(purpose) ? direction === "RESPONSE" : isInbound;
  return {
    ownField: effectiveInbound ? mapping.targetField : mapping.sourcePath,
    otherField: effectiveInbound ? mapping.sourcePath : mapping.targetField,
    transformType: mapping.transformType,
    defaultValue: typeof config.defaultValue === "string" ? config.defaultValue : "",
    inputFormat: typeof config.inputFormat === "string" ? config.inputFormat : "",
    outputFormat: typeof config.outputFormat === "string" ? config.outputFormat : "",
    valueMapText: valueMap ? JSON.stringify(valueMap, null, 2) : "",
    sortOrder: String(mapping.sortOrder ?? 1),
    direction,
  };
}

interface FieldMappingEditorProps {
  integrationId: string;
  companyId: string;
  endpoint: IntegrationEndpoint;
  purpose?: EndpointPurpose;
}

/**
 * Add/edit/delete the field mappings under ONE endpoint. When `purpose` is
 * set (the endpoint's name matches a fixed Phase 2 purpose — ATTENDANCE_FETCH/
 * ATTENDANCE_POST/LEAVE/EMPLOYEES), the AttendHub-side field is a fixed
 * dropdown drawn from purpose.fields — the backend rejects anything else for
 * that side, see FieldMappingsService.assertFieldAllowedForPurpose(). The
 * HR-system-side field is always free text since it varies per company's
 * real HR system. Endpoints with no matching purpose keep both sides
 * freeform, exactly as before this phase.
 *
 * EMPLOYEE_LOGIN (and any future purpose like it) is bidirectional — it
 * needs mappings going BOTH ways on the same endpoint (send username/
 * password out, read the employee id back), so purpose.fields is empty and
 * purpose.requestFields/responseFields are used instead. For those, each
 * mapping picks its own direction via the "What does this mapping do?"
 * selector below (form.direction) rather than the endpoint having one fixed
 * direction — see isBidirectional()/fieldOptionsFor()/directionOfExisting().
 */
export default function FieldMappingEditor({ integrationId, companyId, endpoint, purpose }: FieldMappingEditorProps) {
  const { showToast } = useToast();
  const isInbound = (purpose?.direction ?? endpoint.direction) === "INBOUND";
  const bidirectional = isBidirectional(purpose);

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [mappings, setMappings] = useState<FieldMappingRecord[]>([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMapping, setEditingMapping] = useState<FieldMappingRecord | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);

  const [mappingPendingDelete, setMappingPendingDelete] = useState<FieldMappingRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const result = await getFieldMappings(integrationId, endpoint.id, companyId, 1, 100);
      setMappings([...result.items].sort((a, b) => a.sortOrder - b.sortOrder));
      setStatus("success");
    } catch (err) {
      setLoadError(errorMessageFor(err, "We couldn't load field mappings for this endpoint."));
      setStatus("error");
    }
  }, [integrationId, endpoint.id, companyId]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreateModal = () => {
    setEditingMapping(null);
    setForm({ ...EMPTY_FORM, sortOrder: String(mappings.length + 1) });
    setFormError(undefined);
    setIsModalOpen(true);
  };

  const openEditModal = (mapping: FieldMappingRecord) => {
    setEditingMapping(mapping);
    setForm(toFormState(mapping, isInbound, purpose));
    setFormError(undefined);
    setIsModalOpen(true);
  };

  // Which way THIS mapping goes — the endpoint's fixed direction, unless the
  // purpose is bidirectional, in which case it's whatever the modal's own
  // "What does this mapping do?" selector is currently set to.
  const modalIsInbound = bidirectional ? form.direction === "RESPONSE" : isInbound;

  const handleDirectionChange = (direction: MappingDirection) => {
    // The AttendHub field list changes with direction, so any previously
    // chosen field (from the other list) is no longer valid — clear it.
    setForm({ ...form, direction, ownField: "" });
  };

  // Picking an AttendHub field pre-fills the HR field with the name the HR API document uses, unless the admin has
  // already typed their own. Still editable: another HR system may name its fields differently.
  const handleOwnFieldChange = (ownField: string) => {
    const suggestion = suggestedHrField(purpose?.name, ownField);
    const previousSuggestion = suggestedHrField(purpose?.name, form.ownField);
    const adminTypedOwn = form.otherField.trim() !== "" && form.otherField !== previousSuggestion;
    setForm({ ...form, ownField, otherField: adminTypedOwn || !suggestion ? form.otherField : suggestion });
  };

  const buildPayload = (): CreateFieldMappingInput | undefined => {
    const ownField = form.ownField.trim();
    const otherField = form.otherField.trim();
    if (!ownField || !otherField) {
      setFormError(purpose ? "Please choose a field and fill in the HR system's field name." : "Both fields are required.");
      return undefined;
    }

    const transformConfig: Record<string, unknown> = {};
    if (form.defaultValue.trim()) {
      transformConfig.defaultValue = form.defaultValue.trim();
    }
    if (form.transformType === "DATE_ISO") {
      if (form.inputFormat.trim()) transformConfig.inputFormat = form.inputFormat.trim();
      if (form.outputFormat.trim()) transformConfig.outputFormat = form.outputFormat.trim();
    }
    if (form.transformType === "VALUE_MAP") {
      if (!form.valueMapText.trim()) {
        setFormError('A value map is required for "Map specific values" — e.g. {"M": "Male", "F": "Female"}.');
        return undefined;
      }
      try {
        const parsed = JSON.parse(form.valueMapText);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          throw new Error("not an object");
        }
        for (const value of Object.values(parsed)) {
          if (typeof value !== "string") throw new Error("non-string value");
        }
        transformConfig.valueMap = parsed;
      } catch {
        setFormError('The value map must be valid JSON mapping each source value to a piece of text, e.g. {"M": "Male", "F": "Female"}.');
        return undefined;
      }
    }
    if (form.transformType === "DEFAULT_IF_EMPTY" && !form.defaultValue.trim()) {
      setFormError('A default value is required for "Require a default value".');
      return undefined;
    }

    const sortOrder = Number(form.sortOrder);

    return {
      sourcePath: modalIsInbound ? otherField : ownField,
      targetField: modalIsInbound ? ownField : otherField,
      transformType: form.transformType,
      transformConfig,
      sortOrder: Number.isFinite(sortOrder) && sortOrder > 0 ? sortOrder : 1,
    };
  };

  const handleSave = async () => {
    setFormError(undefined);
    const payload = buildPayload();
    if (!payload) return;

    setIsSaving(true);
    try {
      if (editingMapping) {
        await updateFieldMapping(integrationId, endpoint.id, companyId, editingMapping.id, payload);
        showToast({ tone: "success", title: "Mapping updated" });
      } else {
        await createFieldMapping(integrationId, endpoint.id, companyId, payload);
        showToast({ tone: "success", title: "Mapping added" });
      }
      setIsModalOpen(false);
      await load();
    } catch (err) {
      setFormError(errorMessageFor(err, "Something went wrong while saving this mapping."));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!mappingPendingDelete) return;
    setIsDeleting(true);
    try {
      await deleteFieldMapping(integrationId, endpoint.id, companyId, mappingPendingDelete.id);
      showToast({ tone: "success", title: "Mapping deleted" });
      setMappingPendingDelete(null);
      await load();
    } catch (err) {
      showToast({ tone: "error", title: "Couldn't delete mapping", description: errorMessageFor(err, "Something went wrong.") });
    } finally {
      setIsDeleting(false);
    }
  };

  if (status === "loading") return <LoadingState variant="table" rows={2} />;
  if (status === "error") return <ErrorState description={loadError} onRetry={load} />;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Field mappings</p>
        <Button size="sm" variant="secondary" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={openCreateModal}>
          Add mapping
        </Button>
      </div>

      {mappings.length === 0 ? (
        <EmptyState
          title="No field mappings yet"
          description={
            bidirectional
              ? 'Map the fields you send to your HR system (like username/password) and the field you read back from it (like the employee id) — choose which for each mapping below.'
              : isInbound
                ? "Map fields coming from your HR system to the fields AttendHub uses, so this endpoint's data can be used once fetched."
                : "Map AttendHub's own fields to the field names your HR system expects, so AttendHub can send this data out."
          }
          action={
            <Button size="sm" onClick={openCreateModal} leftIcon={<Plus className="h-3.5 w-3.5" />}>
              Add mapping
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                {bidirectional && <th className="px-3 py-2">Direction</th>}
                <th className="px-3 py-2">HR system field</th>
                <th className="px-3 py-2" />
                <th className="px-3 py-2">AttendHub field</th>
                <th className="px-3 py-2">Transform</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {mappings.map((mapping) => {
                const rowIsInbound = bidirectional
                  ? Boolean(purpose && directionOfExisting(mapping, purpose) === "RESPONSE")
                  : isInbound;
                return (
                  <tr key={mapping.id}>
                    {bidirectional && (
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            rowIsInbound ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700"
                          }`}
                        >
                          {rowIsInbound ? "Reading from HR" : "Sending to HR"}
                        </span>
                      </td>
                    )}
                    <td className="px-3 py-2 font-mono text-xs text-slate-700">
                      {rowIsInbound ? mapping.sourcePath : mapping.targetField}
                    </td>
                    <td className="px-3 py-2 text-slate-300">→</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-700">
                      {rowIsInbound ? mapping.targetField : mapping.sourcePath}
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      {TRANSFORM_OPTIONS.find((option) => option.value === mapping.transformType)?.label ?? mapping.transformType}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(mapping)}
                          aria-label="Edit mapping"
                          className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setMappingPendingDelete(mapping)}
                          aria-label="Delete mapping"
                          className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingMapping ? "Edit field mapping" : "Add field mapping"}
        description={
          bidirectional
            ? `Choose what this mapping does, then pick one of the fixed "${purpose?.label}" fields and the matching field name your HR system uses.`
            : purpose
              ? `Choose one of the fixed "${purpose.label}" fields and the matching field name your HR system uses.`
              : "Map a field from one side to the other."
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} isLoading={isSaving}>
              {editingMapping ? "Save changes" : "Add mapping"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {bidirectional && (purpose?.responseFields?.length ?? 0) > 0 && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">What does this mapping do?</label>
              <select
                value={form.direction}
                onChange={(e) => handleDirectionChange(e.target.value as MappingDirection)}
                className="block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              >
                <option value="REQUEST">Sends an AttendHub value to HR (e.g. username, password)</option>
                <option value="RESPONSE">Reads a value back from HR's response (e.g. the employee id)</option>
              </select>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">AttendHub field</label>
            {purpose ? (
              <select
                value={form.ownField}
                onChange={(e) => handleOwnFieldChange(e.target.value)}
                className="block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              >
                <option value="" disabled>
                  Select a field…
                </option>
                {fieldOptionsFor(purpose, form.direction).map((field: EndpointPurposeField) => (
                  <option key={field.field} value={field.field}>
                    {field.label} ({field.field})
                  </option>
                ))}
              </select>
            ) : (
              <Input
                value={form.ownField}
                onChange={(e) => setForm({ ...form, ownField: e.target.value })}
                placeholder="e.g. profile.employeeId"
              />
            )}
          </div>

          <Input
            label="HR system field"
            hint={modalIsInbound ? 'Structural path in the response, e.g. "data[].employee_id".' : "The field name your HR system expects."}
            value={form.otherField}
            onChange={(e) => setForm({ ...form, otherField: e.target.value })}
            placeholder={modalIsInbound ? "data[].employee_id" : "employee_id"}
            list="hr-field-suggestions"
          />
          <datalist id="hr-field-suggestions">
            {suggestedHrFields(purpose?.name).map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Transform</label>
            <select
              value={form.transformType}
              onChange={(e) => setForm({ ...form, transformType: e.target.value as FieldMappingTransform })}
              className="block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            >
              {TRANSFORM_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {form.transformType === "VALUE_MAP" && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Value map (JSON)</label>
              <textarea
                value={form.valueMapText}
                onChange={(e) => setForm({ ...form, valueMapText: e.target.value })}
                rows={3}
                placeholder='{"M": "Male", "F": "Female"}'
                className="block w-full rounded-lg border border-slate-300 bg-white p-3 font-mono text-xs text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              />
            </div>
          )}

          {form.transformType === "DATE_ISO" && (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <Input
                label="Output format (how the date is written)"
                hint="Empty = ISO (2026-07-22T13:12:01.000Z). Examples: YYYY-MM-DD HH:mm:ss · M/D/YYYY h:mm:ss.SSSSSS A · DD-MM-YYYY · EPOCH"
                value={form.outputFormat}
                onChange={(e) => setForm({ ...form, outputFormat: e.target.value })}
                list="date-output-formats"
              />
              <datalist id="date-output-formats">
                {["ISO", "YYYY-MM-DD HH:mm:ss", "YYYY-MM-DD", "M/D/YYYY h:mm:ss.SSSSSS A", "DD/MM/YYYY HH:mm", "DD-MMM-YYYY", "EPOCH", "EPOCH_MS"].map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
              <Input
                label="Input format (optional)"
                hint="Leave empty to detect automatically (ISO, 7/22/2026 11:34 AM, 22-07-2026, epoch…). Fill only for an unusual format. Letters: YYYY MM DD HH hh mm ss SSS A, [text] for fixed text."
                value={form.inputFormat}
                onChange={(e) => setForm({ ...form, inputFormat: e.target.value })}
              />
            </div>
          )}

          <Input
            label={form.transformType === "DEFAULT_IF_EMPTY" ? "Default value (required)" : "Default value (optional)"}
            hint="Used when the source value is missing."
            value={form.defaultValue}
            onChange={(e) => setForm({ ...form, defaultValue: e.target.value })}
          />

          <Input
            label="Sort order"
            type="number"
            min={1}
            value={form.sortOrder}
            onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
          />

          {formError && <p className="text-sm text-red-600">{formError}</p>}
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(mappingPendingDelete)}
        title="Delete this field mapping?"
        description="This can't be undone."
        confirmLabel="Delete"
        isDestructive
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setMappingPendingDelete(null)}
      />
    </div>
  );
}

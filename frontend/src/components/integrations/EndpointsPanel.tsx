import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Pencil, PlayCircle, Plus, Trash2, XCircle } from "lucide-react";
import Card from "../ui/Card";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import Tabs from "../ui/Tabs";
import Modal from "../ui/Modal";
import ConfirmDialog from "../ui/ConfirmDialog";
import EmptyState from "../ui/EmptyState";
import LoadingState from "../ui/LoadingState";
import ErrorState from "../ui/ErrorState";
import Input from "../ui/Input";
import JsonViewer from "../ui/JsonViewer";
import { useToast } from "../feedback/ToastContext";
import { createEndpoint, deleteEndpoint, getEndpointPurposes, getEndpoints, testEndpoint, updateEndpoint } from "../../api/endpoints";
import { getFieldMappings } from "../../api/fieldMappings";
import { previewFieldMapping, toPreviewMapping } from "../../api/integrationTools";
import { ApiError } from "../../api/client";
import FieldMappingEditor from "./FieldMappingEditor";
import { PARAM_LABELS, pathParamNames } from "./pathPlaceholders";
import type {
  EndpointDirection,
  EndpointPayloadType,
  EndpointPurpose,
  IntegrationEndpoint,
  TestEndpointResult,
} from "../../types/endpoint";

const CUSTOM_PURPOSE_VALUE = "__CUSTOM__";
const PAYLOAD_TYPES: EndpointPayloadType[] = ["JSON", "XML", "FORM"];
const DIRECTION_TABS: { key: EndpointDirection; label: string }[] = [
  { key: "INBOUND", label: "Inbound — from HR" },
  { key: "OUTBOUND", label: "Outbound — to HR" },
];

function errorMessageFor(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

interface EndpointFormState {
  purposeName: string; // CUSTOM_PURPOSE_VALUE, or one of the fixed purpose names
  name: string;
  description: string;
  endpoint: string;
  httpMethod: string;
  requestType: EndpointPayloadType;
  responseType: EndpointPayloadType;
  sortOrder: string;
}

function emptyForm(direction: EndpointDirection): EndpointFormState {
  return {
    purposeName: CUSTOM_PURPOSE_VALUE,
    name: "",
    description: "",
    endpoint: "",
    httpMethod: direction === "INBOUND" ? "GET" : "POST",
    requestType: "JSON",
    responseType: "JSON",
    sortOrder: "1",
  };
}

interface EndpointsPanelProps {
  integrationId: string;
  companyId: string;
}

export default function EndpointsPanel({ integrationId, companyId }: EndpointsPanelProps) {
  const { showToast } = useToast();

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [endpoints, setEndpoints] = useState<IntegrationEndpoint[]>([]);
  const [purposes, setPurposes] = useState<EndpointPurpose[]>([]);
  const [direction, setDirection] = useState<EndpointDirection>("INBOUND");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEndpoint, setEditingEndpoint] = useState<IntegrationEndpoint | null>(null);
  const [form, setForm] = useState<EndpointFormState>(emptyForm("INBOUND"));
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);

  const [endpointPendingDelete, setEndpointPendingDelete] = useState<IntegrationEndpoint | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestEndpointResult>>({});
  const [testErrors, setTestErrors] = useState<Record<string, string>>({});

  const [testParams, setTestParams] = useState<Record<string, Record<string, string>>>({});
  const [previewSampleText, setPreviewSampleText] = useState("{}");
  const [previewResult, setPreviewResult] = useState<unknown>(undefined);
  const [previewError, setPreviewError] = useState<string | undefined>(undefined);
  const [isPreviewing, setIsPreviewing] = useState(false);

  const purposeByName = useMemo(() => new Map(purposes.map((purpose) => [purpose.name, purpose])), [purposes]);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const [endpointsResult, purposesResult] = await Promise.all([
        getEndpoints(integrationId, companyId, 1, 100),
        getEndpointPurposes(),
      ]);
      setEndpoints(endpointsResult.items);
      setPurposes(purposesResult);
      setStatus("success");
    } catch (err) {
      setLoadError(errorMessageFor(err, "We couldn't load endpoints for this integration."));
      setStatus("error");
    }
  }, [integrationId, companyId]);

  useEffect(() => {
    load();
  }, [load]);

  const visibleEndpoints = endpoints.filter((endpoint) => endpoint.direction === direction);
  const selectedPurpose = purposeByName.get(form.purposeName);
  const purposeMethodChoices = selectedPurpose?.allowedHttpMethods ?? null;
  // Every purpose is selectable from either tab, grouped by direction (POST purposes such as Attendance Post and
  // Login Session are Outbound; picking one switches to that tab).
  const inboundPurposes = purposes.filter((purpose) => purpose.direction === "INBOUND" && !purpose.hideFromPicker);
  const outboundPurposes = purposes.filter((purpose) => purpose.direction === "OUTBOUND" && !purpose.hideFromPicker);

  const openCreateModal = () => {
    setEditingEndpoint(null);
    setForm(emptyForm(direction));
    setFormError(undefined);
    setIsModalOpen(true);
  };

  const openEditModal = (endpoint: IntegrationEndpoint) => {
    const purpose = purposeByName.get(endpoint.name);
    setEditingEndpoint(endpoint);
    setForm({
      purposeName: purpose ? purpose.name : CUSTOM_PURPOSE_VALUE,
      name: endpoint.name,
      description: endpoint.description ?? "",
      endpoint: endpoint.endpoint,
      httpMethod: endpoint.httpMethod,
      requestType: endpoint.requestType,
      responseType: endpoint.responseType,
      sortOrder: String(endpoint.sortOrder ?? 1),
    });
    setFormError(undefined);
    setIsModalOpen(true);
  };

  const handlePurposeChange = (purposeName: string) => {
    if (purposeName === CUSTOM_PURPOSE_VALUE) {
      setForm({ ...form, purposeName, name: "", httpMethod: direction === "INBOUND" ? "GET" : "POST" });
      return;
    }
    const purpose = purposeByName.get(purposeName);
    if (!purpose) return;
    setDirection(purpose.direction);
    setForm({ ...form, purposeName, name: purpose.name, httpMethod: purpose.defaultHttpMethod });
  };

  const handleSave = async () => {
    setFormError(undefined);
    const name = form.name.trim();
    const endpointPath = form.endpoint.trim();
    if (!name || !endpointPath) {
      setFormError("Name and endpoint path are required.");
      return;
    }
    if (!endpointPath.startsWith("/")) {
      setFormError('The endpoint path must start with "/" — it is appended to your integration\'s base URL.');
      return;
    }

    const sortOrder = Number(form.sortOrder);
    const payload = {
      name,
      description: form.description.trim() || undefined,
      endpoint: endpointPath,
      httpMethod: form.httpMethod as IntegrationEndpoint["httpMethod"],
      requestType: form.requestType,
      responseType: form.responseType,
      sortOrder: Number.isFinite(sortOrder) && sortOrder > 0 ? sortOrder : 1,
    };

    setIsSaving(true);
    try {
      if (editingEndpoint) {
        await updateEndpoint(integrationId, companyId, editingEndpoint.id, payload);
        showToast({ tone: "success", title: "Endpoint updated" });
      } else {
        await createEndpoint(integrationId, companyId, payload);
        showToast({ tone: "success", title: "Endpoint created" });
      }
      setIsModalOpen(false);
      await load();
    } catch (err) {
      setFormError(errorMessageFor(err, "Something went wrong while saving this endpoint."));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!endpointPendingDelete) return;
    setIsDeleting(true);
    try {
      await deleteEndpoint(integrationId, companyId, endpointPendingDelete.id);
      showToast({ tone: "success", title: "Endpoint deleted" });
      setEndpointPendingDelete(null);
      if (expandedId === endpointPendingDelete.id) setExpandedId(null);
      await load();
    } catch (err) {
      showToast({ tone: "error", title: "Couldn't delete endpoint", description: errorMessageFor(err, "Something went wrong.") });
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleExpanded = (endpoint: IntegrationEndpoint) => {
    setExpandedId((current) => (current === endpoint.id ? null : endpoint.id));
    setPreviewResult(undefined);
    setPreviewError(undefined);
    // Outbound: start the sample record with this purpose's own AttendHub field names so nothing has to be typed from scratch.
    const purpose = purposeByName.get(endpoint.name);
    const names = purpose ? (purpose.requestFields?.length ? purpose.requestFields : purpose.fields).map((field) => field.field) : [];
    if (endpoint.direction === "OUTBOUND" && names.length > 0) {
      setPreviewSampleText(JSON.stringify(Object.fromEntries(names.map((name) => [name, ""])), null, 2));
    }
  };

  const handleTestInbound = async (endpoint: IntegrationEndpoint) => {
    // The result box lives in the expanded row body, so force it open here —
    // otherwise clicking "Test" from the collapsed row runs the call but
    // shows nothing, since the row was never expanded.
    setExpandedId(endpoint.id);
    // {{shortname}} is filled by the hub itself; anything else (employee id, username, ...) is typed in the boxes below.
    const needed = pathParamNames(endpoint.endpoint).filter((name) => name !== "shortname");
    const given = testParams[endpoint.id] ?? {};
    const missing = needed.filter((name) => !given[name]?.trim());
    if (missing.length > 0) {
      setTestErrors((prev) => ({ ...prev, [endpoint.id]: `Fill in ${missing.map((name) => PARAM_LABELS[name] ?? name).join(", ")} below, then press Test again.` }));
      return;
    }
    setTestingId(endpoint.id);
    setTestErrors((prev) => ({ ...prev, [endpoint.id]: "" }));
    try {
      const result = await testEndpoint(integrationId, companyId, endpoint.id, needed.length > 0 ? given : undefined);
      setTestResults((prev) => ({ ...prev, [endpoint.id]: result }));
    } catch (err) {
      setTestErrors((prev) => ({ ...prev, [endpoint.id]: errorMessageFor(err, "Something went wrong while testing this endpoint.") }));
    } finally {
      setTestingId(null);
    }
  };

  const handleSendRealTest = async (endpoint: IntegrationEndpoint) => {
    setExpandedId(endpoint.id);
    let sampleRecord: Record<string, unknown>;
    try {
      const parsed = JSON.parse(previewSampleText);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not an object");
      sampleRecord = parsed;
    } catch {
      setTestErrors((prev) => ({ ...prev, [endpoint.id]: "The sample record must be valid JSON (an object with the AttendHub field names)." }));
      return;
    }
    if (!window.confirm("This sends a REAL request to your HR system and can create a real record there. Use test values. Continue?")) return;
    setTestingId(endpoint.id);
    setTestErrors((prev) => ({ ...prev, [endpoint.id]: "" }));
    try {
      const result = await testEndpoint(integrationId, companyId, endpoint.id, undefined, sampleRecord);
      setTestResults((prev) => ({ ...prev, [endpoint.id]: result }));
    } catch (err) {
      setTestErrors((prev) => ({ ...prev, [endpoint.id]: errorMessageFor(err, "Something went wrong while sending the test.") }));
    } finally {
      setTestingId(null);
    }
  };

  const handlePreviewOutbound = async (endpoint: IntegrationEndpoint) => {
    setPreviewError(undefined);
    setPreviewResult(undefined);
    let sampleRecord: Record<string, unknown>;
    try {
      const parsed = JSON.parse(previewSampleText);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not an object");
      sampleRecord = parsed;
    } catch {
      setPreviewError("The sample record must be valid JSON representing one AttendHub record, e.g. an object with your field names.");
      return;
    }

    setIsPreviewing(true);
    try {
      const mappingsResult = await getFieldMappings(integrationId, endpoint.id, companyId, 1, 100);
      if (mappingsResult.items.length === 0) {
        setPreviewError("Add at least one field mapping below before previewing what would be sent.");
        return;
      }
      const mapped = await previewFieldMapping(sampleRecord, mappingsResult.items.map(toPreviewMapping));
      setPreviewResult(mapped);
    } catch (err) {
      setPreviewError(errorMessageFor(err, "Something went wrong while previewing this mapping."));
    } finally {
      setIsPreviewing(false);
    }
  };

  if (status === "loading") {
    return (
      <Card>
        <LoadingState variant="table" rows={3} />
      </Card>
    );
  }

  if (status === "error") {
    return (
      <Card>
        <ErrorState description={loadError} onRetry={load} />
      </Card>
    );
  }

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          tabs={DIRECTION_TABS.map((tab) => tab.label)}
          active={DIRECTION_TABS.find((tab) => tab.key === direction)?.label ?? DIRECTION_TABS[0].label}
          onChange={(label) => {
            const next = DIRECTION_TABS.find((tab) => tab.label === label);
            if (next) setDirection(next.key);
          }}
        />
        <Button size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={openCreateModal}>
          Add endpoint
        </Button>
      </div>

      {direction === "OUTBOUND" && (
        <p className="mb-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
          Outbound endpoints send data to your HR software. "Preview mapping" only shows what would be sent. "Send real test to
          HR" really sends it and can create a real record on your HR system, so use test values.
        </p>
      )}

      {visibleEndpoints.length === 0 ? (
        <EmptyState
          title={direction === "INBOUND" ? "No inbound endpoints yet" : "No outbound endpoints yet"}
          description={
            direction === "INBOUND"
              ? "Add an endpoint that fetches data from your HR system, such as attendance or leave records."
              : "Add an endpoint that sends data to your HR system, such as posting attendance."
          }
          action={
            <Button size="sm" onClick={openCreateModal} leftIcon={<Plus className="h-3.5 w-3.5" />}>
              Add endpoint
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {visibleEndpoints.map((endpoint) => {
            const purpose = purposeByName.get(endpoint.name);
            const isExpanded = expandedId === endpoint.id;
            const testResult = testResults[endpoint.id];
            const testError = testErrors[endpoint.id];

            return (
              <div key={endpoint.id} className="rounded-lg border border-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(endpoint)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-slate-900">{endpoint.name}</p>
                        <Badge>{endpoint.httpMethod}</Badge>
                        {purpose ? <Badge status="info">{purpose.label}</Badge> : <Badge>Custom</Badge>}
                        <Badge status={endpoint.status === "ACTIVE" ? "active" : "inactive"}>{endpoint.status}</Badge>
                      </div>
                      <p className="mt-0.5 truncate font-mono text-xs text-slate-500">{endpoint.endpoint}</p>
                    </div>
                  </button>

                  <div className="flex shrink-0 items-center gap-1">
                    {direction === "INBOUND" && (
                      <Button
                        size="sm"
                        variant="secondary"
                        leftIcon={<PlayCircle className="h-3.5 w-3.5" />}
                        isLoading={testingId === endpoint.id}
                        onClick={() => handleTestInbound(endpoint)}
                      >
                        Test
                      </Button>
                    )}
                    <button
                      type="button"
                      onClick={() => openEditModal(endpoint)}
                      aria-label="Edit endpoint"
                      className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEndpointPendingDelete(endpoint)}
                      aria-label="Delete endpoint"
                      className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-100 px-4 py-4">
                    {direction === "INBOUND" && (
                      <div className="mb-5">
                        {pathParamNames(endpoint.endpoint).filter((name) => name !== "shortname").length > 0 && (
                          <div className="mb-3 grid gap-3 sm:grid-cols-2">
                            {pathParamNames(endpoint.endpoint)
                              .filter((name) => name !== "shortname")
                              .map((name) => (
                                <Input
                                  key={name}
                                  label={PARAM_LABELS[name] ?? name}
                                  type={name === "password" ? "password" : "text"}
                                  value={testParams[endpoint.id]?.[name] ?? ""}
                                  onChange={(e) =>
                                    setTestParams((prev) => ({ ...prev, [endpoint.id]: { ...(prev[endpoint.id] ?? {}), [name]: e.target.value } }))
                                  }
                                />
                              ))}
                          </div>
                        )}
                        {testError && (
                          <div className="mb-3 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>{testError}</span>
                          </div>
                        )}
                        {testResult && (
                          <div className="mb-3 flex flex-col gap-3">
                            <div
                              className={`flex items-start gap-2 rounded-lg p-3 text-sm ${
                                testResult.success ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
                              }`}
                            >
                              {testResult.success ? (
                                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                              ) : (
                                <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                              )}
                              <span>
                                {testResult.success
                                  ? `Succeeded — HTTP ${testResult.statusCode} in ${testResult.durationMs}ms.`
                                  : testResult.error ?? `Failed — HTTP ${testResult.statusCode}.`}
                              </span>
                            </div>
                            {testResult.sampleBody !== undefined && (
                              <div>
                                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Sample response</p>
                                <JsonViewer data={testResult.sampleBody} />
                              </div>
                            )}
                            {testResult.mappedSample !== undefined && (
                              <div>
                                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                                  Mapped with your current field mappings
                                </p>
                                <JsonViewer data={testResult.mappedSample} />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {direction === "OUTBOUND" && (
                      <div className="mb-5 flex flex-col gap-3">
                        <div>
                          <label className="mb-1.5 block text-sm font-medium text-slate-700">
                            Sample AttendHub record to preview (JSON)
                          </label>
                          <textarea
                            value={previewSampleText}
                            onChange={(e) => setPreviewSampleText(e.target.value)}
                            rows={4}
                            className="block w-full rounded-lg border border-slate-300 bg-white p-3 font-mono text-xs text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                          />
                        </div>
                        <div>
                          <Button
                            size="sm"
                            variant="secondary"
                            leftIcon={<PlayCircle className="h-3.5 w-3.5" />}
                            isLoading={isPreviewing}
                            onClick={() => handlePreviewOutbound(endpoint)}
                          >
                            Preview mapping
                          </Button>
                          <Button
                            size="sm"
                            className="ml-2"
                            leftIcon={<PlayCircle className="h-3.5 w-3.5" />}
                            isLoading={testingId === endpoint.id}
                            onClick={() => handleSendRealTest(endpoint)}
                          >
                            Send real test to HR
                          </Button>
                        </div>
                        {testError && <p className="text-sm text-red-600">{testError}</p>}
                        {testResult && (
                          <div className="flex flex-col gap-3">
                            <div
                              className={`flex items-start gap-2 rounded-lg p-3 text-sm ${
                                testResult.success ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
                              }`}
                            >
                              {testResult.success ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                              <span>
                                {testResult.success
                                  ? `HR accepted it — HTTP ${testResult.statusCode} in ${testResult.durationMs}ms.`
                                  : testResult.error ?? `Failed — HTTP ${testResult.statusCode}.`}
                              </span>
                            </div>
                            {testResult.sentBody !== undefined && (
                              <div>
                                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">What was sent to HR</p>
                                <JsonViewer data={testResult.sentBody} />
                              </div>
                            )}
                            {testResult.sampleBody !== undefined && (
                              <div>
                                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">HR's reply</p>
                                <JsonViewer data={testResult.sampleBody} />
                              </div>
                            )}
                          </div>
                        )}
                        {previewError && <p className="text-sm text-red-600">{previewError}</p>}
                        {previewResult !== undefined && (
                          <div>
                            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                              What would be sent to your HR system
                            </p>
                            <JsonViewer data={previewResult} />
                          </div>
                        )}
                      </div>
                    )}

                    <FieldMappingEditor integrationId={integrationId} companyId={companyId} endpoint={endpoint} purpose={purpose} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingEndpoint ? "Edit endpoint" : "Add endpoint"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} isLoading={isSaving}>
              {editingEndpoint ? "Save changes" : "Create endpoint"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Purpose</label>
            <select
              value={form.purposeName}
              onChange={(e) => handlePurposeChange(e.target.value)}
              className="block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            >
              <option value={CUSTOM_PURPOSE_VALUE}>Custom (no fixed purpose)</option>
              <optgroup label="Inbound — from HR (GET)">
                {inboundPurposes.map((purpose) => (
                  <option key={purpose.name} value={purpose.name}>
                    {purpose.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Outbound — to HR (POST)">
                {outboundPurposes.map((purpose) => (
                  <option key={purpose.name} value={purpose.name}>
                    {purpose.label}
                  </option>
                ))}
              </optgroup>
            </select>
            {form.purposeName !== CUSTOM_PURPOSE_VALUE && (
              <p className="mt-1.5 text-xs text-slate-500">{purposeByName.get(form.purposeName)?.description}</p>
            )}
          </div>

          <Input
            label="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            disabled={form.purposeName !== CUSTOM_PURPOSE_VALUE}
          />

          <Input
            label="Description (optional)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />

          <Input
            label="Endpoint path"
            hint='Relative path appended to your base URL, e.g. "/attendance/report".'
            value={form.endpoint}
            onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
            placeholder="/attendance/report"
          />

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">HTTP method</label>
            <select
              value={form.httpMethod}
              onChange={(e) => setForm({ ...form, httpMethod: e.target.value })}
              disabled={form.purposeName !== CUSTOM_PURPOSE_VALUE && !purposeMethodChoices}
              className="block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 disabled:bg-slate-50 disabled:text-slate-500"
            >
              {(purposeMethodChoices ?? ["GET", "POST", "PUT", "PATCH", "DELETE"]).map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Request type</label>
              <select
                value={form.requestType}
                onChange={(e) => setForm({ ...form, requestType: e.target.value as EndpointPayloadType })}
                className="block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              >
                {PAYLOAD_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Response type</label>
              <select
                value={form.responseType}
                onChange={(e) => setForm({ ...form, responseType: e.target.value as EndpointPayloadType })}
                className="block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              >
                {PAYLOAD_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
          </div>

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
        isOpen={Boolean(endpointPendingDelete)}
        title="Delete this endpoint?"
        description="Its field mappings will be deleted too. This can't be undone."
        confirmLabel="Delete"
        isDestructive
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setEndpointPendingDelete(null)}
      />
    </Card>
  );
}

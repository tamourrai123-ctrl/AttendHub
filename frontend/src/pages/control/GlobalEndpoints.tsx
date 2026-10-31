import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Power, Trash2 } from "lucide-react";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Modal from "../../components/ui/Modal";
import Input from "../../components/ui/Input";
import Table from "../../components/ui/Table";
import Pagination from "../../components/ui/Pagination";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import EmptyState from "../../components/ui/EmptyState";
import LoadingState from "../../components/ui/LoadingState";
import ErrorState from "../../components/ui/ErrorState";
import { useToast } from "../../components/feedback/ToastContext";
import { ApiError } from "../../api/client";
import {
  createGlobalEndpoint,
  deleteGlobalEndpoint,
  getGlobalEndpoints,
  updateGlobalEndpoint,
} from "../../api/globalEndpoints";
import { lastPageOf } from "../../lib/paginate";
import type { EndpointDirection } from "../../types/endpoint";
import type { GlobalEndpoint } from "../../types/globalEndpoint";
import type { TableColumn } from "../../types/common";

const PAGE_SIZE = 20;
const SELECT_CLASS =
  "block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40";

interface FormState {
  name: string;
  label: string;
  description: string;
  direction: EndpointDirection;
  method: "GET" | "POST";
  callableBy: "ADMIN" | "ALL";
  /** One field per line: "field_name" or "field_name, Label". */
  fieldsText: string;
}

const EMPTY_FORM: FormState = { name: "", label: "", description: "", direction: "INBOUND", method: "GET", callableBy: "ADMIN", fieldsText: "" };

function errorMessageFor(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function parseFields(text: string): { field: string; label: string }[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [field, ...rest] = line.split(",");
      const name = field.trim();
      return { field: name, label: rest.join(",").trim() || name };
    });
}

function fieldsToText(endpoint: GlobalEndpoint): string {
  return endpoint.fields.map((item) => (item.label && item.label !== item.field ? `${item.field}, ${item.label}` : item.field)).join("\n");
}

export default function GlobalEndpoints() {
  const { showToast } = useToast();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [loadError, setLoadError] = useState<string | undefined>();
  const [items, setItems] = useState<GlobalEndpoint[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<GlobalEndpoint | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<GlobalEndpoint | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const load = useCallback(async (targetPage: number) => {
    setStatus("loading");
    try {
      const result = await getGlobalEndpoints(targetPage, PAGE_SIZE);
      // Deleting the last row of the last page leaves an empty page: step back to the last page that has rows.
      if (result.items.length === 0 && result.total > 0 && targetPage > lastPageOf(result.total, PAGE_SIZE)) {
        setPage(lastPageOf(result.total, PAGE_SIZE));
        return;
      }
      setItems(result.items);
      setTotal(result.total);
      setStatus("success");
    } catch (err) {
      setLoadError(errorMessageFor(err, "We couldn't load global endpoints."));
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    load(page);
  }, [load, page]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(undefined);
    setIsModalOpen(true);
  };

  const openEdit = (endpoint: GlobalEndpoint) => {
    setEditing(endpoint);
    setForm({
      name: endpoint.name,
      label: endpoint.label,
      description: endpoint.description ?? "",
      direction: endpoint.direction,
      method: endpoint.defaultHttpMethod,
      callableBy: endpoint.callableBy,
      fieldsText: fieldsToText(endpoint),
    });
    setFormError(undefined);
    setIsModalOpen(true);
  };

  const changeDirection = (direction: EndpointDirection) => {
    setForm({ ...form, direction, method: direction === "INBOUND" ? "GET" : "POST" });
  };

  const handleSave = async () => {
    setFormError(undefined);
    const label = form.label.trim();
    const name = form.name.trim();
    if (!label || (!editing && !name)) {
      setFormError("Name and label are required.");
      return;
    }
    if (parseFields(form.fieldsText).length === 0) {
      setFormError('Add at least one AttendHub field, one per line, like "emp_code, Employee code".');
      return;
    }
    const payload = {
      label,
      description: form.description.trim() || undefined,
      direction: form.direction,
      defaultHttpMethod: form.method,
      fields: parseFields(form.fieldsText),
      callableBy: form.callableBy,
    };
    setIsSaving(true);
    try {
      if (editing) {
        await updateGlobalEndpoint(editing.id, { ...payload, description: form.description.trim() });
        showToast({ tone: "success", title: "Global endpoint updated" });
      } else {
        await createGlobalEndpoint({ ...payload, name });
        showToast({ tone: "success", title: "Global endpoint created" });
      }
      setIsModalOpen(false);
      await load(page);
    } catch (err) {
      setFormError(errorMessageFor(err, "Something went wrong while saving this endpoint."));
    } finally {
      setIsSaving(false);
    }
  };

  const toggleStatus = async (endpoint: GlobalEndpoint) => {
    const next = endpoint.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    try {
      await updateGlobalEndpoint(endpoint.id, { status: next });
      showToast({ tone: "success", title: next === "ACTIVE" ? "Endpoint enabled" : "Endpoint disabled" });
      await load(page);
    } catch (err) {
      showToast({ tone: "error", title: "Couldn't change status", description: errorMessageFor(err, "Something went wrong.") });
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      await deleteGlobalEndpoint(pendingDelete.id);
      showToast({ tone: "success", title: "Global endpoint deleted" });
      setPendingDelete(null);
      await load(page);
    } catch (err) {
      showToast({ tone: "error", title: "Couldn't delete endpoint", description: errorMessageFor(err, "Something went wrong.") });
    } finally {
      setIsDeleting(false);
    }
  };

  const columns: TableColumn<GlobalEndpoint>[] = [
    {
      key: "label",
      header: "Endpoint",
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.label}</p>
          <p className="font-mono text-xs text-slate-500">{row.name}</p>
        </div>
      ),
    },
    {
      key: "direction",
      header: "Direction",
      render: (row) => <Badge status="info">{row.direction === "INBOUND" ? "Inbound · GET" : `Outbound · ${row.defaultHttpMethod}`}</Badge>,
    },
    { key: "fields", header: "Fields", render: (row) => (row.fields.length > 0 ? `${row.fields.length} fixed` : "None — edit and add fields") },
    { key: "callable", header: "Who can call it", render: (row) => (row.callableBy === "ALL" ? "Admin and Employees" : "Company Admin only") },
    { key: "status", header: "Status", render: (row) => <Badge status={row.status === "ACTIVE" ? "active" : "inactive"}>{row.status === "ACTIVE" ? "Active" : "Disabled"}</Badge> },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (row) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" aria-label={`Edit ${row.label}`} onClick={() => openEdit(row)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={row.status === "ACTIVE" ? `Disable ${row.label}` : `Enable ${row.label}`}
            onClick={() => toggleStatus(row)}
          >
            <Power className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" aria-label={`Delete ${row.label}`} onClick={() => setPendingDelete(row)}>
            <Trash2 className="h-4 w-4 text-red-600" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Global Endpoints"
        description="Endpoints every company admin can add from their Integrations page. They write their own path."
        action={
          <Button leftIcon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            Add global endpoint
          </Button>
        }
      />
      <Card>
        {status === "loading" && <LoadingState />}
        {status === "error" && <ErrorState description={loadError} onRetry={() => load(page)} />}
        {status === "success" && items.length === 0 && (
          <EmptyState
            title="No global endpoints yet"
            description="Add one and it appears in every company's Add endpoint list, under Inbound or Outbound."
            action={<Button onClick={openCreate}>Add global endpoint</Button>}
          />
        )}
        {status === "success" && items.length > 0 && (
          <div className="flex flex-col gap-4">
            <Table columns={columns} data={items} rowKey={(row) => row.id} />
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
          </div>
        )}
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editing ? "Edit global endpoint" : "Add global endpoint"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} isLoading={isSaving}>
              {editing ? "Save changes" : "Create endpoint"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Name"
            hint='Used by the app at /hr/custom/<name>. Letters, digits, "_" and "-" only. Cannot be changed later.'
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            disabled={Boolean(editing)}
            placeholder="DAILY_REPORT"
          />
          <Input label="Label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Daily report" />
          <Input label="Description (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Direction</label>
              <select className={SELECT_CLASS} value={form.direction} onChange={(e) => changeDirection(e.target.value as EndpointDirection)}>
                <option value="INBOUND">Inbound — from HR</option>
                <option value="OUTBOUND">Outbound — to HR</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">HTTP method</label>
              <select
                className={SELECT_CLASS}
                value={form.method}
                disabled={form.direction === "INBOUND"}
                onChange={(e) => setForm({ ...form, method: e.target.value as "GET" | "POST" })}
              >
                {form.direction === "INBOUND" ? <option value="GET">GET</option> : <option value="POST">POST</option>}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Who can call this from the app</label>
            <select className={SELECT_CLASS} value={form.callableBy} onChange={(e) => setForm({ ...form, callableBy: e.target.value as "ADMIN" | "ALL" })}>
              <option value="ADMIN">Company Admin only</option>
              <option value="ALL">Admin and Employees</option>
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">AttendHub fields (required)</label>
            <textarea
              rows={4}
              value={form.fieldsText}
              onChange={(e) => setForm({ ...form, fieldsText: e.target.value })}
              placeholder={"emp_code, Employee code\nwork_date, Work date"}
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
            <p className="mt-1.5 text-xs text-slate-500">
              One per line, as "field_name, Label". Company admins pick from this list when mapping, and Auto-map uses it to match the HR response.
            </p>
          </div>

          {formError && <p className="text-sm text-red-600">{formError}</p>}
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(pendingDelete)}
        title="Delete this global endpoint?"
        description="Endpoints companies already created from it keep working as custom endpoints. It just stops being offered."
        confirmLabel="Delete"
        isDestructive
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

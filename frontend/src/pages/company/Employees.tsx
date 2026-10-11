import { useCallback, useEffect, useState } from "react";
import { Eye, Pencil, Plus, RefreshCw, Trash2, Users, X } from "lucide-react";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import Table from "../../components/ui/Table";
import Avatar from "../../components/ui/Avatar";
import Button from "../../components/ui/Button";
import SearchInput from "../../components/ui/SearchInput";
import Pagination from "../../components/ui/Pagination";
import Dropdown from "../../components/ui/Dropdown";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import EmptyState from "../../components/ui/EmptyState";
import LoadingState from "../../components/ui/LoadingState";
import ErrorState from "../../components/ui/ErrorState";
import EmployeeFormModal from "./employees/EmployeeFormModal";
import EmployeeDetailsDrawer from "./employees/EmployeeDetailsDrawer";
import { useToast } from "../../components/feedback/ToastContext";
import { useAuth } from "../../contexts/AuthContext";
import { createEmployee, deleteEmployee, getEmployees, updateEmployee } from "../../api/employees";
import { getMyIntegration } from "../../api/integrations";
import { syncEmployeesFromHr } from "../../api/hrEmployees";
import { ApiError } from "../../api/client";
import type { CreateEmployeeInput, Employee, EmployeeListResult } from "../../types/employee";
import type { Integration } from "../../types/integration";
import type { EmployeeSyncResult } from "../../types/employeeSync";
import type { AsyncStatus } from "../../types/common";

const LIMIT = 8;

/**
 * Employee Credential Handling phase: this page now talks to the real
 * backend (/employees, via api/employees.ts) instead of
 * services/mockEmployeeService.ts. companyId is never sent from here —
 * every request is scoped server-side to the authenticated Company
 * Admin's own company.
 *
 * There is no status filter, no department filter, and no
 * activate/deactivate action any more — usm_users has no corresponding
 * columns for those mock-era fields, and there is no employee credential
 * management of any kind on this page (no password field, no password
 * reset, no login-credential action). Delete replaces the old
 * activate/deactivate toggle as the destructive action available here.
 *
 * Employee Sync phase: "Add Employee" still exists for the rare manual
 * case, but employee data is meant to come FROM the connected HR system —
 * see EmployeeSyncService's doc comment on the backend. When the company
 * has a connected integration, a "Sync from HR" button appears here that
 * triggers the same reconciliation the background scheduler already runs
 * automatically every 30 minutes (create new employees, update changed
 * name/email, never delete). The button is hidden entirely when the
 * company hasn't connected an integration yet — there's nothing to sync
 * from. After a sync, the result banner shows exactly what the sync did
 * (numbers + a success message) and the table below it reloads to reflect
 * the real, current database state.
 */
export default function Employees() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const companyName = user?.companyName ?? "";

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [result, setResult] = useState<EmployeeListResult | null>(null);

  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | undefined>(undefined);
  const [viewingEmployee, setViewingEmployee] = useState<Employee | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [isConfirmLoading, setIsConfirmLoading] = useState(false);

  // Integration + sync state. `integration` is null both while it's still
  // loading and when the company genuinely has none configured yet — the
  // "Sync from HR" button only renders once it's a real, connected record.
  const [integration, setIntegration] = useState<Integration | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<EmployeeSyncResult | null>(null);

  // Debounce the raw text input so typing doesn't trigger a fetch per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const data = await getEmployees({ search, page, limit: LIMIT });
      setResult(data);
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }, [search, page]);

  useEffect(() => {
    load();
  }, [load]);

  // Loaded once, independently of the employee list/search/pagination — a
  // missing or disconnected integration is not an error on this page, just
  // "no Sync from HR button to show".
  useEffect(() => {
    getMyIntegration()
      .then(setIntegration)
      .catch(() => setIntegration(null));
  }, []);

  const openAddModal = () => {
    setEditingEmployee(undefined);
    setFormModalOpen(true);
  };

  const openEditModal = (employee: Employee) => {
    setEditingEmployee(employee);
    setFormModalOpen(true);
  };

  const handleFormSubmit = async (input: CreateEmployeeInput) => {
    if (editingEmployee) {
      await updateEmployee(editingEmployee.id, input);
      showToast({ tone: "success", title: "Employee updated", description: `${input.name} was updated successfully.` });
    } else {
      await createEmployee(input);
      showToast({ tone: "success", title: "Employee added", description: `${input.name} was added to your company.` });
      setSearchInput("");
      setPage(1);
    }
    setFormModalOpen(false);
    load();
  };

  const handleDelete = (employee: Employee) => {
    setDeleteTarget(employee);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsConfirmLoading(true);
    try {
      await deleteEmployee(deleteTarget.id);
      showToast({ tone: "success", title: "Employee deleted", description: `${deleteTarget.name} was removed from your company.` });
      setDeleteTarget(null);
      load();
    } catch (err) {
      showToast({
        tone: "error",
        title: "Couldn't delete employee",
        description: err instanceof ApiError ? err.message : "Something went wrong. Please try again.",
      });
    } finally {
      setIsConfirmLoading(false);
    }
  };

  const handleSync = async () => {
    if (!integration) return;
    setIsSyncing(true);
    try {
      const outcome = await syncEmployeesFromHr(integration.id, integration.companyId);
      setSyncResult(outcome);
      showToast({
        tone: "success",
        title: "Sync complete",
        description: `${outcome.totalFetched} record(s) fetched from HR — ${outcome.created} added, ${outcome.updated} updated.`,
      });
      setPage(1);
      setSearchInput("");
      load();
    } catch (err) {
      showToast({
        tone: "error",
        title: "Sync failed",
        description: err instanceof ApiError ? err.message : "Couldn't reach the HR system. Please try again.",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Employees"
        description={companyName ? `Everyone at ${companyName}.` : "Manage your company's employees."}
        action={
          <div className="flex items-center gap-2">
            {integration && (
              <Button
                variant="secondary"
                leftIcon={<RefreshCw className="h-4 w-4" />}
                isLoading={isSyncing}
                onClick={handleSync}
              >
                Sync from HR
              </Button>
            )}
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={openAddModal}>
              Add Employee
            </Button>
          </div>
        }
      />

      {syncResult && (
        <Card className="mb-4 border-emerald-200 bg-emerald-50">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium text-emerald-800">
                Sync complete — {syncResult.totalFetched} record{syncResult.totalFetched === 1 ? "" : "s"} fetched from HR.
              </p>
              <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-emerald-700">
                <div className="flex gap-1">
                  <dt className="font-medium">Added:</dt>
                  <dd>{syncResult.created}</dd>
                </div>
                <div className="flex gap-1">
                  <dt className="font-medium">Updated:</dt>
                  <dd>{syncResult.updated}</dd>
                </div>
                <div className="flex gap-1">
                  <dt className="font-medium">Unchanged:</dt>
                  <dd>{syncResult.unchanged}</dd>
                </div>
                <div className="flex gap-1">
                  <dt className="font-medium">Skipped:</dt>
                  <dd>{syncResult.skipped}</dd>
                </div>
                <div className="flex gap-1">
                  <dt className="font-medium">Failed:</dt>
                  <dd>{syncResult.failed}</dd>
                </div>
              </dl>
            </div>
            <button
              type="button"
              onClick={() => setSyncResult(null)}
              aria-label="Dismiss sync summary"
              className="rounded p-0.5 text-emerald-600 hover:bg-emerald-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </Card>
      )}

      <Card padded={false}>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:flex-wrap sm:items-end">
          <SearchInput value={searchInput} onChange={setSearchInput} placeholder="Search by name or email…" className="w-full sm:max-w-xs" />
        </div>

        <div className="p-4">
          {status === "loading" && <LoadingState variant="table" rows={LIMIT} />}

          {status === "error" && <ErrorState description="We couldn't load your employees." onRetry={load} />}

          {status === "success" && result && result.items.length === 0 && (
            <EmptyState
              icon={Users}
              title="No employees found"
              description={search ? "Try changing your search." : "Employees you add will appear here."}
              action={!search ? <Button onClick={openAddModal}>Add Employee</Button> : undefined}
            />
          )}

          {status === "success" && result && result.items.length > 0 && (
            <Table<Employee>
              rowKey={(row) => row.id}
              data={result.items}
              columns={[
                {
                  key: "name",
                  header: "Employee",
                  render: (row) => (
                    <span className="flex items-center gap-3">
                      <Avatar name={row.name} size="sm" />
                      <span>
                        <span className="block font-medium text-slate-900">{row.name}</span>
                        <span className="block text-xs text-slate-400">{row.email}</span>
                      </span>
                    </span>
                  ),
                },
                { key: "phone", header: "Phone", render: (row) => row.phone ?? "—" },
                { key: "mobile", header: "Mobile", render: (row) => row.mobile ?? "—" },
                {
                  key: "actions",
                  header: "",
                  className: "text-right",
                  render: (row) => (
                    <div className="flex justify-end">
                      <Dropdown
                        trigger={<span className="rounded-md px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">•••</span>}
                        items={[
                          { label: "View", icon: <Eye className="h-4 w-4" />, onSelect: () => setViewingEmployee(row) },
                          { label: "Edit", icon: <Pencil className="h-4 w-4" />, onSelect: () => openEditModal(row) },
                          { label: "Delete", icon: <Trash2 className="h-4 w-4" />, onSelect: () => handleDelete(row) },
                        ]}
                      />
                    </div>
                  ),
                },
              ]}
            />
          )}
        </div>

        {status === "success" && result && result.items.length > 0 && (
          <Pagination page={result.page} pageSize={result.limit} total={result.total} onPageChange={setPage} />
        )}
      </Card>

      <EmployeeFormModal isOpen={formModalOpen} onClose={() => setFormModalOpen(false)} onSubmit={handleFormSubmit} employee={editingEmployee} />

      <EmployeeDetailsDrawer employee={viewingEmployee} onClose={() => setViewingEmployee(null)} />

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete Employee?"
        description={`${deleteTarget?.name ?? "This employee"} will be permanently removed from your company. This cannot be undone.`}
        confirmLabel="Delete"
        isDestructive
        isLoading={isConfirmLoading}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

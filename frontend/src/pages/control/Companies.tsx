import { useCallback, useEffect, useState } from "react";
import { Building2, Eye, Pencil, Plus, Power, Trash2 } from "lucide-react";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import Table from "../../components/ui/Table";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Pagination from "../../components/ui/Pagination";
import Dropdown from "../../components/ui/Dropdown";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import EmptyState from "../../components/ui/EmptyState";
import LoadingState from "../../components/ui/LoadingState";
import ErrorState from "../../components/ui/ErrorState";
import CompanyFormModal from "./companies/CompanyFormModal";
import CompanyDetailsDrawer from "./companies/CompanyDetailsDrawer";
import { useToast } from "../../components/feedback/ToastContext";
import { createCompany, deleteCompany, getCompanies, updateCompany, updateCompanyStatus } from "../../api/companies";
import { ApiError } from "../../api/client";
import { formatDate, formatRelativeTime } from "../../lib/format";
import { COMPANY_STATUS_BADGE, COMPANY_STATUS_LABEL, INTEGRATION_STATUS_BADGE, INTEGRATION_STATUS_LABEL } from "../../lib/statusBadges";
import type { Company, CompanyFormSubmission, CompanyListResult } from "../../types/company";
import type { AsyncStatus } from "../../types/common";

/**
 * Real backend integration — Phase 4H Step 4.
 *
 * The old mock-backed search box, status/integration filter dropdowns, and
 * sortable column headers have been removed rather than kept as
 * client-side-only decorations: the real `GET /companies` endpoint only
 * accepts `page`/`limit` query params (confirmed against
 * backend/src/companies/companies.controller.ts and its e2e spec) — there
 * is no server-side search, status filter, or sort. Faking those against a
 * single loaded page of results would silently mislead a Super Admin
 * managing more companies than fit on one page.
 */

const PAGE_SIZE = 8;

function errorMessageFor(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

export default function Companies() {
  const { showToast } = useToast();

  const [page, setPage] = useState(1);

  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [result, setResult] = useState<CompanyListResult | null>(null);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);

  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | undefined>(undefined);
  const [viewingCompany, setViewingCompany] = useState<Company | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<Company | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null);
  const [isConfirmLoading, setIsConfirmLoading] = useState(false);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const data = await getCompanies({ page, limit: PAGE_SIZE });
      setResult(data);
      setStatus("success");
    } catch (err) {
      setLoadError(errorMessageFor(err, "We couldn't load the company list."));
      setStatus("error");
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  const openAddModal = () => {
    setEditingCompany(undefined);
    setFormModalOpen(true);
  };

  const openEditModal = (company: Company) => {
    setEditingCompany(company);
    setFormModalOpen(true);
  };

  const handleFormSubmit = async (submission: CompanyFormSubmission) => {
    if (submission.mode === "update") {
      if (!editingCompany) return;
      const updated = await updateCompany(editingCompany.id, submission.input);
      showToast({ tone: "success", title: "Company updated", description: `${updated.name} was updated successfully.` });
      setFormModalOpen(false);
      load();
    } else {
      const created = await createCompany(submission.input);
      showToast({ tone: "success", title: "Company created", description: `${created.name} was added to the platform.` });
      setFormModalOpen(false);
      setPage(1);
      load();
    }
  };

  const handleToggleStatus = async (company: Company) => {
    if (company.status === "ACTIVE") {
      setDeactivateTarget(company);
      return;
    }
    try {
      await updateCompanyStatus(company.id, "ACTIVE");
      showToast({ tone: "success", title: "Company activated", description: `${company.name} is now active.` });
      load();
    } catch (err) {
      showToast({ tone: "error", title: "Couldn't activate company", description: errorMessageFor(err, "Something went wrong. Please try again.") });
    }
  };

  const confirmDeactivate = async () => {
    if (!deactivateTarget) return;
    setIsConfirmLoading(true);
    try {
      await updateCompanyStatus(deactivateTarget.id, "INACTIVE");
      showToast({ tone: "success", title: "Company deactivated", description: `${deactivateTarget.name} is now inactive.` });
      setDeactivateTarget(null);
      load();
    } catch (err) {
      showToast({ tone: "error", title: "Couldn't deactivate company", description: errorMessageFor(err, "Something went wrong. Please try again.") });
    } finally {
      setIsConfirmLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsConfirmLoading(true);
    try {
      await deleteCompany(deleteTarget.id);
      showToast({ tone: "success", title: "Company deleted", description: `${deleteTarget.name} was removed from the platform.` });
      setDeleteTarget(null);
      load();
    } catch (err) {
      showToast({ tone: "error", title: "Couldn't delete company", description: errorMessageFor(err, "Something went wrong. Please try again.") });
    } finally {
      setIsConfirmLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Companies"
        description="Manage every company connected to the platform."
        action={
          <Button leftIcon={<Plus className="h-4 w-4" />} onClick={openAddModal}>
            Add Company
          </Button>
        }
      />

      <Card padded={false}>
        <div className="p-4">
          {status === "loading" && <LoadingState variant="table" rows={PAGE_SIZE} />}

          {status === "error" && <ErrorState description={loadError} onRetry={load} />}

          {status === "success" && result && result.items.length === 0 && (
            <EmptyState
              icon={Building2}
              title="No companies found"
              description="Companies you create will appear here."
              action={<Button onClick={openAddModal}>Add Company</Button>}
            />
          )}

          {status === "success" && result && result.items.length > 0 && (
            <Table<Company>
              rowKey={(row) => row.id}
              data={result.items}
              columns={[
                {
                  key: "name",
                  header: "Company",
                  render: (row) => (
                    <div>
                      <span className="block font-medium text-slate-900">{row.name}</span>
                      <span className="block text-xs text-slate-400">{row.email}</span>
                    </div>
                  ),
                },
                { key: "shortname", header: "Short Name", render: (row) => row.shortname },
                { key: "status", header: "Status", render: (row) => <Badge status={COMPANY_STATUS_BADGE[row.status]}>{COMPANY_STATUS_LABEL[row.status]}</Badge> },
                { key: "employeeCount", header: "Employees", render: (row) => row.employeeCount.toLocaleString() },
                { key: "country", header: "Country", render: (row) => row.country },
                { key: "integration", header: "Integration", render: (row) => <Badge status={INTEGRATION_STATUS_BADGE[row.integrationStatus]}>{INTEGRATION_STATUS_LABEL[row.integrationStatus]}</Badge> },
                { key: "lastActivityAt", header: "Last Activity", render: (row) => formatRelativeTime(row.lastActivityAt) },
                { key: "createdAt", header: "Created", render: (row) => formatDate(row.createdAt) },
                {
                  key: "actions",
                  header: "",
                  className: "text-right",
                  render: (row) => (
                    <div className="flex justify-end">
                      <Dropdown
                        trigger={<span className="rounded-md px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">•••</span>}
                        items={[
                          { label: "View", icon: <Eye className="h-4 w-4" />, onSelect: () => setViewingCompany(row) },
                          { label: "Edit", icon: <Pencil className="h-4 w-4" />, onSelect: () => openEditModal(row) },
                          {
                            label: row.status === "ACTIVE" ? "Deactivate" : "Activate",
                            icon: <Power className="h-4 w-4" />,
                            onSelect: () => handleToggleStatus(row),
                          },
                          { label: "Delete", icon: <Trash2 className="h-4 w-4" />, onSelect: () => setDeleteTarget(row), danger: true },
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

      <CompanyFormModal isOpen={formModalOpen} onClose={() => setFormModalOpen(false)} onSubmit={handleFormSubmit} company={editingCompany} />

      <CompanyDetailsDrawer company={viewingCompany} onClose={() => setViewingCompany(null)} />

      <ConfirmDialog
        isOpen={Boolean(deactivateTarget)}
        title="Deactivate Company?"
        description={`Users belonging to ${deactivateTarget?.name ?? "this company"} may no longer be able to use company services.`}
        confirmLabel="Deactivate"
        isDestructive
        isLoading={isConfirmLoading}
        onCancel={() => setDeactivateTarget(null)}
        onConfirm={confirmDeactivate}
      />

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete Company?"
        description={`This action cannot be undone. Are you sure you want to delete ${deleteTarget?.name ?? "this company"}?`}
        confirmLabel="Delete Company"
        isDestructive
        isLoading={isConfirmLoading}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

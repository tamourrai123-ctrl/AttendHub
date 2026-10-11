import { useEffect, useState } from "react";
import { Mail, Building2, Phone, Smartphone } from "lucide-react";
import Drawer from "../../../components/ui/Drawer";
import LoadingState from "../../../components/ui/LoadingState";
import { getAttendanceReport } from "../../../api/reports";
import type { Employee } from "../../../types/employee";
import type { EmployeeAttendanceReportRow } from "../../../types/attendance";

interface EmployeeDetailsDrawerProps {
  employee: Employee | null;
  onClose: () => void;
}

/**
 * Employee Credential Handling phase: this drawer displays HR data only —
 * name, email, company, phone, mobile. There is no status/employeeCode/
 * department/designation shown (usm_users has no corresponding columns —
 * see types/employee.ts) and, as always, no credential information of any
 * kind is shown or manageable here.
 *
 * Attendance summary comes from the same real report endpoint the
 * Reports page uses (`getAttendanceReport`, filtered to this employee) rather than a separate
 * per-employee endpoint — one aggregation function, several views. This
 * part is unchanged by this phase.
 */
export default function EmployeeDetailsDrawer({ employee, onClose }: EmployeeDetailsDrawerProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [summary, setSummary] = useState<EmployeeAttendanceReportRow | undefined>(undefined);

  useEffect(() => {
    if (!employee) return;
    let cancelled = false;
    setIsLoading(true);

    // Real report (live from the company's HR system via the backend).
    getAttendanceReport({ employeeId: employee.id })
      .then((report) => {
        if (cancelled) return;
        setSummary(report.byEmployee.find((row) => row.employeeId === employee.id));
      })
      .catch(() => {
        if (!cancelled) setSummary(undefined);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [employee]);

  return (
    <Drawer isOpen={Boolean(employee)} onClose={onClose} title={employee?.name ?? ""} description="Employee details" widthClassName="max-w-lg">
      {!employee ? null : (
        <div className="flex flex-col gap-6">
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Employee Information</h3>
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div className="flex items-center gap-2 text-slate-600">
                <Mail className="h-4 w-4 text-slate-400" /> {employee.email}
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <Building2 className="h-4 w-4 text-slate-400" /> {employee.companyName}
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <Phone className="h-4 w-4 text-slate-400" /> {employee.phone ?? "—"}
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <Smartphone className="h-4 w-4 text-slate-400" /> {employee.mobile ?? "—"}
              </div>
            </dl>
          </section>

          <section className="border-t border-slate-100 pt-5">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Attendance Summary</h3>
            {isLoading ? (
              <LoadingState variant="cards" rows={1} />
            ) : summary ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-slate-500">Present Days</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{summary.presentDays}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Absent Days</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{summary.absentDays}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Late Days</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{summary.lateDays}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Attendance Rate</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{summary.attendanceRate}%</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">No attendance records on file for this employee yet.</p>
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
}

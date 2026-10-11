import { useCallback, useEffect, useState } from "react";
import { UserCheck, UserX, Clock3, CalendarX, Users, Plug } from "lucide-react";
import PageHeader from "../../components/ui/PageHeader";
import StatCard from "../../components/ui/StatCard";
import Card, { CardHeader } from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import LoadingState from "../../components/ui/LoadingState";
import ErrorState from "../../components/ui/ErrorState";
import AttendanceChart from "../../components/layout/AttendanceChart";
import RecentActivityList from "../../components/layout/RecentActivityList";
import type { DailyAttendancePoint } from "../../types/attendance";
import { useAuth } from "../../contexts/AuthContext";
import { getEmployees } from "../../api/employees";
import { getAttendanceReport } from "../../api/reports";
import { getMyIntegration } from "../../api/integrations";
import { getMyRecentActivity } from "../../api/systemLogs";
import { formatRelativeTime } from "../../lib/format";
import { INTEGRATION_STATUS_BADGE, INTEGRATION_STATUS_LABEL } from "../../lib/statusBadges";
import type { AttendanceSummary, CompanyAttendanceReport } from "../../types/attendance";
import type { Integration } from "../../types/integration";
import type { SystemLogDetail, LogSeverity } from "../../types/systemLog";
import type { ActivityItem, AsyncStatus } from "../../types/common";

interface DashboardData {
  employeeTotal: number;
  attendanceSummary: AttendanceSummary;
  report: CompanyAttendanceReport;
  integration: Integration | null;
  activity: ActivityItem[];
}

const WEEKDAY_FORMATTER = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });

const EMPTY_SUMMARY: AttendanceSummary = { present: 0, absent: 0, late: 0, halfDay: 0, onLeave: 0, total: 0 };

// Real system-log entries only carry a severity, not the richer "tone" the
// old mock activity feed invented — INFO reads as a normal/successful event
// for the kinds of things a Company Admin's own log actually contains
// (created/updated/forwarded), CRITICAL folds into "error" since
// RecentActivityList/ActivityItem has no separate tone for it.
const SEVERITY_TONE: Record<LogSeverity, ActivityItem["tone"]> = {
  INFO: "success",
  WARNING: "warning",
  ERROR: "error",
  CRITICAL: "error",
};

function toActivityItems(entries: SystemLogDetail[]): ActivityItem[] {
  return entries.map((entry) => ({
    id: entry.id,
    message: entry.description,
    timestamp: formatRelativeTime(entry.timestamp),
    tone: SEVERITY_TONE[entry.severity],
  }));
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Phase 2/Part C follow-up: this page now runs entirely on real data.
 *
 * - Employee headcount: `getEmployees({ limit: 1 })`'s `total` — just a
 *   count, not the old mock Active/Inactive breakdown. The real Employee
 *   record (usm_users) has no status column at all (employees are HR-system
 *   records AttendHub doesn't own the lifecycle of), so there is nothing to
 *   break that count down by anymore — see types/employee.ts's doc comment.
 * - "Today" attendance summary: derived from the same live attendance
 *   report's `byDate` array (today's row, if HR has any records for today)
 *   rather than a separate summary call — one fetch serves both this and
 *   the chart below it.
 * - HR Integration card: the real `Integration` type has no `provider` or
 *   `lastSyncAt` (those were mock-only fields — see types/integration.ts).
 *   Shown instead: integration type, base URL, and whether credentials are
 *   configured.
 * - Recent Activity: now the Company Admin's own real system-log entries
 *   (GET /system-logs/mine — see api/systemLogs.ts), not the static mock
 *   feed. Only entries recorded after this feature shipped have a
 *   companyId to filter by (see PrismaSystemLogsRepository's doc comment),
 *   so a company with a long history may still see a short list at first.
 */
export default function CompanyDashboard() {
  const { user } = useAuth();
  const companyId = user?.companyId;
  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [data, setData] = useState<DashboardData | null>(null);

  const load = useCallback(async () => {
    if (!companyId) {
      setStatus("error");
      return;
    }
    setStatus("loading");
    try {
      const [employeeList, report, integration, recentActivity] = await Promise.all([
        getEmployees({ limit: 1 }),
        getAttendanceReport(),
        getMyIntegration(),
        getMyRecentActivity(),
      ]);

      const todayRow = report.byDate.find((row) => row.date === todayIso());
      const attendanceSummary: AttendanceSummary = todayRow
        ? {
            present: todayRow.present,
            absent: todayRow.absent,
            late: todayRow.late,
            halfDay: todayRow.halfDay,
            onLeave: todayRow.onLeave,
            total: todayRow.present + todayRow.absent + todayRow.late + todayRow.halfDay + todayRow.onLeave,
          }
        : EMPTY_SUMMARY;

      setData({ employeeTotal: employeeList.total, attendanceSummary, report, integration, activity: toActivityItems(recentActivity) });
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  if (status === "loading") {
    return (
      <div>
        <PageHeader title={`Welcome back, ${user?.name.split(" ")[0] ?? "there"}`} description={user?.companyName ?? "Today's attendance overview"} />
        <LoadingState variant="cards" rows={4} />
      </div>
    );
  }

  if (status === "error" || !data) {
    return (
      <div>
        <PageHeader title="Dashboard" />
        <ErrorState description="We couldn't load your company overview." onRetry={load} />
      </div>
    );
  }

  const { employeeTotal, attendanceSummary, report, integration, activity } = data;

  // Fold the five granular statuses into the two series the shared chart
  // component supports: "present" covers anyone who showed up in some form
  // (present, late, half day), "absent" covers anyone who didn't (absent,
  // on leave). Oldest-to-newest, left to right.
  const chartData: DailyAttendancePoint[] = [...report.byDate]
    .reverse()
    .map((row) => ({
      day: WEEKDAY_FORMATTER.format(new Date(`${row.date}T00:00:00Z`)),
      present: row.present + row.late + row.halfDay,
      absent: row.absent + row.onLeave,
    }));

  return (
    <div>
      <PageHeader title={`Welcome back, ${user?.name.split(" ")[0] ?? "there"}`} description={user?.companyName ?? "Today's attendance overview"} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Present Today" value={attendanceSummary.present} icon={UserCheck} helpText={`of ${employeeTotal} employees`} />
        <StatCard label="Absent Today" value={attendanceSummary.absent} icon={UserX} />
        <StatCard label="Late Today" value={attendanceSummary.late} icon={Clock3} />
        <StatCard label="On Leave Today" value={attendanceSummary.onLeave} icon={CalendarX} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <AttendanceChart data={chartData} title="Attendance Overview" description={report.rangeLabel} />
        </div>
        <RecentActivityList items={activity} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Employees" description="Headcount for your company" />
          <dl className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="flex items-center gap-1.5 text-slate-500">
                <Users className="h-3.5 w-3.5" /> Total Employees
              </dt>
              <dd className="font-semibold text-slate-900">{employeeTotal}</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <CardHeader title="HR Integration" description="Connection status with your HR system" />
          {integration ? (
            <dl className="flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-1.5 text-slate-500">
                  <Plug className="h-3.5 w-3.5" /> Status
                </dt>
                <dd>
                  <Badge status={INTEGRATION_STATUS_BADGE[integration.status]}>{INTEGRATION_STATUS_LABEL[integration.status]}</Badge>
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Integration Type</dt>
                <dd className="font-medium text-slate-900">{integration.integrationType}</dd>
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                <dt className="text-slate-500">Credentials Configured</dt>
                <dd className="font-medium text-slate-900">{integration.credentialsConfigured ? "Yes" : "No"}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-slate-500">No HR integration has been configured for your company yet.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

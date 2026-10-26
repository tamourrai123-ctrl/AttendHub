import { useCallback, useEffect, useState } from "react";
import { UserCheck, UserX, Clock3, CalendarX, Users, Plug, Smartphone, Percent } from "lucide-react";
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
import { getMySubscription } from "../../api/subscription";
import type { CompanySubscription } from "../../types/subscription";
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
  subscription: CompanySubscription | null;
  /** false when the live attendance numbers could not be loaded (HR not set up, or HR answered with an error). */
  attendanceAvailable: boolean;
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
      // Each source is optional: one failing (e.g. HR attendance not set up yet) must not blank the whole dashboard.
      const [employeeResult, reportResult, integrationResult, activityResult, subscriptionResult] = await Promise.allSettled([
        getEmployees({ limit: 1 }),
        getAttendanceReport(),
        getMyIntegration(),
        getMyRecentActivity(),
        getMySubscription(),
      ]);
      if (
        employeeResult.status === "rejected" &&
        reportResult.status === "rejected" &&
        integrationResult.status === "rejected" &&
        subscriptionResult.status === "rejected"
      ) {
        throw new Error("Nothing could be loaded.");
      }

      const employeeTotal = employeeResult.status === "fulfilled" ? employeeResult.value.total : 0;
      const attendanceAvailable = reportResult.status === "fulfilled";
      const report: CompanyAttendanceReport = attendanceAvailable
        ? reportResult.value
        : ({ byDate: [], rangeLabel: "Not available" } as unknown as CompanyAttendanceReport);
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

      setData({
        employeeTotal,
        attendanceSummary,
        report,
        integration: integrationResult.status === "fulfilled" ? integrationResult.value : null,
        activity: activityResult.status === "fulfilled" ? toActivityItems(activityResult.value) : [],
        subscription: subscriptionResult.status === "fulfilled" ? subscriptionResult.value : null,
        attendanceAvailable,
      });
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

  const { employeeTotal, attendanceSummary, report, integration, activity, subscription, attendanceAvailable } = data;

  const attended = attendanceSummary.present + attendanceSummary.late + attendanceSummary.halfDay;
  const attendanceRate = attendanceAvailable && employeeTotal > 0 ? `${Math.round((attended / employeeTotal) * 100)}%` : "—";
  const seatsUsed = subscription?.usage.activeAppUsers ?? 0;
  const seatsMax = subscription?.usage.maxUsers ?? null;

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

      {!attendanceAvailable && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          Today's attendance numbers are not available. Check that your HR integration has an Attendance endpoint with field mappings.
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Employees" value={employeeTotal} icon={Users} helpText="Synced from your HR system" />
        <StatCard
          label="App Users"
          value={seatsMax === null ? seatsUsed : `${seatsUsed} / ${seatsMax}`}
          icon={Smartphone}
          helpText={seatsMax === null ? "No seat limit on your account" : `${subscription?.usage.seatsLeft ?? 0} seats left`}
        />
        <StatCard label="Attendance Rate Today" value={attendanceRate} icon={Percent} helpText="Present, late and half day" />
        <StatCard
          label="HR Integration"
          value={integration ? INTEGRATION_STATUS_LABEL[integration.status] : "Not set up"}
          icon={Plug}
          helpText={integration ? integration.integrationType : "Add it under Integrations"}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <AttendanceChart data={chartData} title="Attendance Overview" description={report.rangeLabel} />
        </div>
        <RecentActivityList items={activity} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6">
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

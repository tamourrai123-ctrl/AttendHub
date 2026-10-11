import Card, { CardHeader } from "../ui/Card";
import type { DailyAttendancePoint } from "../../types/attendance";

interface AttendanceChartProps {
  data: DailyAttendancePoint[];
  title?: string;
  description?: string;
}

/**
 * A dependency-free bar chart. Phase 1 intentionally avoids pulling in a
 * charting library for a single mock visualization — this can be swapped
 * for a real chart component once live data and more chart types are needed.
 */
export default function AttendanceChart({
  data,
  title = "Attendance Overview",
  description = "Present vs. absent, last 7 days",
}: AttendanceChartProps) {
  const max = Math.max(...data.map((d) => d.present + d.absent), 1);

  return (
    <Card>
      <CardHeader title={title} description={description} />
      <div className="flex h-48 items-end gap-3 sm:gap-4">
        {data.map((point) => {
          const presentHeight = (point.present / max) * 100;
          const absentHeight = (point.absent / max) * 100;
          return (
            <div key={point.day} className="flex flex-1 flex-col items-center gap-2">
              <div className="flex h-40 w-full flex-col-reverse gap-0.5">
                <div
                  className="w-full rounded-b-sm bg-red-200"
                  style={{ height: `${absentHeight}%` }}
                  title={`${point.absent} absent`}
                />
                <div
                  className="w-full rounded-t-sm bg-brand-500"
                  style={{ height: `${presentHeight}%` }}
                  title={`${point.present} present`}
                />
              </div>
              <span className="text-xs font-medium text-slate-500">{point.day}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-brand-500" /> Present
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-red-200" /> Absent
        </span>
      </div>
    </Card>
  );
}

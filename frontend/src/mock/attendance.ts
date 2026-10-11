export interface DailyAttendancePoint {
  day: string;
  present: number;
  absent: number;
}

/** Mock 7-day attendance overview, used by both Control and Company dashboards. */
export const WEEKLY_ATTENDANCE: DailyAttendancePoint[] = [
  { day: "Mon", present: 228, absent: 22 },
  { day: "Tue", present: 235, absent: 15 },
  { day: "Wed", present: 219, absent: 31 },
  { day: "Thu", present: 241, absent: 9 },
  { day: "Fri", present: 218, absent: 32 },
  { day: "Sat", present: 96, absent: 12 },
  { day: "Sun", present: 40, absent: 6 },
];

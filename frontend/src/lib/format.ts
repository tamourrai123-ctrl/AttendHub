/** Centralized date/time formatting so the Control Panel reads consistently everywhere. */

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", year: "numeric" });
const TIME_FORMATTER = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" });

export function formatDate(iso: string): string {
  return DATE_FORMATTER.format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return `${DATE_FORMATTER.format(new Date(iso))}, ${TIME_FORMATTER.format(new Date(iso))}`;
}

export function formatTime(iso: string): string {
  return TIME_FORMATTER.format(new Date(iso));
}

/** "5 minutes ago" / "3 hours ago" / "2 days ago" style relative timestamps. */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const diffMinutes = Math.round(diffMs / 60_000);

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;

  return formatDate(iso);
}

export function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

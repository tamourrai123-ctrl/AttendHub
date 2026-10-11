import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { SortDirection } from "../../types/company";

interface SortableHeaderButtonProps {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
}

/** Clickable column header for tables with client-side sorting (used by Companies). */
export default function SortableHeaderButton({ label, active, direction, onClick }: SortableHeaderButtonProps) {
  const Icon = !active ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 uppercase tracking-wide hover:text-slate-700 ${active ? "text-slate-700" : ""}`}
    >
      {label}
      <Icon className="h-3 w-3" />
    </button>
  );
}

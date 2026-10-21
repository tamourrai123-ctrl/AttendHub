import type { EndpointPurposeField } from "../../types/endpoint";
import type { FieldMappingRecord } from "../../types/fieldMapping";

interface OutboundFieldsTableProps {
  fields: EndpointPurposeField[];
  mappings: FieldMappingRecord[] | undefined;
  sampleText: string;
  onSampleChange: (text: string) => void;
}

/**
 * The sample record as a form: one row per AttendHub field, with its value box and the HR key it is mapped to. It
 * reads and writes the same JSON as the box below it (that box stays the source of truth), so nothing else changes.
 */
export default function OutboundFieldsTable({ fields, mappings, sampleText, onSampleChange }: OutboundFieldsTableProps) {
  let record: Record<string, unknown> | undefined;
  try {
    const parsed = JSON.parse(sampleText);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) record = parsed as Record<string, unknown>;
  } catch {
    record = undefined;
  }

  if (!record) {
    return <p className="text-sm text-amber-700">The JSON below is not valid, so the field table is paused. Fix the JSON to use it.</p>;
  }
  const current = record;

  const setValue = (field: string, value: string) => onSampleChange(JSON.stringify({ ...current, [field]: value }, null, 2));
  const hrKeyFor = (field: string) => mappings?.find((mapping) => mapping.sourcePath === field && mapping.status !== "N")?.targetField;

  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-slate-700">Fill in the AttendHub fields</p>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
            <tr>
              <th className="px-3 py-2">AttendHub field</th>
              <th className="px-3 py-2">Value to send</th>
              <th className="px-3 py-2">Goes to HR as</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {fields.map((field) => {
              const hrKey = hrKeyFor(field.field);
              return (
                <tr key={field.field}>
                  <td className="px-3 py-2 align-middle">
                    <div className="font-mono text-xs text-slate-900">{field.field}</div>
                    <div className="text-xs text-slate-500">{field.label}</div>
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <input
                      value={current[field.field] === undefined || current[field.field] === null ? "" : String(current[field.field])}
                      onChange={(e) => setValue(field.field, e.target.value)}
                      aria-label={`Value for ${field.field}`}
                      className="block w-full min-w-[10rem] rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                    />
                  </td>
                  <td className="px-3 py-2 align-middle">
                    {mappings === undefined ? (
                      <span className="text-xs text-slate-400">Loading…</span>
                    ) : hrKey ? (
                      <span className="font-mono text-xs text-emerald-700">{hrKey}</span>
                    ) : (
                      <span className="text-xs text-slate-500">Not mapped. Add it under Field mapping.</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

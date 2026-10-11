interface TabsProps {
  tabs: string[];
  active: string;
  onChange: (tab: string) => void;
}

export default function Tabs({ tabs, active, onChange }: TabsProps) {
  return (
    <div role="tablist" className="flex gap-1 border-b border-slate-200">
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={tab === active}
          onClick={() => onChange(tab)}
          className={[
            "border-b-2 px-3 py-2 text-sm font-medium -mb-px",
            tab === active
              ? "border-brand-600 text-brand-700"
              : "border-transparent text-slate-500 hover:text-slate-700",
          ].join(" ")}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

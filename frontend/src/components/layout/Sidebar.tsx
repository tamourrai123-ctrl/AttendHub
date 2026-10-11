import { X } from "lucide-react";
import NavItem from "../navigation/NavItem";
import { brand } from "../../config/brand";
import type { NavItemDefinition } from "../../types/common";

interface SidebarProps {
  sectionLabel: string;
  navItems: NavItemDefinition[];
  footerItems?: NavItemDefinition[];
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

function SidebarContent({
  sectionLabel,
  navItems,
  footerItems,
  onNavigate,
}: Pick<SidebarProps, "sectionLabel" | "navItems" | "footerItems"> & { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col bg-slate-900 text-white">
      <div className="flex h-16 shrink-0 items-center gap-2 border-b border-slate-800 px-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold">
          {brand.shortName}
        </span>
        <span className="text-base font-semibold">{brand.name}</span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4 scrollbar-thin">
        <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          {sectionLabel}
        </p>
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <NavItem key={item.to} item={item} onNavigate={onNavigate} />
          ))}
        </nav>
      </div>

      {footerItems && footerItems.length > 0 && (
        <div className="shrink-0 border-t border-slate-800 px-3 py-4">
          <nav className="flex flex-col gap-1">
            {footerItems.map((item) => (
              <NavItem key={item.to} item={item} onNavigate={onNavigate} />
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ sectionLabel, navItems, footerItems, isMobileOpen, onCloseMobile }: SidebarProps) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 lg:block">
        <div className="fixed inset-y-0 left-0 w-64">
          <SidebarContent sectionLabel={sectionLabel} navItems={navItems} footerItems={footerItems} />
        </div>
      </aside>

      {/* Mobile drawer */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/50"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw]">
            <div className="relative h-full">
              <button
                type="button"
                onClick={onCloseMobile}
                aria-label="Close navigation menu"
                className="absolute right-3 top-4 z-10 rounded-md p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
              <SidebarContent
                sectionLabel={sectionLabel}
                navItems={navItems}
                footerItems={footerItems}
                onNavigate={onCloseMobile}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  Plug,
  Globe,
  Activity,
  FileClock,
  Tag,
  Receipt,
  Settings,
} from "lucide-react";
import Sidebar from "../components/layout/Sidebar";
import Topbar from "../components/layout/Topbar";
import ScreenGuide from "../components/layout/ScreenGuide";
import type { NavItemDefinition } from "../types/common";

const NAV_ITEMS: NavItemDefinition[] = [
  { label: "Dashboard", to: "/control/dashboard", icon: LayoutDashboard },
  { label: "Companies", to: "/control/companies", icon: Building2 },
  { label: "Integrations", to: "/control/integrations", icon: Plug },
  { label: "Global Endpoints", to: "/control/global-endpoints", icon: Globe },
  { label: "API Monitoring", to: "/control/api-monitoring", icon: Activity },
  { label: "System Logs", to: "/control/system-logs", icon: FileClock },
  { label: "Pricing", to: "/control/pricing", icon: Tag },
  { label: "Payments", to: "/control/payments", icon: Receipt },
];

const FOOTER_ITEMS: NavItemDefinition[] = [
  { label: "Settings", to: "/control/settings", icon: Settings },
];

export default function ControlLayout() {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const location = useLocation();

  const activeLabel =
    [...NAV_ITEMS, ...FOOTER_ITEMS].find((item) => location.pathname.startsWith(item.to))?.label ??
    "Dashboard";

  return (
    <div className="min-h-screen bg-slate-50 lg:pl-64">
      <Sidebar
        sectionLabel="Control Panel"
        navItems={NAV_ITEMS}
        footerItems={FOOTER_ITEMS}
        isMobileOpen={isMobileNavOpen}
        onCloseMobile={() => setIsMobileNavOpen(false)}
      />
      <Topbar
        title={activeLabel}
        subtitle="Control Panel · Super Admin"
        onOpenMobileMenu={() => setIsMobileNavOpen(true)}
        settingsHref="/control/settings"
      />
      <main className="p-4 sm:p-6 lg:p-8">
        <ScreenGuide />
        <Outlet />
      </main>
    </div>
  );
}

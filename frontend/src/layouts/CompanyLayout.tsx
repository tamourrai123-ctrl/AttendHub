import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Plug,
  CreditCard,
  Settings,
} from "lucide-react";
import Sidebar from "../components/layout/Sidebar";
import Topbar from "../components/layout/Topbar";
import PlanBanner from "../components/layout/PlanBanner";
import { useAuth } from "../contexts/AuthContext";
import type { NavItemDefinition } from "../types/common";

const NAV_ITEMS: NavItemDefinition[] = [
  { label: "Dashboard", to: "/company/dashboard", icon: LayoutDashboard },
  { label: "Employees", to: "/company/employees", icon: Users },
  { label: "Integrations", to: "/company/integrations", icon: Plug },
  { label: "Plan & usage", to: "/company/plan", icon: CreditCard },
];

const FOOTER_ITEMS: NavItemDefinition[] = [
  { label: "Settings", to: "/company/settings", icon: Settings },
];

export default function CompanyLayout() {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const location = useLocation();
  const { user } = useAuth();

  const activeLabel =
    [...NAV_ITEMS, ...FOOTER_ITEMS].find((item) => location.pathname.startsWith(item.to))?.label ??
    "Dashboard";

  return (
    <div className="min-h-screen bg-slate-50 lg:pl-64">
      <Sidebar
        sectionLabel="Company"
        navItems={NAV_ITEMS}
        footerItems={FOOTER_ITEMS}
        isMobileOpen={isMobileNavOpen}
        onCloseMobile={() => setIsMobileNavOpen(false)}
      />
      <Topbar
        title={activeLabel}
        subtitle={user?.companyName ? `${user.companyName} · Company Admin` : "Company Panel"}
        onOpenMobileMenu={() => setIsMobileNavOpen(true)}
        settingsHref="/company/settings"
      />
      <main className="p-4 sm:p-6 lg:p-8">
        <PlanBanner />
        <Outlet />
      </main>
    </div>
  );
}

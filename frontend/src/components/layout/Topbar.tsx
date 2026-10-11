import { Bell, ChevronDown, LogOut, Menu, Settings, User as UserIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Avatar from "../ui/Avatar";
import Dropdown from "../ui/Dropdown";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../feedback/ToastContext";
import { ROLE_LABELS } from "../../lib/permissions";

interface TopbarProps {
  title: string;
  subtitle?: string;
  onOpenMobileMenu: () => void;
  profileHref?: string;
  settingsHref?: string;
}

export default function Topbar({ title, subtitle, onOpenMobileMenu, profileHref, settingsHref }: TopbarProps) {
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  if (!user) return null;

  const handleLogout = async () => {
    await logout();
    showToast({ tone: "info", title: "Signed out", description: "You have been logged out." });
    navigate("/login", { replace: true });
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-4 sm:px-6">
      <button
        type="button"
        onClick={onOpenMobileMenu}
        aria-label="Open navigation menu"
        className="rounded-md p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-semibold text-slate-900 sm:text-base">{title}</h1>
        {subtitle && <p className="truncate text-xs text-slate-500">{subtitle}</p>}
      </div>

      <button
        type="button"
        aria-label="Notifications"
        className="relative rounded-full p-2 text-slate-500 hover:bg-slate-100"
      >
        <Bell className="h-5 w-5" />
        <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
      </button>

      <Dropdown
        align="right"
        trigger={
          <span className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-slate-100">
            <Avatar name={user.name} size="sm" />
            <span className="hidden text-left sm:block">
              <span className="block text-sm font-medium leading-tight text-slate-900">{user.name}</span>
              <span className="block text-xs leading-tight text-slate-500">{ROLE_LABELS[user.role]}</span>
            </span>
            <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
          </span>
        }
        items={[
          ...(profileHref
            ? [{ label: "Profile", icon: <UserIcon className="h-4 w-4" />, onSelect: () => navigate(profileHref) }]
            : []),
          ...(settingsHref
            ? [{ label: "Settings", icon: <Settings className="h-4 w-4" />, onSelect: () => navigate(settingsHref) }]
            : []),
          { label: "Log out", icon: <LogOut className="h-4 w-4" />, onSelect: handleLogout, danger: true },
        ]}
      />
    </header>
  );
}

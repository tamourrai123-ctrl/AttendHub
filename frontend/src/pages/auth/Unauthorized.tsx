import { ShieldAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Button from "../../components/ui/Button";
import { useAuth } from "../../contexts/AuthContext";
import { ROLE_HOME_ROUTE } from "../../lib/permissions";
import { brand } from "../../config/brand";

export default function Unauthorized() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const goHome = () => {
    if (user) {
      navigate(ROLE_HOME_ROUTE[user.role], { replace: true });
    } else {
      navigate("/login", { replace: true });
    }
  };

  const handleSwitchAccount = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600">
        <ShieldAlert className="h-7 w-7" />
      </span>
      <h1 className="mt-5 text-xl font-semibold text-slate-900">You don't have access to this page</h1>
      <p className="mt-2 max-w-sm text-sm text-slate-500">
        {user
          ? `Your account (${user.name}) doesn't have permission to view this section of ${brand.name}.`
          : `You don't have permission to view this section of ${brand.name}.`}
      </p>
      <div className="mt-6 flex gap-3">
        <Button variant="secondary" onClick={handleSwitchAccount}>
          Switch account
        </Button>
        <Button onClick={goHome}>Go to my dashboard</Button>
      </div>
    </div>
  );
}

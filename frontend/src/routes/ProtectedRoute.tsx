import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import type { UserRole } from "../types/auth";
import LoadingState from "../components/ui/LoadingState";

interface ProtectedRouteProps {
  allowedRoles: UserRole[];
  children: ReactNode;
}

/**
 * Guards a route by BOTH authentication and role. This is a real route
 * guard (it redirects, it does not just hide a nav link) — but it is still
 * only a frontend/UX safeguard. A production backend must independently
 * verify auth and authorization on every request.
 */
export default function ProtectedRoute({ allowedRoles, children }: ProtectedRouteProps) {
  const { isAuthenticated, isInitializing, user } = useAuth();
  const location = useLocation();

  if (isInitializing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <LoadingState variant="spinner" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
}

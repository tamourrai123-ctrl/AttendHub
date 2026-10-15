import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";

import Login from "../pages/auth/Login";
import Signup from "../pages/auth/Signup";
import ForgotPassword from "../pages/auth/ForgotPassword";
import Unauthorized from "../pages/auth/Unauthorized";
import NotFound from "../pages/NotFound";

import ControlLayout from "../layouts/ControlLayout";
import ControlDashboard from "../pages/control/Dashboard";
import Companies from "../pages/control/Companies";
import Integrations from "../pages/control/Integrations";
import ApiMonitoring from "../pages/control/ApiMonitoring";
import SystemLogs from "../pages/control/SystemLogs";
import Pricing from "../pages/control/Pricing";
import ControlSettings from "../pages/control/Settings";

import CompanyLayout from "../layouts/CompanyLayout";
import CompanyDashboard from "../pages/company/Dashboard";
import Employees from "../pages/company/Employees";
import CompanyIntegrations from "../pages/company/Integrations";
import CompanySettings from "../pages/company/Settings";
import Plan from "../pages/company/Plan";


export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/unauthorized" element={<Unauthorized />} />

      {/* Control Panel — Super Admin only */}
      <Route
        path="/control"
        element={
          <ProtectedRoute allowedRoles={["SUPER_ADMIN"]}>
            <ControlLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<ControlDashboard />} />
        <Route path="companies" element={<Companies />} />
        <Route path="integrations" element={<Integrations />} />
        <Route path="api-monitoring" element={<ApiMonitoring />} />
        <Route path="system-logs" element={<SystemLogs />} />
        <Route path="pricing" element={<Pricing />} />
        <Route path="settings" element={<ControlSettings />} />
      </Route>

      {/* Company Panel — Company Admin only */}
      <Route
        path="/company"
        element={
          <ProtectedRoute allowedRoles={["COMPANY_ADMIN"]}>
            <CompanyLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<CompanyDashboard />} />
        <Route path="employees" element={<Employees />} />
        <Route path="integrations" element={<CompanyIntegrations />} />
        <Route path="plan" element={<Plan />} />
        <Route path="settings" element={<CompanySettings />} />
      </Route>


      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

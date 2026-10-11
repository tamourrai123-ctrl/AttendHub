import { Link } from "react-router-dom";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-200 text-slate-500">
        <Compass className="h-7 w-7" />
      </span>
      <h1 className="mt-5 text-xl font-semibold text-slate-900">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-slate-500">The page you're looking for doesn't exist or has moved.</p>
      <Link to="/login" className="mt-6 text-sm font-medium text-brand-600 hover:text-brand-700">
        Back to sign in
      </Link>
    </div>
  );
}

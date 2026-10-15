import { useEffect, useRef, useState } from "react";

/**
 * Google's own "Continue with Google" button (Google Identity Services).
 * Calls onCredential with the Google ID token, which the backend verifies
 * (POST /auth/google). Renders nothing when VITE_GOOGLE_CLIENT_ID isn't set,
 * so email sign-in keeps working without it.
 */

interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleIdentity {
  accounts: {
    id: {
      initialize: (config: { client_id: string; callback: (response: GoogleCredentialResponse) => void }) => void;
      renderButton: (element: HTMLElement, options: Record<string, string | number>) => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "").trim();
const SCRIPT_SRC = "https://accounts.google.com/gsi/client";

export const isGoogleSignInEnabled = CLIENT_ID.length > 0;

let scriptPromise: Promise<void> | null = null;

function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null; // allow a retry on the next mount
      reject(new Error("Google sign-in could not be loaded."));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

interface GoogleSignInButtonProps {
  onCredential: (idToken: string) => void;
  disabled?: boolean;
}

export default function GoogleSignInButton({ onCredential, disabled = false }: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onCredential);
  callbackRef.current = onCredential;
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!isGoogleSignInEnabled) return;
    let cancelled = false;

    loadGoogleScript()
      .then(() => {
        const container = containerRef.current;
        const google = window.google;
        if (cancelled || !container || !google) return;

        google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (response) => {
            if (response.credential) callbackRef.current(response.credential);
          },
        });
        container.innerHTML = "";
        google.accounts.id.renderButton(container, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          width: Math.min(400, Math.max(200, container.offsetWidth)),
        });
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!isGoogleSignInEnabled) return null;

  if (loadFailed) {
    return <p className="text-center text-sm text-slate-500">Google sign-in isn't available right now. Use your email instead.</p>;
  }

  return (
    <div
      ref={containerRef}
      className={`flex min-h-[44px] w-full justify-center ${disabled ? "pointer-events-none opacity-60" : ""}`}
      aria-label="Continue with Google"
    />
  );
}

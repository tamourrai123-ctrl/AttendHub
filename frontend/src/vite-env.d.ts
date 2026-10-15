/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the AttendHub backend API, e.g. http://localhost:3000/api */
  readonly VITE_API_BASE_URL?: string;
  /** Google OAuth Web client ID for "Continue with Google". Leave unset to hide the button. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

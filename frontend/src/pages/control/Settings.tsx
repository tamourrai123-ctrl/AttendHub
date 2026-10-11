import { useCallback, useEffect, useState } from "react";
import { ShieldAlert, Terminal } from "lucide-react";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Checkbox from "../../components/ui/Checkbox";
import FormSection from "../../components/ui/FormSection";
import LoadingState from "../../components/ui/LoadingState";
import ErrorState from "../../components/ui/ErrorState";
import { useToast } from "../../components/feedback/ToastContext";
import { getSettings, updateSettings } from "../../api/settings";
import { ApiError } from "../../api/client";
import type { PlatformSettings } from "../../types/settings";
import type { AsyncStatus } from "../../types/common";

/**
 * Real backend integration (backend/src/settings). Scope is deliberately
 * narrow — see the two sections below — because these are the only
 * settings that actually do something right now:
 *   - Security: session timeout is real (changes the next login's session
 *     length); login protection is stored only, not enforced yet.
 *   - Notifications: each toggle gates a console.log alert on the backend
 *     when the matching event happens — there's no real email delivery
 *     yet, by design for this phase.
 * The old "Platform" (name/description/timezone/date format) and "System
 * Preferences" (page size/24-hour time) sections are gone — nothing reads
 * or enforces them, so they were pure decoration.
 */

function errorMessageFor(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

export default function Settings() {
  const { showToast } = useToast();

  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState<PlatformSettings | null>(null);
  const [draft, setDraft] = useState<PlatformSettings | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const data = await getSettings();
      setSaved(data);
      setDraft(data);
      setStatus("success");
    } catch (err) {
      setLoadError(errorMessageFor(err, "We couldn't load platform settings."));
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (status === "loading" || !draft) {
    return (
      <div>
        <PageHeader title="Settings" description="Configure platform-wide preferences." />
        <Card>
          <LoadingState variant="cards" rows={4} />
        </Card>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div>
        <PageHeader title="Settings" description="Configure platform-wide preferences." />
        <Card>
          <ErrorState description={loadError ?? "We couldn't load platform settings."} onRetry={load} />
        </Card>
      </div>
    );
  }

  const isDirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const handleCancel = () => {
    if (saved) setDraft(saved);
  };

  const handleSave = async () => {
    if (!draft) return;
    setIsSaving(true);
    try {
      const updated = await updateSettings(draft);
      setSaved(updated);
      setDraft(updated);
      showToast({ tone: "success", title: "Settings saved", description: "Platform settings were updated successfully." });
    } catch (err) {
      showToast({ tone: "error", title: "Couldn't save settings", description: errorMessageFor(err, "Something went wrong while saving.") });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Configure platform-wide preferences."
        action={
          isDirty ? (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={handleCancel} disabled={isSaving}>
                Cancel
              </Button>
              <Button onClick={handleSave} isLoading={isSaving}>
                Save Changes
              </Button>
            </div>
          ) : undefined
        }
      />

      <Card>
        <FormSection title="Security" description="Session length is enforced for real. Login protection is saved but not yet checked at login.">
          <Input
            label="Session timeout (minutes)"
            type="number"
            min={5}
            max={10080}
            value={draft.security.sessionTimeoutMinutes}
            onChange={(e) =>
              setDraft({ ...draft, security: { ...draft.security, sessionTimeoutMinutes: Number(e.target.value) || 0 } })
            }
          />
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Login protection below is saved as a preference only — nothing in the app currently requires a second step at login.</span>
          </div>
          <Checkbox
            label="Require login protection (2-step)"
            checked={draft.security.requireTwoStepLogin}
            onChange={(e) => setDraft({ ...draft, security: { ...draft.security, requireTwoStepLogin: e.target.checked } })}
          />
        </FormSection>

        <FormSection title="Notifications" description="Each toggle controls a real alert on the backend when that event happens.">
          <div className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            <Terminal className="mt-0.5 h-4 w-4 shrink-0" />
            <span>These alerts are written to the backend's server console right now — there's no email delivery yet.</span>
          </div>
          <Checkbox
            label="System error alerts"
            checked={draft.notifications.systemErrorAlerts}
            onChange={(e) => setDraft({ ...draft, notifications: { ...draft.notifications, systemErrorAlerts: e.target.checked } })}
          />
          <Checkbox
            label="API failure alerts"
            checked={draft.notifications.apiFailureAlerts}
            onChange={(e) => setDraft({ ...draft, notifications: { ...draft.notifications, apiFailureAlerts: e.target.checked } })}
          />
          <Checkbox
            label="Integration warnings"
            checked={draft.notifications.integrationWarnings}
            onChange={(e) => setDraft({ ...draft, notifications: { ...draft.notifications, integrationWarnings: e.target.checked } })}
          />
        </FormSection>
      </Card>
    </div>
  );
}

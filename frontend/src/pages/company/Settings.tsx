import { useCallback, useEffect, useState, type FormEvent } from "react";
import PageHeader from "../../components/ui/PageHeader";
import Card, { CardHeader } from "../../components/ui/Card";
import Input from "../../components/ui/Input";
import Button from "../../components/ui/Button";
import LoadingState from "../../components/ui/LoadingState";
import ErrorState from "../../components/ui/ErrorState";
import { useToast } from "../../components/feedback/ToastContext";
import { getCompanySettings, updateCompanySettings } from "../../api/companySettings";
import type { CompanySettings } from "../../types/companySettings";
import type { AsyncStatus } from "../../types/common";

/**
 * Real Company Settings page (Phase 2 follow-up). Replaces the old
 * mockCompanySettingsService-backed version.
 *
 * Scope, confirmed against the real `usm_company` schema before building
 * this (see api/companySettings.ts and types/companySettings.ts): the old
 * "Contact Information" card (contact person/email/phone) and "Preferences"
 * card (absence/weekly-summary email toggles) had no real database columns
 * behind them at all, so both are gone. Company Information now also
 * includes Fax, Website, and Tax IDs (GST/NTN) — real columns that existed
 * on the company record but had no UI anywhere in the app until now.
 */
export default function CompanySettings() {
  const { showToast } = useToast();
  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const data = await getCompanySettings();
      setSettings(data);
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!settings) return;
    setIsSaving(true);
    try {
      const updated = await updateCompanySettings({
        companyName: settings.companyName,
        address: settings.address,
        phone: settings.phone,
        fax: settings.fax,
        website: settings.website,
        gstNumber: settings.gstNumber,
        ntnNumber: settings.ntnNumber,
      });
      setSettings(updated);
      showToast({ tone: "success", title: "Settings saved", description: "Your company settings were updated." });
    } catch (err) {
      showToast({
        tone: "error",
        title: "Couldn't save settings",
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (status === "loading") {
    return (
      <div>
        <PageHeader title="Company Settings" description="Manage your company's profile information" />
        <LoadingState variant="cards" rows={2} />
      </div>
    );
  }

  if (status === "error" || !settings) {
    return (
      <div>
        <PageHeader title="Company Settings" description="Manage your company's profile information" />
        <ErrorState description="We couldn't load your company settings." onRetry={load} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Company Settings" description="Manage your company's profile information" />

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <Card>
          <CardHeader title="Company Information" description="Your company's basic profile" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Company Name"
              value={settings.companyName}
              onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
              containerClassName="sm:col-span-2"
              required
            />
            <Input
              label="Address"
              value={settings.address}
              onChange={(e) => setSettings({ ...settings, address: e.target.value })}
              containerClassName="sm:col-span-2"
            />
            <Input
              label="Phone"
              value={settings.phone}
              onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
            />
            <Input
              label="Fax"
              value={settings.fax}
              onChange={(e) => setSettings({ ...settings, fax: e.target.value })}
            />
            <Input
              label="Website"
              value={settings.website}
              onChange={(e) => setSettings({ ...settings, website: e.target.value })}
              containerClassName="sm:col-span-2"
            />
            <Input
              label="GST Number"
              value={settings.gstNumber}
              onChange={(e) => setSettings({ ...settings, gstNumber: e.target.value })}
            />
            <Input
              label="NTN Number"
              value={settings.ntnNumber}
              onChange={(e) => setSettings({ ...settings, ntnNumber: e.target.value })}
            />
          </div>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" isLoading={isSaving}>
            Save Changes
          </Button>
        </div>
      </form>
    </div>
  );
}

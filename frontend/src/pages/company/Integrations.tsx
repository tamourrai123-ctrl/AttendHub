import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Plug, XCircle } from "lucide-react";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import FormSection from "../../components/ui/FormSection";
import Badge from "../../components/ui/Badge";
import Tabs from "../../components/ui/Tabs";
import LoadingState from "../../components/ui/LoadingState";
import ErrorState from "../../components/ui/ErrorState";
import EmptyState from "../../components/ui/EmptyState";
import EndpointsPanel from "../../components/integrations/EndpointsPanel";
import { useToast } from "../../components/feedback/ToastContext";
import {
  createMyIntegration,
  getAuthTypeOptions,
  getMyIntegration,
  testIntegrationConnection,
  updateMyIntegration,
} from "../../api/integrations";
import { ApiError } from "../../api/client";
import type { AuthTypeOption, ConnectionTestResult, Integration, UpdateIntegrationInput } from "../../types/integration";
import type { AsyncStatus } from "../../types/common";

/**
 * Phase 1 + Phase 2/Part A of the Company Admin integration build-out.
 *   - Connection tab (Phase 1): create/edit the ONE integration record for
 *     this company (base connection details only), and test the base
 *     connection (reachability only, no business endpoint).
 *   - Endpoints tab (Phase 2/Part A): configure Inbound (from HR)/Outbound
 *     (to HR) endpoints and their field mappings — see EndpointsPanel. Kept
 *     disabled/locked until the Connection tab has a saved integration to
 *     attach endpoints to.
 * There is no per-company Super-Admin-style list here — a Company Admin
 * only ever has their own single integration (or none yet), fetched via
 * GET /integrations/mine.
 *
 * apiKey/apiSecret are NEVER returned by the backend (see the Integration
 * type's doc comment) — the form always starts those two fields blank, and
 * on update they're only sent (to rotate the stored credential) when the
 * admin actually types something into them.
 */

const TAB_CONNECTION = "Connection";
const TAB_ENDPOINTS = "Endpoints";

function errorMessageFor(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

interface FormState {
  integrationType: string;
  authType: string;
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
}

const EMPTY_FORM: FormState = { integrationType: "", authType: "", baseUrl: "", apiKey: "", apiSecret: "" };

function toFormState(integration: Integration): FormState {
  return {
    integrationType: integration.integrationType,
    authType: integration.authType,
    baseUrl: integration.baseUrl,
    apiKey: "",
    apiSecret: "",
  };
}

export default function CompanyIntegrations() {
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<string>(TAB_CONNECTION);

  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [integration, setIntegration] = useState<Integration | null>(null);
  const [authTypes, setAuthTypes] = useState<AuthTypeOption[]>([]);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [testError, setTestError] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    setStatus("loading");
    setTestResult(null);
    setTestError(undefined);
    try {
      const [mine, options] = await Promise.all([getMyIntegration(), getAuthTypeOptions()]);
      setIntegration(mine);
      setAuthTypes(options);
      setForm(mine ? toFormState(mine) : EMPTY_FORM);
      setStatus("success");
    } catch (err) {
      setLoadError(errorMessageFor(err, "We couldn't load your integration."));
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (status === "loading") {
    return (
      <div>
        <PageHeader title="Integrations" description="Connect your HR software to this portal." />
        <Card>
          <LoadingState variant="cards" rows={3} />
        </Card>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div>
        <PageHeader title="Integrations" description="Connect your HR software to this portal." />
        <Card>
          <ErrorState description={loadError ?? "We couldn't load your integration."} onRetry={load} />
        </Card>
      </div>
    );
  }

  const baseline = integration ? toFormState(integration) : EMPTY_FORM;
  const isDirty = JSON.stringify(form) !== JSON.stringify(baseline);
  const isCreateMode = !integration;

  const canSubmit = isCreateMode
    ? Boolean(form.integrationType.trim() && form.authType.trim() && form.baseUrl.trim() && form.apiKey.trim() && form.apiSecret.trim())
    : isDirty;

  const handleCancel = () => setForm(baseline);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (isCreateMode) {
        const created = await createMyIntegration({
          integrationType: form.integrationType.trim(),
          authType: form.authType.trim(),
          baseUrl: form.baseUrl.trim(),
          apiKey: form.apiKey.trim(),
          apiSecret: form.apiSecret.trim(),
        });
        setIntegration(created);
        setForm(toFormState(created));
        showToast({
          tone: "success",
          title: "Integration created",
          description: "Your integration was set up. You can now test the connection below.",
        });
      } else if (integration) {
        const payload: UpdateIntegrationInput = {};
        if (form.integrationType.trim() !== baseline.integrationType) payload.integrationType = form.integrationType.trim();
        if (form.authType.trim() !== baseline.authType) payload.authType = form.authType.trim();
        if (form.baseUrl.trim() !== baseline.baseUrl) payload.baseUrl = form.baseUrl.trim();
        if (form.apiKey.trim()) payload.apiKey = form.apiKey.trim();
        if (form.apiSecret.trim()) payload.apiSecret = form.apiSecret.trim();

        const updated = await updateMyIntegration(integration.id, integration.companyId, payload);
        setIntegration(updated);
        setForm(toFormState(updated));
        setTestResult(null);
        setTestError(undefined);
        showToast({ tone: "success", title: "Integration updated", description: "Your changes were saved." });
      }
    } catch (err) {
      showToast({ tone: "error", title: "Couldn't save", description: errorMessageFor(err, "Something went wrong while saving.") });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    if (!integration) return;
    setIsTesting(true);
    setTestResult(null);
    setTestError(undefined);
    try {
      const result = await testIntegrationConnection(integration.id, integration.companyId);
      setTestResult(result);
    } catch (err) {
      setTestError(errorMessageFor(err, "Something went wrong while testing the connection."));
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Integrations"
        description="Connect your HR software to this portal so attendance, leave, and employee data can flow through it."
      />

      {integration && (
        <Card className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <Plug className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900">{integration.integrationType} integration</p>
                <p className="text-xs text-slate-500">{integration.baseUrl}</p>
              </div>
            </div>
            <Badge status={integration.status === "CONNECTED" ? "connected" : "disconnected"}>
              {integration.status === "CONNECTED" ? "Connected" : "Disconnected"}
            </Badge>
          </div>
        </Card>
      )}

      <div className="mb-6">
        <Tabs tabs={[TAB_CONNECTION, TAB_ENDPOINTS]} active={activeTab} onChange={setActiveTab} />
      </div>

      {activeTab === TAB_ENDPOINTS ? (
        integration ? (
          <EndpointsPanel integrationId={integration.id} companyId={integration.companyId} />
        ) : (
          <Card>
            <EmptyEndpointsNotice onGoToConnection={() => setActiveTab(TAB_CONNECTION)} />
          </Card>
        )
      ) : (
      <Card>
        <FormSection
          title={isCreateMode ? "Set up your integration" : "Connection details"}
          description={
            isCreateMode
              ? "Enter your HR software's connection details. You'll be able to test the connection once this is saved."
              : "Update your connection details. Leave the API key/secret blank to keep the current values."
          }
        >
          <Input
            label="Integration type"
            hint='Short code for your HR system, up to 3 characters (e.g. "HRS").'
            maxLength={3}
            value={form.integrationType}
            onChange={(e) => setForm({ ...form, integrationType: e.target.value.toUpperCase() })}
          />

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Auth type</label>
            {authTypes.length === 0 ? (
              <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                No auth types are configured yet. Ask your platform administrator to seed the INTEGRATION_AUTH_TYPE
                list before you can select one.
              </p>
            ) : (
              <select
                value={form.authType}
                onChange={(e) => setForm({ ...form, authType: e.target.value })}
                className="block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              >
                <option value="" disabled>
                  Select an auth type…
                </option>
                {authTypes.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.title}
                  </option>
                ))}
              </select>
            )}
          </div>

          <Input
            label="Base URL"
            placeholder="https://api.your-hr-system.com"
            value={form.baseUrl}
            onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
          />

          <Input
            label={isCreateMode ? "API key" : "API key (leave blank to keep current)"}
            type="password"
            autoComplete="off"
            value={form.apiKey}
            onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
          />

          <Input
            label={isCreateMode ? "API secret" : "API secret (leave blank to keep current)"}
            type="password"
            autoComplete="off"
            value={form.apiSecret}
            onChange={(e) => setForm({ ...form, apiSecret: e.target.value })}
          />

          {integration && (
            <p className="text-xs text-slate-500">
              {integration.credentialsConfigured ? "Credentials are configured." : "Credentials are not configured yet."}
            </p>
          )}

          <div className="flex gap-2">
            {!isCreateMode && isDirty && (
              <Button variant="secondary" onClick={handleCancel} disabled={isSaving}>
                Cancel
              </Button>
            )}
            <Button onClick={handleSave} isLoading={isSaving} disabled={!canSubmit}>
              {isCreateMode ? "Create Integration" : "Save Changes"}
            </Button>
          </div>
        </FormSection>

        {integration && (
          <FormSection
            title="Test connection"
            description="Checks that this portal can reach your HR software's base URL with the stored credentials. This doesn't call a specific endpoint yet — that comes once endpoints are set up."
          >
            <div>
              <Button variant="secondary" onClick={handleTest} isLoading={isTesting} leftIcon={<Plug className="h-4 w-4" />}>
                Test Connection
              </Button>
            </div>

            {testError && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{testError}</span>
              </div>
            )}

            {testResult && (
              <div
                className={`flex items-start gap-2 rounded-lg p-3 text-sm ${
                  testResult.reachable ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
                }`}
              >
                {testResult.reachable ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <div>
                  {testResult.reachable ? (
                    <p>
                      Reachable — responded with status {testResult.statusCode} in {testResult.durationMs}ms.
                    </p>
                  ) : (
                    <p>{testResult.error ?? "Could not reach the external API."}</p>
                  )}
                </div>
              </div>
            )}
          </FormSection>
        )}
      </Card>
      )}
    </div>
  );
}

function EmptyEndpointsNotice({ onGoToConnection }: { onGoToConnection: () => void }) {
  return (
    <EmptyState
      title="Set up your connection first"
      description="Once your HR software's connection details are saved on the Connection tab, you can configure inbound and outbound endpoints and their field mappings here."
      action={
        <Button size="sm" onClick={onGoToConnection}>
          Go to Connection
        </Button>
      }
    />
  );
}

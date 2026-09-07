import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { emptyBundleForm, MerchantBundleForm, payloadFromBundleForm } from "@/components/admin/merchant-bundle-form";
import { PageHeader } from "@/components/states";
import { api, ApiError } from "@/lib/api-client";

export const Route = createFileRoute("/admin/merchant/bundles/new")({
  component: AdminNewMerchantBundle,
});

function AdminNewMerchantBundle() {
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyBundleForm);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setPending(true);
    setError(null);
    try {
      const { bundle } = await api.admin.createMerchantBundle(payloadFromBundleForm(form));
      await navigate({ to: "/admin/merchant/bundles/$id", params: { id: bundle.id } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create bundle.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Merchant Management"
        title="Add Merchant bundle"
        description="Saved with the selected status. Historical purchases never inherit later edits."
      />
      <MerchantBundleForm value={form} onChange={setForm} onSubmit={() => void save()} pending={pending} error={error} submitLabel="Save bundle" />
    </div>
  );
}
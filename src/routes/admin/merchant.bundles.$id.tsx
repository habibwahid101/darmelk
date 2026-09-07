import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { emptyBundleForm, formFromBundle, MerchantBundleForm, payloadFromBundleForm } from "@/components/admin/merchant-bundle-form";
import { PageHeader, Surface } from "@/components/states";
import { api, ApiError } from "@/lib/api-client";
import { useAsync } from "@/lib/use-async";

export const Route = createFileRoute("/admin/merchant/bundles/$id")({
  component: AdminEditMerchantBundle,
});

function AdminEditMerchantBundle() {
  const { id } = Route.useParams();
  const { data, reload } = useAsync(() => api.admin.merchantBundle(id), [id]);
  const [form, setForm] = useState(emptyBundleForm);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data?.bundle) setForm(formFromBundle(data.bundle));
  }, [data?.bundle]);

  async function save() {
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      await api.admin.updateMerchantBundle(id, payloadFromBundleForm(form));
      await reload();
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update bundle.");
    } finally {
      setPending(false);
    }
  }

  if (!data?.bundle) return <p className="text-sm text-muted">Loading bundle…</p>;

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Merchant Management"
        title={data.bundle.name}
        description={`Version ${data.bundle.version}. Later edits apply to future purchases only.`}
      />
      <Surface>
        <p className="text-sm text-muted">
          Confirmed purchases keep the amounts, gifts, and terms captured at the time of purchase.
        </p>
      </Surface>
      <MerchantBundleForm
        value={form}
        onChange={setForm}
        onSubmit={() => void save()}
        pending={pending}
        error={error}
        submitLabel={saved ? "Saved" : "Save changes"}
      />
    </div>
  );
}
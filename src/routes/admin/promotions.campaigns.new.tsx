import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { emptyPromotionForm, payloadFromPromotionForm, PromotionForm } from "@/components/admin/promotion-form";
import { PageHeader } from "@/components/states";
import { api, ApiError } from "@/lib/api-client";
import { useAsync } from "@/lib/use-async";

export const Route = createFileRoute("/admin/promotions/campaigns/new")({
  component: AdminNewPromotion,
});

function AdminNewPromotion() {
  const navigate = useNavigate();
  const { data } = useAsync(() => api.admin.offers(), []);
  const [form, setForm] = useState(emptyPromotionForm);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setPending(true);
    setError(null);
    try {
      const { promotion } = await api.admin.createPromotion(payloadFromPromotionForm(form));
      await navigate({ to: "/admin/promotions/campaigns/$id", params: { id: promotion.id } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create this promotion.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader kicker="Promotion Management" title="Create promotion" description="Drafts are not public. Publish only when the window, offers, and rewards are complete." />
      <PromotionForm
        value={form}
        onChange={setForm}
        onSubmit={() => void save()}
        pending={pending}
        error={error}
        submitLabel="Save draft"
        offers={data?.offers ?? []}
      />
    </div>
  );
}

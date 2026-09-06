import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { OfferForm, emptyOfferForm, payloadFromForm } from "@/components/admin/offer-form";
import { PageHeader } from "@/components/states";
import { api, ApiError } from "@/lib/api-client";

export const Route = createFileRoute("/admin/offers/new")({ component: AdminNewOffer });

function AdminNewOffer() {
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyOfferForm);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setPending(true);
    setError(null);
    try {
      const { offer } = await api.admin.createOffer({ ...payloadFromForm(form, { includeSlug: true }), status: "draft" });
      await navigate({ to: "/admin/offers/$slug", params: { slug: offer.slug } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create offer.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader kicker="Catalog" title="Add property / offer" description="Saved as a draft until you publish it. Drafts are not public." />
      <OfferForm value={form} onChange={setForm} onSubmit={() => void save()} pending={pending} error={error} submitLabel="Save draft" />
    </div>
  );
}

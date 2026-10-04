import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { formFromPromotion, payloadFromPromotionForm, PromotionForm, emptyPromotionForm } from "@/components/admin/promotion-form";
import { PageHeader, Surface } from "@/components/states";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { PromotionBanner } from "@/components/promotions/promotion-banner";
import { api, ApiError } from "@/lib/api-client";
import { useAsync } from "@/lib/use-async";

export const Route = createFileRoute("/admin/promotions/campaigns/$id/")({
  component: AdminEditPromotion,
});

function AdminEditPromotion() {
  const { id } = Route.useParams();
  const { data, reload } = useAsync(() => api.admin.promotion(id), [id]);
  const { data: offersData } = useAsync(() => api.admin.offers(), []);
  const [form, setForm] = useState(emptyPromotionForm);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data?.promotion) setForm(formFromPromotion(data.promotion));
  }, [data?.promotion]);

  async function save() {
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      await api.admin.updatePromotion(id, payloadFromPromotionForm(form));
      await reload();
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save this promotion.");
    } finally {
      setPending(false);
    }
  }

  async function setStatus(status: "published" | "closed" | "draft") {
    setPending(true);
    setError(null);
    try {
      await api.admin.setPromotionStatus(id, status);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update status.");
    } finally {
      setPending(false);
    }
  }

  async function onBanner(file: File) {
    setPending(true);
    setError(null);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (const b of bytes) binary += String.fromCharCode(b);
      await api.admin.setPromotionBanner(id, { filename: file.name, mime: file.type, bytesBase64: btoa(binary) });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not upload the image.");
    } finally {
      setPending(false);
    }
  }

  const promotion = data?.promotion;
  if (!promotion) return <p className="text-sm text-muted">Loading campaign…</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        kicker="Promotion Management"
        title={promotion.title}
        description="Edits apply to future qualification only. Already qualified members keep their reward snapshot."
        action={<StatusBadge status={promotion.lifecycle} />}
      />
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="secondary">
          <Link to="/admin/promotions/campaigns/$id/preview" params={{ id }}>
            Preview
          </Link>
        </Button>
        {promotion.status === "draft" ? (
          <Button size="sm" disabled={pending} onClick={() => void setStatus("published")}>
            Publish
          </Button>
        ) : null}
        {promotion.status === "published" ? (
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => void setStatus("closed")}>
            Close
          </Button>
        ) : null}
      </div>
      <Surface className="overflow-hidden p-0 sm:p-0">
        {promotion.has_banner ? <PromotionBanner id={promotion.id} title={promotion.title} framed /> : null}
        <div className="p-5 sm:p-6">
          <p className="text-xs font-medium uppercase tracking-wide text-subtle">Optional banner</p>
          <p className="mt-1 text-sm text-muted">
            JPG, PNG, or WebP up to 1.5 MB. The upload is shown in full, at its own shape, on desktop and mobile. A wide image, about 1600×640, sits best. Keep type inside the artwork.
          </p>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="mt-3 block w-full text-sm"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onBanner(file);
            }}
          />
        </div>
      </Surface>
      {promotion.status === "closed" ? (
        <p className="text-sm text-muted">This campaign is closed. Historical qualifications are preserved.</p>
      ) : (
        <PromotionForm
          value={form}
          onChange={setForm}
          onSubmit={() => void save()}
          pending={pending}
          error={error}
          submitLabel={saved ? "Saved" : "Save changes"}
          offers={offersData?.offers ?? []}
        />
      )}
    </div>
  );
}

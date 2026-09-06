import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { OfferForm, formFromOffer, payloadFromForm } from "@/components/admin/offer-form";
import { PageHeader, Surface } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/status-badge";
import { api, ApiError } from "@/lib/api-client";
import { fromApiOffer, isPublished, resolveMediaSrc, type PropertyOffer } from "@/lib/offers";
import { useAsync } from "@/lib/use-async";

export const Route = createFileRoute("/admin/offers/$slug/")({ component: AdminEditOffer });

async function fileToBase64(file: File): Promise<{ bytesBase64: string; mime: string; filename: string }> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return { bytesBase64: btoa(binary), mime: file.type || "image/jpeg", filename: file.name };
}

function AdminEditOffer() {
  const { slug } = Route.useParams();
  const { data, reload, loading, error: loadError } = useAsync(() => api.admin.offer(slug), [slug]);
  const offer = data?.offer ? fromApiOffer(data.offer) : undefined;
  const [form, setForm] = useState(() => (offer ? formFromOffer(offer) : null));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (offer) setForm(formFromOffer(offer));
  }, [offer?.slug, offer?.updatedAt, offer?.version]);

  async function save() {
    if (!form) return;
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      await api.admin.updateOffer(slug, payloadFromForm(form));
      setSaved(true);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save offer.");
    } finally {
      setPending(false);
    }
  }

  async function setStatus(status: "published" | "draft" | "closed") {
    setPending(true);
    setError(null);
    try {
      await api.admin.setOfferStatus(slug, status);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update status.");
    } finally {
      setPending(false);
    }
  }

  async function upload(kind: "cover" | "hero" | "gallery", file: File | undefined) {
    if (!file) return;
    setPending(true);
    setError(null);
    try {
      const body = await fileToBase64(file);
      await api.admin.addOfferMedia(slug, { kind, ...body });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not upload image.");
    } finally {
      setPending(false);
    }
  }

  async function removeMedia(src: string) {
    const match = src.match(/\/media\/([^/?#]+)/);
    if (!match) {
      if (!form) return;
      setForm({
        ...form,
        image: form.image === src ? "" : form.image,
        heroImage: form.heroImage === src ? "" : form.heroImage,
        galleryText: form.galleryText
          .split(/\n/)
          .map((s) => s.trim())
          .filter((s) => s && s !== src)
          .join("\n"),
      });
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api.admin.removeOfferMedia(slug, match[1]);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove image.");
    } finally {
      setPending(false);
    }
  }

  if (loading && !offer) return <p className="text-sm text-muted">Loading offer…</p>;
  if (loadError || !offer || !form) {
    return <p className="text-sm text-clay">{loadError?.message ?? "Offer not found."}</p>;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Catalog"
        title={offer.title}
        description="Edits apply to future bookings only. Historical snapshots stay unchanged."
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="secondary">
              <Link to="/admin/offers/$slug/preview" params={{ slug }}>
                Preview
              </Link>
            </Button>
            <Button asChild size="sm" variant="secondary">
              <Link to="/admin/offers">All offers</Link>
            </Button>
          </div>
        }
      />
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <StatusBadge status={offer.status === "available" ? "published" : offer.status} />
        {offer.flagship ? <span className="text-xs font-medium uppercase tracking-wide text-pine">Flagship</span> : null}
        {isPublished(offer.status) ? (
          <>
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => void setStatus("draft")}>
              Unpublish
            </Button>
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => void setStatus("closed")}>
              Close
            </Button>
          </>
        ) : (
          <Button size="sm" disabled={pending} onClick={() => void setStatus("published")}>
            Publish
          </Button>
        )}
      </div>
      {saved ? <p className="text-sm text-ok">Saved.</p> : null}
      <MediaManager offer={offer} pending={pending} onUpload={upload} onRemove={(src) => void removeMedia(src)} />
      <OfferForm value={form} onChange={setForm} onSubmit={() => void save()} pending={pending} error={error} slugLocked submitLabel="Save changes" />
    </div>
  );
}

function MediaManager({
  offer,
  pending,
  onUpload,
  onRemove,
}: {
  offer: PropertyOffer;
  pending: boolean;
  onUpload: (kind: "cover" | "hero" | "gallery", file: File | undefined) => Promise<void>;
  onRemove: (src: string) => void;
}) {
  const images = [
    offer.image ? { src: offer.image, label: "Cover" } : null,
    offer.heroImage && offer.heroImage !== offer.image ? { src: offer.heroImage, label: "Hero" } : null,
    ...(offer.gallery ?? []).filter((src) => src !== offer.image && src !== offer.heroImage).map((src, i) => ({ src, label: `Gallery ${i + 1}` })),
  ].filter(Boolean) as Array<{ src: string; label: string }>;

  return (
    <Surface>
      <h2 className="font-display text-xl font-semibold">Upload images</h2>
      <p className="mt-1 text-sm text-muted">JPG, PNG, or WebP. 1.5 MB maximum. Uploads are stored with this offer only.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Field label="Cover upload">
          <input type="file" accept="image/jpeg,image/png,image/webp" disabled={pending} onChange={(e) => void onUpload("cover", e.target.files?.[0])} />
        </Field>
        <Field label="Hero upload">
          <input type="file" accept="image/jpeg,image/png,image/webp" disabled={pending} onChange={(e) => void onUpload("hero", e.target.files?.[0])} />
        </Field>
        <Field label="Gallery upload">
          <input type="file" accept="image/jpeg,image/png,image/webp" disabled={pending} onChange={(e) => void onUpload("gallery", e.target.files?.[0])} />
        </Field>
      </div>
      {images.length ? (
        <ul className="mt-5 grid gap-3 sm:grid-cols-3">
          {images.map((img) => (
            <li key={img.src} className="min-w-0">
              <img src={resolveMediaSrc(img.src)} alt="" className="aspect-[4/3] w-full rounded-xl object-cover" />
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-xs text-muted">{img.label}</p>
                <button type="button" className="text-xs text-clay hover:underline" onClick={() => onRemove(img.src)}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </Surface>
  );
}

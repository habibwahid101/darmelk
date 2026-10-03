import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { OfferForm, formFromOffer, payloadFromForm } from "@/components/admin/offer-form";
import { PageHeader, Surface } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/status-badge";
import { api, ApiError } from "@/lib/api-client";
import { mediaIdFromRef, resolveMediaSrc, sameMediaRef } from "@/lib/media-src";
import { fromApiOffer, isPublished, type PropertyOffer } from "@/lib/offers";
import { useAsync } from "@/lib/use-async";

export const Route = createFileRoute("/admin/offers/$slug/")({ component: AdminEditOffer });

const MAX_IMAGE_BYTES = 1_500_000;
const UNSUPPORTED = "Unsupported image format. Please upload JPG, PNG or WebP.";

type Slot = "cover" | "hero" | "gallery";
type UploadPhase = "idle" | "uploading" | "success" | "error";
type UploadState = { phase: UploadPhase; message?: string; file?: File };

const IDLE_UPLOADS: Record<Slot, UploadState> = {
  cover: { phase: "idle" },
  hero: { phase: "idle" },
  gallery: { phase: "idle" },
};

function mimeForFile(file: File): string | null {
  const type = file.type.toLowerCase();
  if (type === "image/jpg" || type === "image/jpeg") return "image/jpeg";
  if (type === "image/png" || type === "image/webp") return type;
  if (type) return null;
  if (/\.jpe?g$/i.test(file.name)) return "image/jpeg";
  if (/\.png$/i.test(file.name)) return "image/png";
  if (/\.webp$/i.test(file.name)) return "image/webp";
  return null;
}

function validateImageFile(file: File): string | null {
  if (file.type.toLowerCase() === "image/avif" || /\.avif$/i.test(file.name)) return UNSUPPORTED;
  if (!mimeForFile(file) || !/\.(jpe?g|png|webp)$/i.test(file.name)) return UNSUPPORTED;
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) return "Image must be 1.5 MB or smaller.";
  return null;
}

async function fileToBase64(file: File): Promise<{ bytesBase64: string; mime: string; filename: string }> {
  const mime = mimeForFile(file);
  if (!mime) throw new Error(UNSUPPORTED);
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x2000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return { bytesBase64: btoa(binary), mime, filename: file.name };
}

function AdminEditOffer() {
  const { slug } = Route.useParams();
  const { data, reload, loading, error: loadError } = useAsync(() => api.admin.offer(slug), [slug]);
  const offer = data?.offer ? fromApiOffer(data.offer) : undefined;
  const [form, setForm] = useState(() => (offer && data?.offer ? formFromOffer(offer, data.offer) : null));
  const [saving, setSaving] = useState(false);
  const [statusPending, setStatusPending] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [uploads, setUploads] = useState(IDLE_UPLOADS);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const uploading = Object.values(uploads).some((item) => item.phase === "uploading");
  const busy = saving || statusPending || uploading || Boolean(removing);

  useEffect(() => {
    if (offer && data?.offer) setForm(formFromOffer(offer, data.offer));
  }, [offer?.slug, offer?.updatedAt, offer?.version]);

  async function save() {
    if (!form) return;
    if (uploading) {
      setError("Uploading image…");
      setSaved(false);
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    setNotice(null);
    try {
      await api.admin.updateOffer(slug, payloadFromForm(form));
      setSaved(true);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save offer.");
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(status: "published" | "draft" | "closed") {
    setStatusPending(true);
    setError(null);
    setNotice(null);
    try {
      await api.admin.setOfferStatus(slug, status);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update status.");
    } finally {
      setStatusPending(false);
    }
  }

  async function upload(kind: Slot, file: File | undefined) {
    if (!file || uploads[kind].phase === "uploading") return;
    const invalid = validateImageFile(file);
    if (invalid) {
      setUploads((prev) => ({ ...prev, [kind]: { phase: "error", message: invalid, file } }));
      setSaved(false);
      return;
    }
    setUploads((prev) => ({ ...prev, [kind]: { phase: "uploading", file } }));
    setError(null);
    setSaved(false);
    setNotice(null);
    try {
      const body = await fileToBase64(file);
      const result = await api.admin.addOfferMedia(slug, { kind, ...body });
      if (result.offer) setForm(formFromOffer(fromApiOffer(result.offer), result.offer));
      setUploads((prev) => ({ ...prev, [kind]: { phase: "success", message: "Uploaded successfully" } }));
      await reload();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Could not upload image.";
      setUploads((prev) => ({ ...prev, [kind]: { phase: "error", message, file } }));
    }
  }

  async function removeMedia(src: string) {
    if (removing) return;
    setRemoving(src);
    setError(null);
    setSaved(false);
    setNotice(null);
    try {
      const mediaId = mediaIdFromRef(src);
      if (mediaId) {
        const result = await api.admin.removeOfferMedia(slug, mediaId);
        if (result.offer) setForm(formFromOffer(fromApiOffer(result.offer), result.offer));
      } else if (form && offer) {
        const payload = payloadFromForm(form);
        payload.image = offer.image && !sameMediaRef(offer.image, src) ? offer.image : null;
        payload.heroImage = offer.heroImage && !sameMediaRef(offer.heroImage, src) ? offer.heroImage : null;
        payload.gallery = (offer.gallery ?? []).filter((item) => !sameMediaRef(item, src));
        await api.admin.updateOffer(slug, payload);
      }
      setNotice("Image removed");
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove image.");
    } finally {
      setRemoving(null);
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
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void setStatus("draft")}>
              Unpublish
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void setStatus("closed")}>
              Close
            </Button>
          </>
        ) : (
          <Button size="sm" disabled={busy} onClick={() => void setStatus("published")}>
            Publish
          </Button>
        )}
      </div>
      <div className="min-h-6" aria-live="polite">
        {saved ? <p className="text-sm text-ok">Property details saved</p> : null}
        {notice ? <p className="text-sm text-ok">{notice}</p> : null}
        {uploading ? <p className="text-sm text-muted">Uploading image…</p> : null}
      </div>
      <MediaManager
        offer={offer}
        uploads={uploads}
        removing={removing}
        disabled={busy}
        onUpload={upload}
        onRetry={(kind) => void upload(kind, uploads[kind].file)}
        onRemove={(src) => void removeMedia(src)}
      />
      <OfferForm
        value={form}
        onChange={(next) => {
          setSaved(false);
          setNotice(null);
          setForm(next);
        }}
        onSubmit={() => void save()}
        pending={busy}
        error={error}
        slugLocked
        submitLabel={uploading ? "Uploading image…" : saving ? "Saving…" : "Save changes"}
      />
    </div>
  );
}

function UploadStatus({ state, onRetry }: { state: UploadState; onRetry: () => void }) {
  if (state.phase === "uploading") {
    return (
      <p className="mt-2 flex items-center gap-2 text-sm text-muted" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Uploading…
      </p>
    );
  }
  if (state.phase === "success") {
    return (
      <p className="mt-2 flex items-center gap-2 text-sm text-ok" role="status">
        <Check className="size-4" aria-hidden="true" />
        Uploaded successfully
      </p>
    );
  }
  if (state.phase === "error") {
    return (
      <div className="mt-2 space-y-2" role="alert">
        <p className="flex items-start gap-2 text-sm text-clay">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{state.message || "Could not upload image."}</span>
        </p>
        <button type="button" className="text-sm font-medium text-pine underline" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }
  return null;
}

function MediaManager({
  offer,
  uploads,
  removing,
  disabled,
  onUpload,
  onRetry,
  onRemove,
}: {
  offer: PropertyOffer;
  uploads: Record<Slot, UploadState>;
  removing: string | null;
  disabled: boolean;
  onUpload: (kind: Slot, file: File | undefined) => Promise<void>;
  onRetry: (kind: Slot) => void;
  onRemove: (src: string) => void;
}) {
  const images = [
    offer.image ? { src: offer.image, label: "Cover" } : null,
    offer.heroImage && offer.heroImage !== offer.image ? { src: offer.heroImage, label: "Hero" } : null,
    ...(offer.gallery ?? []).filter((src) => src !== offer.image && src !== offer.heroImage).map((src, i) => ({ src, label: `Gallery ${i + 1}` })),
  ].filter(Boolean) as Array<{ src: string; label: string }>;

  const fields: Array<{ kind: Slot; label: string; replace: boolean }> = [
    { kind: "cover", label: offer.image ? "Choose replacement image" : "Choose cover image", replace: Boolean(offer.image) },
    { kind: "hero", label: offer.heroImage ? "Choose replacement image" : "Choose hero image", replace: Boolean(offer.heroImage) },
    { kind: "gallery", label: "Choose gallery image", replace: Boolean(offer.gallery?.length) },
  ];

  return (
    <Surface>
      <h2 className="font-display text-xl font-semibold">Upload images</h2>
      <p className="mt-1 text-sm text-muted">JPG, PNG, or WebP. 1.5 MB maximum. Uploads are stored with this offer only.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {fields.map((field) => (
          <Field key={field.kind} label={field.label} hint={field.replace ? "No file chosen keeps the current image." : undefined}>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              disabled={disabled}
              aria-describedby={`${field.kind}-upload-status`}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                void onUpload(field.kind, file);
              }}
            />
            <div id={`${field.kind}-upload-status`}>
              <UploadStatus state={uploads[field.kind]} onRetry={() => onRetry(field.kind)} />
            </div>
          </Field>
        ))}
      </div>
      {images.length ? (
        <ul className="mt-5 grid gap-3 sm:grid-cols-3">
          {images.map((img) => {
            const resolved = resolveMediaSrc(img.src);
            return (
              <li key={`${img.label}-${img.src}`} className="min-w-0">
                <p className="mb-2 text-xs font-medium text-ink">Current image</p>
                {resolved ? (
                  <AdminImage src={resolved} alt={img.label} />
                ) : (
                  <p className="grid aspect-[4/3] place-items-center rounded-xl bg-paper px-3 text-center text-sm text-muted">
                    Image unavailable
                  </p>
                )}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-xs text-muted">{img.label}</p>
                  <button
                    type="button"
                    className="text-xs text-clay hover:underline disabled:opacity-50"
                    disabled={disabled}
                    onClick={() => onRemove(img.src)}
                  >
                    {removing === img.src ? "Removing…" : "Remove"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </Surface>
  );
}

function AdminImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (failed) {
    return (
      <p className="grid aspect-[4/3] place-items-center rounded-xl bg-paper px-3 text-center text-sm text-muted">
        Image unavailable
      </p>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className="block aspect-[4/3] h-full w-full rounded-xl object-cover object-center"
      onError={() => setFailed(true)}
    />
  );
}

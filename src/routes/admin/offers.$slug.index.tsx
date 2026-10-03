import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { OfferForm, formFromOffer, payloadFromForm } from "@/components/admin/offer-form";
import { PageHeader, Surface } from "@/components/states";
import { Button } from "@/components/ui/button";
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
  const gallery = (offer.gallery ?? []).filter((src) => src !== offer.image && src !== offer.heroImage);

  return (
    <Surface>
      <h2 className="font-display text-xl font-semibold">Upload images</h2>
      <p className="mt-1 text-sm text-muted">JPG, PNG or WebP · Max 1.5 MB</p>
      <div className="mt-6 grid grid-cols-1 items-start gap-8 sm:grid-cols-2 lg:grid-cols-3">
        <MediaCard
          title={offer.image ? "Current Cover Image" : "Cover Image"}
          src={offer.image}
          action={offer.image ? "Replace cover image" : "Upload cover image"}
          inputId="cover-file"
          statusId="cover-upload-status"
          state={uploads.cover}
          removing={removing}
          disabled={disabled}
          onPick={(file) => onUpload("cover", file)}
          onRetry={() => onRetry("cover")}
          onRemove={offer.image ? () => onRemove(offer.image!) : undefined}
        />
        <MediaCard
          title={offer.heroImage ? "Current Hero Image" : "Hero Image"}
          src={offer.heroImage}
          action={offer.heroImage ? "Replace hero image" : "Upload hero image"}
          inputId="hero-file"
          statusId="hero-upload-status"
          state={uploads.hero}
          removing={removing}
          disabled={disabled}
          onPick={(file) => onUpload("hero", file)}
          onRetry={() => onRetry("hero")}
          onRemove={offer.heroImage ? () => onRemove(offer.heroImage!) : undefined}
        />
      </div>
      <div className="mt-8">
        <h3 className="font-display text-lg font-semibold">Gallery</h3>
        <GalleryAdder
          state={uploads.gallery}
          disabled={disabled}
          onPick={(file) => onUpload("gallery", file)}
          onRetry={() => onRetry("gallery")}
        />
        {gallery.length ? (
          <ul className="mt-6 grid grid-cols-1 items-start gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {gallery.map((src, index) => (
              <li key={src}>
                <MediaCard
                  title="Gallery Image"
                  src={src}
                  action=""
                  inputId={`gallery-file-${index}`}
                  statusId={`gallery-item-${index}`}
                  state={{ phase: "idle" }}
                  removing={removing}
                  disabled={disabled}
                  onRemove={() => onRemove(src)}
                />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Surface>
  );
}

function GalleryAdder({
  state,
  disabled,
  onPick,
  onRetry,
}: {
  state: UploadState;
  disabled: boolean;
  onPick: (file: File | undefined) => void;
  onRetry: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="mt-3">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={disabled}
        aria-describedby="gallery-upload-status"
        onClick={() => inputRef.current?.click()}
      >
        Add gallery image
      </Button>
      <input
        ref={inputRef}
        id="gallery-file"
        type="file"
        className="sr-only"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        disabled={disabled}
        aria-label="Add gallery image"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          onPick(file);
        }}
      />
      <div id="gallery-upload-status">
        <UploadStatus state={state} onRetry={onRetry} />
      </div>
    </div>
  );
}

function MediaCard({
  title,
  src,
  action,
  inputId,
  statusId,
  state,
  removing,
  disabled,
  onPick,
  onRetry,
  onRemove,
}: {
  title: string;
  src?: string | null;
  action: string;
  inputId: string;
  statusId: string;
  state: UploadState;
  removing: string | null;
  disabled: boolean;
  onPick?: (file: File | undefined) => void;
  onRetry?: () => void;
  onRemove?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const resolved = src ? resolveMediaSrc(src) : "";
  return (
    <article className="flex min-w-0 flex-col rounded-xl bg-paper p-4">
      <p className="text-xs font-medium text-ink">{title}</p>
      <div className="mt-2 aspect-[4/3] overflow-hidden rounded-xl bg-cream">
        {resolved ? (
          <AdminImage src={resolved} alt={title} />
        ) : (
          <p className="grid h-full place-items-center px-3 text-center text-sm text-muted">No image yet</p>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {action && onPick ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={disabled}
            aria-describedby={statusId}
            onClick={() => inputRef.current?.click()}
          >
            {action}
          </Button>
        ) : null}
        {src && onRemove ? (
          <Button type="button" size="sm" variant="secondary" disabled={disabled} onClick={onRemove}>
            {removing === src ? "Removing…" : "Remove"}
          </Button>
        ) : null}
      </div>
      {onRetry ? (
        <div id={statusId}>
          <UploadStatus state={state} onRetry={onRetry} />
        </div>
      ) : null}
      {onPick ? (
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          className="sr-only"
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          disabled={disabled}
          aria-label={action}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            onPick(file);
          }}
        />
      ) : null}
    </article>
  );
}

function AdminImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (failed) {
    return (
      <p className="grid size-full place-items-center bg-paper px-3 text-center text-sm text-muted" role="img" aria-label="Image unavailable">
        Image unavailable
      </p>
    );
  }
  return <img src={src} alt={alt} className="block size-full object-cover object-center" onError={() => setFailed(true)} />;
}

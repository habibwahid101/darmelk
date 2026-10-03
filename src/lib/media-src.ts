/** Persistent property-image references. Never return a page-relative filename. */

const MEDIA_PATH = /\/api\/offers\/[^/]+\/media\/[^/?#]+/;

export function mediaIdFromRef(src: string | null | undefined): string | null {
  if (!src) return null;
  const match = src.match(/\/api\/offers\/[^/]+\/media\/([^/?#]+)/);
  return match?.[1] ?? null;
}

export function resolveMediaSrc(src: string | null | undefined, apiBase = ""): string {
  const text = src?.trim() ?? "";
  if (!text || text.startsWith("blob:") || text.startsWith("data:")) return "";
  if (/^https?:\/\//i.test(text)) return text;
  const base = apiBase.replace(/\/$/, "");
  if (text.startsWith("/api/")) return `${base}${text}`;
  if (text.startsWith("/images/") || text.startsWith("/brand/")) return text;
  if (text.startsWith("images/")) return `/${text}`;
  if (text.startsWith("/")) return text;
  return "";
}

export function persistMediaSrc(src: string | null | undefined, apiBase = ""): string {
  const text = src?.trim() ?? "";
  if (!text || text.startsWith("blob:") || text.startsWith("data:")) return "";
  const media = text.match(MEDIA_PATH);
  if (media) return media[0];
  const base = apiBase.replace(/\/$/, "");
  if (base && text.startsWith(base)) {
    const rest = text.slice(base.length);
    return rest.startsWith("/") ? rest : `/${rest}`;
  }
  if (text.startsWith("/images/") || text.startsWith("/brand/") || text.startsWith("/api/")) return text;
  if (text.startsWith("images/")) return `/${text}`;
  if (/^https?:\/\//i.test(text)) return text;
  if (text.startsWith("/")) return text;
  return text;
}

export function sameMediaRef(a: string | null | undefined, b: string | null | undefined, apiBase = ""): boolean {
  const left = persistMediaSrc(a, apiBase);
  const right = persistMediaSrc(b, apiBase);
  return Boolean(left) && left === right;
}

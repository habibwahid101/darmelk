export type OfferStatus = "available" | "coming-soon" | "draft" | "published" | "closed";

export type PropertyOffer = {
  slug: string;
  title: string;
  category: string;
  categorySlug: string;
  location?: string;
  image: string;
  heroImage?: string;
  gallery?: string[];
  imageAlt?: string;
  heroImageAlt?: string;
  retailValue: number;
  bookingAmount: number;
  qualificationBenefit: number;
  commissionEligibleAmount?: number;
  status: OfferStatus;
  flagship?: boolean;
  summary: string;
  details?: string;
  features?: string[];
  notes?: string;
  displayOrder?: number;
  version?: number;
  updatedAt?: string;
};

export const FLAGSHIP: PropertyOffer = {
  slug: "five-star-hotel-share",
  title: "Five-Star Hotel Share",
  category: "Hotel & Resort Shares",
  categorySlug: "hotel-resort-shares",
  location: "Bangladesh",
  image: "/images/flagship-suite.jpg",
  heroImage: "/images/hero-hotel.jpg",
  gallery: ["/images/category-resort.jpg"],
  retailValue: 650_000,
  bookingAmount: 50_000,
  qualificationBenefit: 600_000,
  commissionEligibleAmount: 50_000,
  status: "available",
  flagship: true,
  summary:
    "A curated hospitality share. Begin with a defined booking amount and progress toward this offer’s qualification benefit.",
};

export const OFFERS: PropertyOffer[] = [FLAGSHIP];

export type Category = {
  slug: string;
  title: string;
  image: string;
  available: boolean;
  blurb: string;
};

export const CATEGORIES: Category[] = [
  {
    slug: "hotel-resort-shares",
    title: "Hotel & Resort Shares",
    image: "/images/category-resort.jpg",
    available: true,
    blurb: "Hospitality shares with defined booking terms.",
  },
  {
    slug: "land-plots",
    title: "Land & Plots",
    image: "/images/category-land.jpg",
    available: false,
    blurb: "Plot and land offers will appear here when published.",
  },
  {
    slug: "apartments",
    title: "Flats & Apartments",
    image: "/images/category-apt.jpg",
    available: false,
    blurb: "Residential offers will appear here when published.",
  },
  {
    slug: "investment",
    title: "Commercial Properties",
    image: "/images/category-commercial.jpg",
    available: false,
    blurb: "Commercial and office offers will appear here when published.",
  },
];

export const COMMISSION_LEVELS = [
  { level: 1, positions: 3, rate: 0.1 },
  { level: 2, positions: 9, rate: 0.08 },
  { level: 3, positions: 27, rate: 0.06 },
  { level: 4, positions: 81, rate: 0.04 },
  { level: 5, positions: 243, rate: 0.02 },
] as const;

export const TOTAL_POSITIONS = 363;

export function formatBdt(amount: number) {
  return `BDT\u00A0${amount.toLocaleString("en-US")}`;
}

export function exampleCommission(bookingAmount: number, rate: number, positions: number) {
  return Math.round(bookingAmount * rate * positions);
}

export function isBookable(status: string | undefined): boolean {
  return status === "published" || status === "available";
}

export function isPublished(status: string | undefined): boolean {
  return status === "published" || status === "available";
}

export function resolveMediaSrc(src: string | null | undefined): string {
  if (!src) return "";
  if (src.startsWith("/api/")) {
    const base = (import.meta.env.VITE_API_URL as string | undefined) ?? "";
    return `${base}${src}`;
  }
  return src;
}

export function persistMediaSrc(src: string | null | undefined): string {
  if (!src) return "";
  const base = ((import.meta.env.VITE_API_URL as string | undefined) ?? "").replace(/\/$/, "");
  if (base && src.startsWith(base)) return src.slice(base.length) || src;
  return src;
}


export type ApiOffer = {
  slug: string;
  title: string;
  category: string;
  category_slug: string;
  location: string | null;
  image: string | null;
  hero_image: string | null;
  image_alt?: string | null;
  hero_image_alt?: string | null;
  gallery?: string[] | null;
  retail_value: number;
  booking_amount: number;
  qualification_benefit: number;
  commission_eligible_amount?: number | null;
  status: OfferStatus;
  flagship: boolean;
  summary: string;
  details?: string | null;
  features?: string[] | null;
  notes?: string | null;
  display_order?: number | null;
  version?: number | null;
  updated_at?: string | null;
};

export function fromApiOffer(row: ApiOffer): PropertyOffer {
  const gallery = Array.isArray(row.gallery) ? row.gallery.map(resolveMediaSrc).filter(Boolean) : [];
  if (row.slug === FLAGSHIP.slug && gallery.length === 0 && FLAGSHIP.gallery) {
    gallery.push(...FLAGSHIP.gallery);
  }
  return {
    slug: row.slug,
    title: row.title,
    category: row.category,
    categorySlug: row.category_slug,
    location: row.location ?? undefined,
    image: resolveMediaSrc(row.image) || (row.slug === FLAGSHIP.slug ? FLAGSHIP.image : ""),
    heroImage: resolveMediaSrc(row.hero_image) || undefined,
    gallery,
    imageAlt: row.image_alt ?? undefined,
    heroImageAlt: row.hero_image_alt ?? undefined,
    retailValue: row.retail_value,
    bookingAmount: row.booking_amount,
    qualificationBenefit: row.qualification_benefit,
    commissionEligibleAmount: row.commission_eligible_amount ?? row.booking_amount,
    status: row.status,
    flagship: row.flagship,
    summary: row.summary,
    details: row.details ?? undefined,
    features: Array.isArray(row.features) ? row.features : undefined,
    notes: row.notes ?? undefined,
    displayOrder: row.display_order ?? undefined,
    version: row.version ?? undefined,
    updatedAt: row.updated_at ?? undefined,
  };
}

export function pickFlagship(offers: PropertyOffer[]): PropertyOffer {
  return offers.find((o) => o.flagship && isPublished(o.status)) ?? offers.find((o) => isPublished(o.status)) ?? FLAGSHIP;
}

export function getOffer(slug: string) {
  return OFFERS.find((o) => o.slug === slug);
}

/** Unique approved images for an offer, hero first, then card, then gallery. */
export function offerImages(offer: Pick<PropertyOffer, "image" | "heroImage" | "gallery">): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const src of [offer.heroImage, offer.image, ...(offer.gallery ?? [])].map(resolveMediaSrc)) {
    if (!src || seen.has(src)) continue;
    seen.add(src);
    out.push(src);
  }
  return out;
}

export function offersInCategory(categorySlug: string, offers: PropertyOffer[] = OFFERS) {
  return offers.filter((o) => o.categorySlug === categorySlug);
}

export function catalogWithFallback(offers: PropertyOffer[] | undefined): PropertyOffer[] {
  const published = (offers ?? []).filter((o) => isPublished(o.status));
  return published.length ? published : OFFERS.filter((o) => isBookable(o.status));
}

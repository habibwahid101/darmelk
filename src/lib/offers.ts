export type OfferStatus = "available" | "coming-soon";

export type PropertyOffer = {
  slug: string;
  title: string;
  category: string;
  categorySlug: string;
  location?: string;
  image: string;
  heroImage?: string;
  retailValue: number;
  bookingAmount: number;
  qualificationBenefit: number;
  status: OfferStatus;
  flagship?: boolean;
  summary: string;
};

export const FLAGSHIP: PropertyOffer = {
  slug: "five-star-hotel-share",
  title: "Five-Star Hotel Share",
  category: "Hotel & Resort Shares",
  categorySlug: "hotel-resort-shares",
  location: "Bangladesh",
  image: "/images/flagship-suite.jpg",
  heroImage: "/images/hero-hotel.jpg",
  retailValue: 650_000,
  bookingAmount: 50_000,
  qualificationBenefit: 600_000,
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
    title: "Apartments / Residential",
    image: "/images/category-apt.jpg",
    available: false,
    blurb: "Residential offers will appear here when published.",
  },
  {
    slug: "investment",
    title: "Investment Properties",
    image: "/images/hero-hotel.jpg",
    available: false,
    blurb: "Additional investment offers will appear here when published.",
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
  return `BDT ${amount.toLocaleString("en-US")}`;
}

export function exampleCommission(bookingAmount: number, rate: number, positions: number) {
  return Math.round(bookingAmount * rate * positions);
}

export function getOffer(slug: string) {
  return OFFERS.find((o) => o.slug === slug);
}

export function offersInCategory(categorySlug: string) {
  return OFFERS.filter((o) => o.categorySlug === categorySlug);
}

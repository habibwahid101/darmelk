import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("property media references never become page-relative filenames", async () => {
  const mod = await import(pathToFileURL(join(root, "src/lib/media-src.ts")).href);
  const base = "https://api.darmelk.com";
  assert.equal(mod.resolveMediaSrc("photo.jpg", base), "");
  assert.equal(mod.resolveMediaSrc("blob:http://localhost/1", base), "");
  assert.equal(mod.resolveMediaSrc("/images/hero-hotel.jpg", base), "/images/hero-hotel.jpg");
  assert.equal(mod.resolveMediaSrc("images/hero-hotel.jpg", base), "/images/hero-hotel.jpg");
  assert.equal(
    mod.resolveMediaSrc("/api/offers/plot/media/img_abc", base),
    "https://api.darmelk.com/api/offers/plot/media/img_abc",
  );
  assert.equal(
    mod.persistMediaSrc("https://api.darmelk.com/api/offers/plot/media/img_abc", base),
    "/api/offers/plot/media/img_abc",
  );
  assert.equal(mod.persistMediaSrc("/images/flagship-suite.jpg", base), "/images/flagship-suite.jpg");
  assert.equal(mod.mediaIdFromRef("https://api.darmelk.com/api/offers/plot/media/img_abc"), "img_abc");
  assert.equal(mod.sameMediaRef("https://api.darmelk.com/api/offers/plot/media/img_abc", "/api/offers/plot/media/img_abc", base), true);
  assert.equal(mod.sameMediaRef("/images/hero-hotel.jpg", "/images/flagship-suite.jpg", base), false);
});

test("admin upload, remove, and save feedback stay on the persisted media path", () => {
  const page = read("src/routes/admin/offers.$slug.index.tsx");
  const engine = read("backend/src/engine/offers.ts");
  assert.match(page, /Uploaded successfully/);
  assert.match(page, /Uploading…/);
  assert.match(page, /Replace cover image/);
  assert.match(page, /Upload cover image/);
  assert.match(page, /Replace hero image/);
  assert.match(page, /Upload hero image/);
  assert.match(page, /Add gallery image/);
  assert.match(page, /Current Cover Image/);
  assert.match(page, /Current Hero Image/);
  assert.match(page, /Gallery Image/);
  assert.match(page, /className="sr-only"/);
  assert.match(page, /type="button"/);
  assert.match(page, /Retry/);
  assert.doesNotMatch(page, /No file chosen keeps the current image/);
  assert.doesNotMatch(page, /Choose replacement image/);
  assert.match(page, /Property details saved/);
  assert.match(page, /Unsupported image format\. Please upload JPG, PNG or WebP\./);
  assert.match(page, /Uploading image…/);
  assert.doesNotMatch(page, /createObjectURL/);
  assert.match(page, /removeOfferMedia/);
  assert.match(engine, /UNSUPPORTED_IMAGE/);
  assert.match(engine, /sniffImage/);
  assert.match(engine, /canonicalMediaRef/);
  assert.match(engine, /referenceDropped/);
  assert.doesNotMatch(engine, /\/properties\//);
});

test("property detail mobile spacing is local and hero images cover their frame", () => {
  const page = read("src/routes/properties.$slug.tsx");
  assert.match(page, /offerImages/);
  assert.match(page, /rest\.length === 1/);
  assert.match(page, /rest\.length > 1/);
  assert.match(page, /object-cover object-center/);
  assert.match(page, /h-full w-full/);
  assert.match(page, /min-\[769px\]:py-\[6\.5rem\]/);
  assert.match(page, /Property image unavailable/);
  assert.doesNotMatch(page, /section-y/);
  assert.doesNotMatch(page, /min-h-screen|100vh|min-h-\[100vh\]/);
  assert.doesNotMatch(read("src/styles.css"), /properties-\$slug/);
});

test("member property thumbnails reuse the shared media resolver", async () => {
  const mod = await import(pathToFileURL(join(root, "src/lib/media-src.ts")).href);
  const base = "https://api.darmelk.com";
  const overview = read("src/routes/app/index.tsx");
  const bookings = read("src/routes/app/bookings.tsx");
  const detail = read("src/routes/app/bookings.$id.tsx");
  const card = read("src/components/property-card.tsx");
  for (const page of [overview, bookings, detail]) {
    assert.match(page, /ResolvedPropertyImage/);
    assert.doesNotMatch(page, /<img[^>]+src=\{(?:booking\.image|b\.image|FLAGSHIP\.image)/);
  }
  assert.match(card, /export function ResolvedPropertyImage/);
  assert.match(card, /resolveMediaSrc\(src\)/);
  assert.match(card, /Property image unavailable/);
  assert.equal(mod.resolveMediaSrc("/api/offers/five-star-hotel-share/media/img_abc", base), "https://api.darmelk.com/api/offers/five-star-hotel-share/media/img_abc");
  assert.equal(mod.resolveMediaSrc("https://api.darmelk.com/api/offers/five-star-hotel-share/media/img_abc", base), "https://api.darmelk.com/api/offers/five-star-hotel-share/media/img_abc");
  assert.equal(mod.resolveMediaSrc("/images/flagship-suite.jpg", base), "/images/flagship-suite.jpg");
  assert.equal(mod.resolveMediaSrc("image.jpg", base), "");
  assert.equal(mod.resolveMediaSrc("image.jpg", base).includes("/app/"), false);
  assert.equal(mod.resolveMediaSrc("image.jpg", base).includes("/properties/"), false);
});

test("admin media cards keep upload actions inside the card", () => {
  const page = read("src/routes/admin/offers.$slug.index.tsx");
  assert.match(page, /function MediaCard/);
  assert.match(page, /aspect-\[4\/3\] overflow-hidden/);
  assert.match(page, /grid-cols-1 items-start gap-8 sm:grid-cols-2 lg:grid-cols-3/);
  assert.match(page, /size-full object-cover object-center/);
  assert.doesNotMatch(page, /h-full w-full/);
  assert.match(page, /if \(uploading\)/);
  assert.match(page, /Uploading image…/);
  assert.match(page, /phase === "error"/);
  assert.match(page, /role="alert"/);
  assert.match(page, /role="status"/);
});

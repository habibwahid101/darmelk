import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Offer } from "@/lib/api-client";
import type { Promotion, PromotionReward } from "@/lib/api-client";

export type PromotionFormValue = {
  title: string;
  shortDescription: string;
  description: string;
  startAt: string;
  endAt: string;
  offerScope: "all" | "selected";
  offerSlugs: string[];
  terms: string;
  displayOrder: string;
  rewards: Array<{ name: string; description: string; quantity: string }>;
};

function toLocalInput(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function emptyPromotionForm(): PromotionFormValue {
  const start = new Date();
  const end = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  return {
    title: "",
    shortDescription: "",
    description: "",
    startAt: toLocalInput(start.toISOString()),
    endAt: toLocalInput(end.toISOString()),
    offerScope: "selected",
    offerSlugs: [],
    terms: "",
    displayOrder: "0",
    rewards: [{ name: "", description: "", quantity: "1" }],
  };
}

export function formFromPromotion(p: Promotion): PromotionFormValue {
  return {
    title: p.title,
    shortDescription: p.short_description,
    description: p.description,
    startAt: toLocalInput(p.start_at),
    endAt: toLocalInput(p.end_at),
    offerScope: p.offer_scope,
    offerSlugs: p.offers.map((o) => o.slug),
    terms: p.terms,
    displayOrder: String(p.display_order),
    rewards: p.rewards.length
      ? p.rewards.map((r: PromotionReward) => ({
          name: r.name,
          description: r.description,
          quantity: String(r.quantity),
        }))
      : [{ name: "", description: "", quantity: "1" }],
  };
}

export function payloadFromPromotionForm(form: PromotionFormValue) {
  return {
    title: form.title,
    shortDescription: form.shortDescription,
    description: form.description,
    startAt: form.startAt ? new Date(form.startAt).toISOString() : "",
    endAt: form.endAt ? new Date(form.endAt).toISOString() : "",
    offerScope: form.offerScope,
    offerSlugs: form.offerSlugs,
    terms: form.terms,
    displayOrder: Number(form.displayOrder || 0),
    rewards: form.rewards
      .filter((r) => r.name.trim())
      .map((r, i) => ({
        name: r.name.trim(),
        description: r.description.trim(),
        quantity: Number(r.quantity || 1),
        display_order: i,
      })),
  };
}

export function PromotionForm({
  value,
  onChange,
  onSubmit,
  pending,
  error,
  submitLabel,
  offers,
}: {
  value: PromotionFormValue;
  onChange: (next: PromotionFormValue) => void;
  onSubmit: () => void;
  pending: boolean;
  error: string | null;
  submitLabel: string;
  offers: Offer[];
}) {
  function set<K extends keyof PromotionFormValue>(key: K, next: PromotionFormValue[K]) {
    onChange({ ...value, [key]: next });
  }
  function setReward(i: number, patch: Partial<PromotionFormValue["rewards"][0]>) {
    const rewards = value.rewards.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    onChange({ ...value, rewards });
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <Field label="Promotion title" hint="Shown on the member dashboard card.">
        <Input value={value.title} onChange={(e) => set("title", e.target.value)} maxLength={160} required />
      </Field>
      <Field label="Short description">
        <Input value={value.shortDescription} onChange={(e) => set("shortDescription", e.target.value)} maxLength={280} />
      </Field>
      <Field label="Detailed description">
        <textarea
          className="field-control min-h-28"
          value={value.description}
          onChange={(e) => set("description", e.target.value)}
          maxLength={20000}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Start" hint="Server time is authoritative.">
          <Input type="datetime-local" value={value.startAt} onChange={(e) => set("startAt", e.target.value)} required />
        </Field>
        <Field label="End">
          <Input type="datetime-local" value={value.endAt} onChange={(e) => set("endAt", e.target.value)} required />
        </Field>
      </div>
      <Field label="Eligible properties">
        <div className="space-y-3 rounded-xl bg-paper p-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={value.offerScope === "all"}
              onChange={() => set("offerScope", "all")}
            />
            All applicable properties
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={value.offerScope === "selected"}
              onChange={() => set("offerScope", "selected")}
            />
            Selected properties
          </label>
          {value.offerScope === "selected" ? (
            <ul className="mt-2 grid gap-2">
              {offers.map((offer) => {
                const checked = value.offerSlugs.includes(offer.slug);
                return (
                  <li key={offer.slug}>
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={checked}
                        onChange={() => {
                          const next = checked
                            ? value.offerSlugs.filter((s) => s !== offer.slug)
                            : [...value.offerSlugs, offer.slug];
                          set("offerSlugs", next);
                        }}
                      />
                      <span className="min-w-0">
                        <span className="font-medium">{offer.title}</span>
                        <span className="block break-all text-xs text-muted">{offer.slug}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </Field>
      <div className="space-y-3">
        <p className="text-xs font-medium text-ink/80">Rewards</p>
        {value.rewards.map((reward, i) => (
          <div key={i} className="grid gap-3 rounded-xl bg-paper p-4 sm:grid-cols-[1fr_5rem_auto]">
            <Field label="Reward name">
              <Input value={reward.name} onChange={(e) => setReward(i, { name: e.target.value })} maxLength={120} />
            </Field>
            <Field label="Qty">
              <Input type="number" min={1} max={99} value={reward.quantity} onChange={(e) => setReward(i, { quantity: e.target.value })} />
            </Field>
            <div className="flex items-end">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={value.rewards.length === 1}
                onClick={() => onChange({ ...value, rewards: value.rewards.filter((_, idx) => idx !== i) })}
              >
                Remove
              </Button>
            </div>
            <div className="sm:col-span-3">
              <Field label="Description">
                <Input value={reward.description} onChange={(e) => setReward(i, { description: e.target.value })} />
              </Field>
            </div>
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => onChange({ ...value, rewards: [...value.rewards, { name: "", description: "", quantity: "1" }] })}
        >
          Add reward
        </Button>
      </div>
      <Field label="Terms & Conditions">
        <textarea
          className="field-control min-h-32 whitespace-pre-wrap"
          value={value.terms}
          onChange={(e) => set("terms", e.target.value)}
          maxLength={20000}
        />
      </Field>
      <Field label="Display order" hint="Lower numbers appear first on the dashboard.">
        <Input type="number" min={0} value={value.displayOrder} onChange={(e) => set("displayOrder", e.target.value)} />
      </Field>
      {error ? <p className="text-sm text-clay">{error}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { MerchantBundle, MerchantGift } from "@/lib/api-client";
import { formatBdt } from "@/lib/offers";

export type BundleFormValue = {
  name: string;
  description: string;
  purchaseAmount: string;
  purchasedCredit: string;
  bonusCredit: string;
  terms: string;
  displayOrder: string;
  status: "draft" | "active" | "inactive";
  gifts: MerchantGift[];
};

export function emptyBundleForm(): BundleFormValue {
  return {
    name: "",
    description: "",
    purchaseAmount: "",
    purchasedCredit: "",
    bonusCredit: "0",
    terms: "",
    displayOrder: "0",
    status: "draft",
    gifts: [],
  };
}

export function formFromBundle(bundle: MerchantBundle): BundleFormValue {
  return {
    name: bundle.name,
    description: bundle.description,
    purchaseAmount: String(bundle.purchase_amount),
    purchasedCredit: String(bundle.purchased_credit),
    bonusCredit: String(bundle.bonus_credit),
    terms: bundle.terms,
    displayOrder: String(bundle.display_order),
    status: bundle.status,
    gifts: bundle.gifts.length ? bundle.gifts : [],
  };
}

export function payloadFromBundleForm(form: BundleFormValue) {
  return {
    name: form.name,
    description: form.description,
    purchaseAmount: Number(form.purchaseAmount),
    purchasedCredit: Number(form.purchasedCredit),
    bonusCredit: Number(form.bonusCredit || 0),
    terms: form.terms,
    displayOrder: Number(form.displayOrder || 0),
    status: form.status,
    gifts: form.gifts.filter((g) => g.label.trim()),
  };
}

export function MerchantBundleForm({
  value,
  onChange,
  onSubmit,
  pending,
  error,
  submitLabel,
}: {
  value: BundleFormValue;
  onChange: (next: BundleFormValue) => void;
  onSubmit: () => void;
  pending: boolean;
  error: string | null;
  submitLabel: string;
}) {
  const purchased = Number(value.purchasedCredit) || 0;
  const bonus = Number(value.bonusCredit) || 0;
  function set<K extends keyof BundleFormValue>(key: K, next: BundleFormValue[K]) {
    onChange({ ...value, [key]: next });
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <Field label="Bundle name">
        <Input value={value.name} onChange={(e) => set("name", e.target.value)} required maxLength={120} />
      </Field>
      <Field label="Description" hint="Optional">
        <textarea
          className="min-h-24 w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-pine"
          value={value.description}
          onChange={(e) => set("description", e.target.value)}
          maxLength={2000}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Purchase amount (BDT)">
          <Input inputMode="numeric" value={value.purchaseAmount} onChange={(e) => set("purchaseAmount", e.target.value)} required />
        </Field>
        <Field label="Purchased / base credit">
          <Input inputMode="numeric" value={value.purchasedCredit} onChange={(e) => set("purchasedCredit", e.target.value)} required />
        </Field>
        <Field label="Bonus credit">
          <Input inputMode="numeric" value={value.bonusCredit} onChange={(e) => set("bonusCredit", e.target.value)} />
        </Field>
      </div>
      <p className="text-sm text-muted">
        Total usable credit (derived): <span className="font-medium tabular-nums">{formatBdt(purchased + bonus)}</span>
      </p>
      <div>
        <p className="text-xs font-medium text-ink/80">Optional gifts</p>
        <p className="mt-1 text-xs text-subtle">Free-text rewards such as a phone, laptop, or tour. Not Merchant Credit.</p>
        <ul className="mt-3 space-y-2">
          {value.gifts.map((gift, index) => (
            <li key={index} className="grid grid-cols-[1fr_5rem_auto] gap-2">
              <Input
                placeholder="Gift label"
                value={gift.label}
                onChange={(e) => {
                  const gifts = value.gifts.slice();
                  gifts[index] = { ...gift, label: e.target.value };
                  set("gifts", gifts);
                }}
              />
              <Input
                inputMode="numeric"
                value={String(gift.quantity)}
                onChange={(e) => {
                  const gifts = value.gifts.slice();
                  gifts[index] = { ...gift, quantity: Number(e.target.value) || 1 };
                  set("gifts", gifts);
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => set("gifts", value.gifts.filter((_, i) => i !== index))}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="mt-3"
          onClick={() => set("gifts", [...value.gifts, { label: "", quantity: 1 }])}
        >
          Add gift
        </Button>
      </div>
      <Field label="Terms & Conditions">
        <textarea
          className="min-h-40 w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-pine"
          value={value.terms}
          onChange={(e) => set("terms", e.target.value)}
          required
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Display order">
          <Input inputMode="numeric" value={value.displayOrder} onChange={(e) => set("displayOrder", e.target.value)} />
        </Field>
        <Field label="Status">
          <select
            className="h-11 w-full rounded-xl border border-line bg-paper px-3 text-sm"
            value={value.status}
            onChange={(e) => set("status", e.target.value as BundleFormValue["status"])}
          >
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </Field>
      </div>
      {error ? <p className="text-sm text-clay">{error}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
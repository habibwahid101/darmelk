export type TermsAcceptItem = {
  key: string;
  label: string;
  href: string;
};

export function TermsAccept({
  items,
  accepted,
  onChange,
  statement,
}: {
  items: TermsAcceptItem[];
  accepted: Record<string, boolean>;
  onChange: (key: string, value: boolean) => void;
  statement?: string;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">
        {statement ?? "Read each document, then confirm. Boxes start unchecked."}
      </legend>
      {items.map((item) => (
        <label key={item.key} className="flex items-start gap-3 rounded-xl bg-paper px-3 py-3 text-sm leading-relaxed">
          <input
            type="checkbox"
            className="mt-0.5 size-4 shrink-0 accent-[var(--color-pine)]"
            checked={Boolean(accepted[item.key])}
            onChange={(e) => onChange(item.key, e.target.checked)}
            required
          />
          <span>
            I have read and agree to the{" "}
            <a href={item.href} className="font-medium text-pine underline-offset-2 hover:underline">
              {item.label}
            </a>
            .
          </span>
        </label>
      ))}
    </fieldset>
  );
}

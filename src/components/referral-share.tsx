import { useState } from "react";
import { Check, Copy, Link2 } from "lucide-react";
import { Surface } from "@/components/states";
import { REFERRAL_ORIGIN, referralLinkFor } from "@/lib/referral";

export function ReferralShareCard({ code }: { code: string }) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const link = referralLinkFor(code, REFERRAL_ORIGIN);

  async function copy(kind: "code" | "link") {
    try {
      await navigator.clipboard.writeText(kind === "code" ? code : link);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
    }
  }

  return (
    <Surface className="flex flex-col justify-between">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-subtle">Your Referral</p>
      <p className="mt-2 min-w-0 truncate font-display text-xl font-semibold tracking-wide sm:text-2xl">{code}</p>
      <p className="mt-1 break-all text-xs text-muted">{link}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void copy("code")}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-pine hover:bg-pine/8"
          aria-label={copied === "code" ? "Referral code copied" : "Copy referral code"}
        >
          {copied === "code" ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied === "code" ? "Copied" : "Copy code"}
        </button>
        <button
          type="button"
          onClick={() => void copy("link")}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-pine hover:bg-pine/8"
          aria-label={copied === "link" ? "Referral link copied" : "Copy referral link"}
        >
          {copied === "link" ? <Check className="size-4" /> : <Link2 className="size-4" />}
          {copied === "link" ? "Copied" : "Copy link"}
        </button>
      </div>
    </Surface>
  );
}

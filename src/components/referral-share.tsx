import { useState } from "react";
import { Check, Copy, Link2, Share2 } from "lucide-react";
import { Surface } from "@/components/states";
import { referralLinkFor, referralShareText } from "@/lib/referral";

export function ReferralShareCard({ code }: { code: string }) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const link = referralLinkFor(code);

  async function copy(kind: "code" | "link") {
    try {
      await navigator.clipboard.writeText(kind === "code" ? code : link);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
    }
  }

  async function share() {
    const text = referralShareText(link);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Darmelk", text, url: link });
        return;
      } catch {
        // fall through to copy
      }
    }
    await copy("link");
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
        <button
          type="button"
          onClick={() => void share()}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-pine hover:bg-pine/8"
          aria-label="Share referral link"
        >
          <Share2 className="size-4" />
          Share
        </button>
      </div>
    </Surface>
  );
}

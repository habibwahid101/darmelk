import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export function PromotionBanner({
  id,
  title,
  framed = false,
}: {
  id: string;
  title: string;
  framed?: boolean;
}) {
  return (
    <img
      src={api.promotionBannerUrl(id)}
      alt={title ? `${title} banner` : "Promotion banner"}
      decoding="async"
      className={cn("block h-auto w-full max-w-full object-contain", framed ? "rounded-none" : "rounded-2xl")}
    />
  );
}

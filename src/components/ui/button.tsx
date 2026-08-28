import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-[background-color,color,box-shadow,transform,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
  {
    variants: {
      variant: {
        primary: "bg-pine text-pine-fg hover:bg-pine-deep",
        secondary:
          "bg-transparent text-ink shadow-[0_0_0_1px_rgb(26_25_22/0.14)] hover:bg-ink/5",
        ghost: "bg-transparent text-ink/80 hover:bg-ink/5 hover:text-ink",
        invert: "bg-cream text-ink hover:bg-white",
        invertGhost:
          "bg-transparent text-cream shadow-[0_0_0_1px_rgb(251_250_246/0.28)] hover:bg-cream/10",
      },
      size: {
        sm: "h-9 rounded-md px-3.5 text-sm",
        md: "h-12 rounded-lg px-5 text-sm",
        lg: "h-[3.25rem] rounded-lg px-6 text-[15px]",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "lg",
    },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}

export { buttonVariants };

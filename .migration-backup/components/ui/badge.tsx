// components/ui/badge.tsx — Duet status pills (exact handoff color pairs)
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-pill px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "bg-plum-soft text-plum",
        success: "bg-pill-success text-pill-success-fg",
        warning: "bg-pill-warning text-pill-warning-fg",
        destructive: "bg-pill-danger text-pill-danger-fg",
        muted: "bg-pill-neutral text-pill-neutral-fg"
      }
    },
    defaultVariants: { variant: "default" }
  }
);

export function Badge({
  className, variant, ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

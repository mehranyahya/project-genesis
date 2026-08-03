import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Quiet Monumental Luxury button.
 * Primary CTA = Serpentine (action-primary). Bronze is decorative only and is
 * never used as an interactive background. No scale, no shadow, no spinner.
 */
const buttonVariants = cva(
  [
    "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 border px-5 py-2",
    "text-sm font-bold leading-normal",
    "transition-colors duration-[180ms] ease-[cubic-bezier(0.2,0,0,1)]",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
    "disabled:cursor-not-allowed disabled:opacity-45",
    "motion-reduce:transition-none",
    "[&_svg]:size-4 [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        primary: [
          "border-action-primary bg-action-primary text-text-inverse",
          "enabled:hover:border-surface-inverse enabled:hover:bg-surface-inverse",
        ].join(" "),
        secondary: [
          "border-border-control bg-surface text-text-primary",
          "enabled:hover:bg-surface-media",
        ].join(" "),
        quiet: [
          "border-transparent bg-surface text-text-primary",
          "enabled:hover:border-border-control",
        ].join(" "),
        destructive: [
          "border-status-error bg-status-error text-text-inverse",
          "enabled:hover:border-surface-inverse enabled:hover:bg-surface-inverse",
        ].join(" "),
        // Compatibility aliases for untouched shadcn primitives.
        default: [
          "border-action-primary bg-action-primary text-text-inverse",
          "enabled:hover:border-surface-inverse enabled:hover:bg-surface-inverse",
        ].join(" "),
        outline: [
          "border-border-control bg-surface text-text-primary",
          "enabled:hover:bg-surface-media",
        ].join(" "),
        ghost: [
          "border-transparent bg-surface text-text-primary",
          "enabled:hover:border-border-control",
        ].join(" "),
        link: "border-transparent bg-surface text-text-primary underline underline-offset-4",
      },
      size: {
        default: "min-h-11 px-5",
        sm: "min-h-11 px-4",
        lg: "min-h-12 px-6 text-base",
        large: "min-h-12 px-6 text-base",
        icon: "min-h-11 w-11 px-0",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, loading = false, disabled, children, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        data-loading={loading ? "true" : undefined}
        aria-busy={loading ? true : undefined}
        aria-disabled={disabled || loading ? true : undefined}
        disabled={disabled || loading}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      >
        {children}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };

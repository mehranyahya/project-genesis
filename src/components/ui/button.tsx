import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 border px-5 py-2 text-sm font-bold leading-normal transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:border-border disabled:bg-disabled-surface disabled:text-disabled-foreground [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "border-primary bg-primary text-primary-foreground hover:bg-secondary hover:border-secondary",
        secondary:
          "border-border-strong bg-surface text-foreground hover:bg-surface-media",
        accent:
          "border-accent bg-accent text-accent-foreground hover:bg-primary hover:border-primary",
        quiet:
          "border-transparent bg-surface text-foreground hover:border-border-strong",
        destructive:
          "border-destructive bg-destructive text-destructive-foreground hover:bg-primary hover:border-primary",
        // Compatibility aliases for untouched shadcn primitives.
        default:
          "border-primary bg-primary text-primary-foreground hover:bg-secondary hover:border-secondary",
        outline:
          "border-border-strong bg-surface text-foreground hover:bg-surface-media",
        ghost:
          "border-transparent bg-surface text-foreground hover:border-border-strong",
        link: "border-transparent bg-surface text-foreground underline underline-offset-4",
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
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  loadingLabel?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      loadingLabel = "در حال ارسال…",
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        data-loading={loading ? "true" : undefined}
        aria-busy={loading || undefined}
        disabled={disabled || loading}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      >
        {loading && !asChild ? loadingLabel : children}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };

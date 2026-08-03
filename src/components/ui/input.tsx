import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, type = "text", ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        aria-invalid={invalid ? true : props["aria-invalid"]}
        className={cn(
          "block min-h-11 w-full border border-border-control bg-surface px-3 py-2 text-base text-text-primary",
          "placeholder:text-text-caption",
          "transition-colors duration-[180ms] motion-reduce:transition-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
          "disabled:cursor-not-allowed disabled:opacity-45",
          "aria-invalid:border-status-error aria-invalid:text-text-primary",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };

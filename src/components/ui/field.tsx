import * as React from "react";
import { cn } from "@/lib/utils";

export interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
}

/**
 * Label + control + hint/error wrapper.
 * Errors are announced textually and marked with a prefix, never by color alone.
 */
function Field({ id, label, hint, error, required, className, children, ...props }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className={cn("flex flex-col gap-2", className)} {...props}>
      <label htmlFor={id} className="text-sm font-bold text-foreground">
        {label}
        {required ? (
          <span className="ms-1 text-caption" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {children}
      {hint ? (
        <p id={hintId} className="text-sm leading-relaxed text-caption">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          id={errorId}
          className="flex items-start gap-2 border-s-2 border-destructive ps-2 text-sm leading-relaxed text-destructive"
        >
          <span className="font-bold">خطا:</span>
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

export { Field };

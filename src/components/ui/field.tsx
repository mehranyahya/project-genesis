import * as React from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/react";

export interface FieldProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "id"> {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  success?: string;
  required?: boolean;
}

/**
 * Label + control + hint/error/success wrapper.
 * The single child control is wired automatically to id, aria-describedby,
 * aria-errormessage and aria-invalid. Error and success are never expressed by
 * color alone: both carry an explicit textual marker.
 */
function Field({
  id,
  label,
  hint,
  error,
  success,
  required,
  className,
  children,
  ...props
}: FieldProps) {
  const t = useT();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const successId = success ? `${id}-success` : undefined;
  const describedBy = [hintId, successId].filter(Boolean).join(" ") || undefined;

  const control = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        id,
        "aria-describedby": describedBy,
        "aria-errormessage": errorId,
        "aria-invalid": error ? true : undefined,
        required: required || undefined,
      })
    : children;

  return (
    <div className={cn("flex flex-col gap-2", className)} {...props}>
      <label htmlFor={id} className="text-sm font-bold text-text-primary">
        {label}
        {required ? <span className="ms-1 text-text-caption">{t("(الزامی)")}</span> : null}
      </label>
      {control}
      {hint ? (
        <p id={hintId} className="text-sm leading-relaxed text-text-caption">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-2 border-s-2 border-status-error ps-2 text-sm leading-relaxed text-status-error"
        >
          <span className="font-bold">{t("خطا:")}</span>
          <span>{error}</span>
        </p>
      ) : null}
      {success ? (
        <p
          id={successId}
          role="status"
          aria-live="polite"
          className="flex items-start gap-2 border-s-2 border-status-success ps-2 text-sm leading-relaxed text-status-success"
        >
          <span className="font-bold">{t("انجام شد:")}</span>
          <span>{success}</span>
        </p>
      ) : null}
    </div>
  );
}

export { Field };

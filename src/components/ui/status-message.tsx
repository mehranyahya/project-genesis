import * as React from "react";
import { cn } from "@/lib/utils";

type StatusTone = "info" | "error" | "success";

const toneClasses: Record<StatusTone, string> = {
  info: "border-border-strong text-foreground",
  error: "border-destructive text-destructive",
  success: "border-success text-success",
};

// Non-color redundancy: every tone carries a textual prefix marker.
const tonePrefix: Record<StatusTone, string> = {
  info: "اطلاع:",
  error: "خطا:",
  success: "انجام شد:",
};

export interface StatusMessageProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: StatusTone;
}

function StatusMessage({
  className,
  tone = "info",
  children,
  ...props
}: StatusMessageProps) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      data-tone={tone}
      className={cn(
        "flex items-start gap-2 border-s-2 bg-surface px-3 py-2 text-sm leading-relaxed",
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      <span className="font-bold">{tonePrefix[tone]}</span>
      <span>{children}</span>
    </div>
  );
}

export { StatusMessage };

import * as React from "react";
import { cn } from "@/lib/utils";

/** Static placeholder block. No shimmer, no pulse, no spinner. */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      data-skeleton="true"
      className={cn("block bg-skeleton", className)}
      {...props}
    />
  );
}

export { Skeleton };

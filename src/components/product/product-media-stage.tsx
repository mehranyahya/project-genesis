import { useState } from "react";

import { ResponsiveImage } from "@/components/media/responsive-image";
import type { ProductDetailMedia } from "@/lib/product-detail";

export const MEDIA_EMPTY_TEXT = "رسانهٔ تأییدشده‌ای برای این محصول ثبت نشده است.";
export const MEDIA_PREV_LABEL = "رسانه قبلی";
export const MEDIA_NEXT_LABEL = "رسانه بعدی";

const positionFormatter = new Intl.NumberFormat("fa-IR");

const CONTROL =
  "inline-flex min-h-11 min-w-11 items-center justify-center border border-border-control bg-surface px-4 py-2 text-sm font-bold text-text-primary transition-colors duration-[180ms] enabled:hover:bg-surface-media disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none";

/**
 * Neutral 4:5 stage. The first ordered item is the full stone (contain);
 * subsequent ordered items are details (cover). No filter, tint or blend.
 */
export function ProductMediaStage({ media }: { media: readonly ProductDetailMedia[] }) {
  const [index, setIndex] = useState(0);
  const total = media.length;
  const current = total > 0 ? media[Math.min(index, total - 1)] : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="aspect-[4/5] w-full overflow-hidden border border-border-subtle bg-surface-media">
        {current ? (
          <ResponsiveImage
            media={current}
            fit={index === 0 ? "contain" : "cover"}
            sizes="(min-width: 1024px) 58vw, 100vw"
            priority={index === 0}
          />
        ) : (
          <div className="flex h-full items-end p-4">
            <p className="text-sm text-text-secondary">{MEDIA_EMPTY_TEXT}</p>
          </div>
        )}
      </div>

      {total > 1 ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={CONTROL}
            disabled={index === 0}
            onClick={() => setIndex((value) => Math.max(0, value - 1))}
          >
            {MEDIA_PREV_LABEL}
          </button>
          <button
            type="button"
            className={CONTROL}
            disabled={index >= total - 1}
            onClick={() => setIndex((value) => Math.min(total - 1, value + 1))}
          >
            {MEDIA_NEXT_LABEL}
          </button>
          <p aria-live="polite" className="text-sm text-text-secondary">
            {positionFormatter.format(Math.min(index, total - 1) + 1)} از{" "}
            {positionFormatter.format(total)}
          </p>
        </div>
      ) : null}
    </div>
  );
}

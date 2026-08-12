import { useState } from "react";

import { PublicMedia } from "@/components/media/public-media";
import type { ProductDetailMedia } from "@/lib/product-detail";
import { useT } from "@/lib/i18n/react";

export const MEDIA_EMPTY_TEXT = "رسانهٔ تأییدشده‌ای برای این محصول ثبت نشده است.";
export const MEDIA_PREV_LABEL = "رسانه قبلی";
export const MEDIA_NEXT_LABEL = "رسانه بعدی";

const positionFormatter = new Intl.NumberFormat("fa-IR");

const CONTROL =
  "inline-flex min-h-11 min-w-11 items-center justify-center border border-border-control bg-surface px-4 py-2 text-sm font-bold text-text-primary transition-colors duration-[180ms] enabled:hover:bg-surface-media disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none";

/** Neutral 4:5 product stage. The first visible image is the product-route LCP candidate. */
export function ProductMediaStage({ media }: { media: readonly ProductDetailMedia[] }) {
  const t = useT();
  const [index, setIndex] = useState(0);
  const total = media.length;
  const current = total > 0 ? media[Math.min(index, total - 1)] : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="aspect-[4/5] w-full overflow-hidden border border-border-subtle bg-surface-media p-4">
        {current ? (
          <PublicMedia
            media={current}
            fit="contain"
            priority={index === 0}
            sizes="(min-width: 1024px) 58vw, 100vw"
            className="block h-full w-full"
          />
        ) : (
          <div className="flex h-full items-end">
            <p className="text-sm text-text-secondary">{t(MEDIA_EMPTY_TEXT)}</p>
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
            {t(MEDIA_PREV_LABEL)}
          </button>
          <button
            type="button"
            className={CONTROL}
            disabled={index >= total - 1}
            onClick={() => setIndex((value) => Math.min(total - 1, value + 1))}
          >
            {t(MEDIA_NEXT_LABEL)}
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

import { useEffect, useRef, useState } from "react";

import { PublicMedia } from "@/components/media/public-media";
import type { ProductDetailMedia } from "@/lib/product-detail";
import { useLocale, useT } from "@/lib/i18n/react";

export const MEDIA_EMPTY_TEXT = "رسانهٔ تأییدشده‌ای برای این محصول ثبت نشده است.";
export const MEDIA_PREV_LABEL = "رسانه قبلی";
export const MEDIA_NEXT_LABEL = "رسانه بعدی";

const CONTROL =
  "inline-flex min-h-12 min-w-12 items-center justify-center rounded-sm border border-border-control bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors duration-[180ms] enabled:hover:bg-surface-media disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none";

/** Only a clicked candidate is requested; the visible image survives load failure. */
export function ProductMediaStage({ media }: { media: readonly ProductDetailMedia[] }) {
  const t = useT();
  const locale = useLocale();
  const [index, setIndex] = useState(0);
  const [pending, setPending] = useState<number | null>(null);
  const [failed, setFailed] = useState<number | null>(null);
  const [previous, setPrevious] = useState<ProductDetailMedia | null>(null);
  const generation = useRef(0);
  const mediaIdentity = media.map((item) => item.src).join("|");
  useEffect(() => {
    generation.current += 1;
    setIndex(0);
    setPending(null);
    setFailed(null);
    setPrevious(null);
    return () => {
      generation.current += 1;
    };
  }, [mediaIdentity]);
  useEffect(() => {
    if (pending === null) return;
    const ticket = generation.current;
    const timeout = setTimeout(() => {
      if (ticket !== generation.current) return;
      generation.current += 1;
      setPending(null);
      setFailed(pending);
    }, 20000);
    return () => clearTimeout(timeout);
  }, [pending]);

  const total = media.length;
  const visibleIndex = Math.min(index, Math.max(0, total - 1));
  const current = media[visibleIndex];
  const incoming = pending === null ? null : media[pending];
  const formatter = new Intl.NumberFormat(locale === "en" ? "en" : "fa");
  const select = (next: number) => {
    generation.current += 1;
    setFailed(null);
    setPending(next);
  };
  const fail = (target: number, ticket: number) => {
    if (generation.current !== ticket) return;
    generation.current += 1;
    setPending(null);
    setFailed(target);
  };
  const ready = async (image: HTMLImageElement, target: number, ticket: number) => {
    try {
      await image.decode();
      if (generation.current !== ticket) return;
      setPrevious(current ?? null);
      setIndex(target);
      setPending(null);
      setFailed(null);
    } catch {
      fail(target, ticket);
    }
  };
  const ticket = generation.current;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div
        className="relative aspect-[4/5] w-full overflow-hidden border border-border-subtle bg-surface-media p-4"
        aria-busy={pending !== null}
      >
        {previous ? (
          <PublicMedia
            media={previous}
            alt=""
            fit="contain"
            eager
            className="pointer-events-none absolute inset-4"
            sizes="(min-width: 1280px) 680px, (min-width: 1024px) 55vw, calc(100vw - 40px)"
          />
        ) : null}
        {current ? (
          <div
            className={`relative h-full w-full ${previous ? "media-enter" : ""}`}
            onAnimationEnd={() => setPrevious(null)}
          >
            <PublicMedia
              key={current.src}
              media={current}
              fit="contain"
              priority={visibleIndex === 0}
              eager
              sizes="(min-width: 1280px) 680px, (min-width: 1024px) 55vw, calc(100vw - 40px)"
              className="block h-full w-full"
            />
          </div>
        ) : (
          <div className="flex h-full items-end">
            <p className="text-sm text-text-secondary">{t(MEDIA_EMPTY_TEXT)}</p>
          </div>
        )}
        {incoming && pending !== null ? (
          <PublicMedia
            key={`pending-${incoming.src}`}
            media={incoming}
            alt=""
            fit="contain"
            eager
            className="pointer-events-none absolute inset-4 opacity-0"
            sizes="(min-width: 1280px) 680px, (min-width: 1024px) 55vw, calc(100vw - 40px)"
            onLoad={(event) => void ready(event.currentTarget, pending, ticket)}
            onError={() => fail(pending, ticket)}
          />
        ) : null}
      </div>

      {total > 1 ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={CONTROL}
            disabled={visibleIndex === 0 || pending !== null}
            onClick={() => select(visibleIndex - 1)}
          >
            {t(MEDIA_PREV_LABEL)}
          </button>
          <button
            type="button"
            className={CONTROL}
            disabled={visibleIndex >= total - 1 || pending !== null}
            onClick={() => select(visibleIndex + 1)}
          >
            {t(MEDIA_NEXT_LABEL)}
          </button>
          <p aria-live="polite" className="numeric text-sm text-text-secondary">
            {t("{current} از {total}", {
              current: formatter.format(visibleIndex + 1),
              total: formatter.format(total),
            })}
          </p>
        </div>
      ) : null}
      {pending !== null ? (
        <p role="status" className="text-sm text-text-secondary">
          {t("در حال بارگذاری تصویر…")}
        </p>
      ) : null}
      {failed !== null ? (
        <div role="alert" className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-status-error">
            {t("بارگذاری تصویر انجام نشد. تصویر قبلی حفظ شده است.")}
          </p>
          <button type="button" className={CONTROL} onClick={() => select(failed)}>
            {t("بارگذاری دوبارهٔ تصویر")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

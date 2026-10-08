import { useEffect, useState } from "react";
import { PublicMedia } from "@/components/media/public-media";
import type { ProductDetailMedia } from "@/lib/product-detail";
import { createMediaSwapGuard, prepareMediaSwap } from "@/lib/media-swap";
import { useLocale, useT } from "@/lib/i18n/react";

export const MEDIA_EMPTY_TEXT = "رسانهٔ تأییدشده‌ای برای این محصول ثبت نشده است.";
export const MEDIA_PREV_LABEL = "رسانه قبلی";
export const MEDIA_NEXT_LABEL = "رسانه بعدی";
const CONTROL =
  "inline-flex min-h-12 min-w-12 items-center justify-center border border-border-control bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors duration-[180ms] enabled:hover:bg-surface-media disabled:cursor-not-allowed disabled:opacity-45 aria-disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none";
const IMAGE_SIZES = "(min-width: 1280px) 700px, (min-width: 1024px) 58vw, calc(100vw - 48px)";
type Candidate = { index: number; ready: boolean; request: number };

/** Changing products or their media retires all old loads and starts at the first frame. */
export function ProductMediaStage({ media }: { media: readonly ProductDetailMedia[] }) {
  const identity = media.map((item) => `${item.src}|${item.srcSet}`).join(";");
  return <MediaGallery key={identity} media={media} />;
}

/** Neutral 4:5 stage; the previous image remains visible until its successor is decoded. */
function MediaGallery({ media }: { media: readonly ProductDetailMedia[] }) {
  const t = useT();
  const locale = useLocale();
  const number = new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en");
  const [guard] = useState(createMediaSwapGuard);
  const [index, setIndex] = useState(0);
  const [revision, setRevision] = useState(0);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [failedIndex, setFailedIndex] = useState<number | null>(null);
  const [currentFailed, setCurrentFailed] = useState(false);
  const total = media.length;
  const current = media[index] ?? null;
  const pending = candidate ? media[candidate.index] : null;

  useEffect(() => () => guard.cancel(), [guard]);

  const finish = (next: Candidate) => {
    if (!guard.isCurrent(next.request)) return;
    guard.cancel();
    setIndex(next.index);
    // A successful retry also remounts the previously broken visible <img>.
    setRevision((value) => value + 1);
    setCandidate(null);
    setCurrentFailed(false);
    setFailedIndex(null);
  };

  useEffect(() => {
    if (!candidate) return;
    const next = candidate;
    // No network/decode wait may leave the controls busy indefinitely.
    // The short ready timer completes even when transition events are suppressed.
    const timer = window.setTimeout(
      () => {
        if (!guard.isCurrent(next.request)) return;
        guard.cancel();
        if (next.ready) {
          setIndex(next.index);
          setRevision((value) => value + 1);
          setCurrentFailed(false);
          setFailedIndex(null);
        } else {
          setFailedIndex(next.index);
        }
        setCandidate(null);
      },
      next.ready ? 260 : 20_000,
    );
    return () => window.clearTimeout(timer);
  }, [candidate, guard]);

  const choose = (next: number) => {
    if (candidate || next < 0 || next >= total) return;
    setFailedIndex(null);
    setCandidate({ index: next, ready: false, request: guard.start() });
  };
  const fail = (next: Candidate) => {
    if (!guard.isCurrent(next.request)) return;
    guard.cancel();
    setCandidate(null);
    setFailedIndex(next.index);
  };

  return (
    <div role="group" aria-label={t("گالری تصاویر محصول")} className="flex flex-col gap-4">
      <div
        className="relative aspect-[4/5] w-full overflow-hidden border border-border-subtle bg-surface-media"
        aria-busy={candidate !== null ? true : undefined}
      >
        {current ? (
          <div
            className={currentFailed ? "invisible h-full w-full p-4" : "h-full w-full p-4"}
            aria-hidden={currentFailed ? true : undefined}
          >
            <PublicMedia
              key={revision}
              media={current}
              fit="contain"
              priority={index === 0}
              sizes={IMAGE_SIZES}
              className="block h-full w-full"
              onError={() => {
                setCurrentFailed(true);
                // A failing old frame must not interrupt a pending successor.
                if (!candidate) setFailedIndex(index);
              }}
            />
          </div>
        ) : (
          <div className="flex h-full items-end p-6">
            <p className="text-sm text-text-secondary">{t(MEDIA_EMPTY_TEXT)}</p>
          </div>
        )}
        {currentFailed ? (
          <div className="absolute inset-0 flex items-end p-6">
            <p className="text-sm text-text-secondary">{t("تصویر در حال حاضر در دسترس نیست.")}</p>
          </div>
        ) : null}
        {candidate && pending ? (
          <div
            key={candidate.request}
            aria-hidden="true"
            className={
              "absolute inset-0 bg-surface-media p-4 transition-opacity duration-[240ms] motion-reduce:transition-none " +
              (candidate.ready ? "opacity-100" : "opacity-0")
            }
            onTransitionEnd={(event) => {
              if (
                event.target === event.currentTarget &&
                event.propertyName === "opacity" &&
                candidate.ready
              )
                finish(candidate);
            }}
          >
            <PublicMedia
              media={pending}
              alt=""
              fit="contain"
              eager
              sizes={IMAGE_SIZES}
              className="block h-full w-full"
              onError={() => fail(candidate)}
              onLoad={(event) => {
                const next = candidate;
                void prepareMediaSwap(event.currentTarget, () => guard.isCurrent(next.request))
                  .then((valid) => {
                    if (!valid) return;
                    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
                      finish(next);
                    } else {
                      setCandidate({ ...next, ready: true });
                    }
                  })
                  .catch(() => fail(next));
              }}
            />
          </div>
        ) : null}
      </div>
      {total > 1 ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={CONTROL}
            disabled={index === 0}
            aria-disabled={candidate !== null ? true : undefined}
            onClick={() => choose(index - 1)}
          >
            {t(MEDIA_PREV_LABEL)}
          </button>
          <button
            type="button"
            className={CONTROL}
            disabled={index >= total - 1}
            aria-disabled={candidate !== null ? true : undefined}
            onClick={() => choose(index + 1)}
          >
            {t(MEDIA_NEXT_LABEL)}
          </button>
          <p aria-live="polite" className="numeric text-sm text-text-secondary">
            {t("{current} از {total}", {
              current: number.format(index + 1),
              total: number.format(total),
            })}
          </p>
        </div>
      ) : null}
      <div className="min-h-7">
        {candidate && !candidate.ready ? (
          <p role="status" className="text-sm text-text-secondary">
            {t("در حال آماده‌سازی تصویر…")}
          </p>
        ) : null}
        {failedIndex !== null ? (
          <div role="alert" className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-status-error">
              {t("بارگذاری تصویر انجام نشد. می‌توانید دوباره تلاش کنید.")}
            </p>
            <button type="button" className={CONTROL} onClick={() => choose(failedIndex)}>
              {t("تلاش دوباره")}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

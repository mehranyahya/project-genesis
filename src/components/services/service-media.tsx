import type { ServiceMediaItem } from "@/lib/content/types";
import { useLocale, useT } from "@/lib/i18n/react";
import { localizeRawPath } from "@/lib/i18n/locale";
import { buildQuoteReferralPath } from "@/lib/portfolio-reference";
import { PublicMedia } from "@/components/media/public-media";

/** Static, bounded service images. No automatic gallery or unselected download. */
export function ServiceMedia({ items }: { items: readonly ServiceMediaItem[] }) {
  const locale = useLocale(),
    t = useT();
  if (items.length === 0) return null;
  return (
    <div className="mt-6 grid grid-cols-4 gap-6 md:grid-cols-8 lg:grid-cols-12">
      {items.map((item) => {
        const referral = item.portfolioReferenceId
          ? buildQuoteReferralPath(item.portfolioReferenceId)
          : null;
        const [pathname = "/quote", query] = referral?.split("?") ?? [];
        const href = localizeRawPath(pathname, locale) + (query ? `?${query}` : "");
        return (
          <figure
            key={item.media.src}
            className="col-span-4 border border-border-subtle bg-surface"
          >
            <PublicMedia
              media={item.media}
              className="block aspect-[3/2] w-full bg-surface-media"
              fit="contain"
              sizes="(min-width: 1280px) 400px, (min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
            />
            {referral ? (
              <figcaption className="p-4">
                <a
                  href={href}
                  className="ui-action"
                  aria-label={`${t("مشابه این را می‌خواهم")}: ${item.media.alt}`}
                >
                  {t("مشابه این را می‌خواهم")}
                </a>
              </figcaption>
            ) : null}
          </figure>
        );
      })}
    </div>
  );
}

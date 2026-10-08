import { LocaleLink, useT } from "@/lib/i18n/react";
import { PublicMedia } from "@/components/media/public-media";
import type { Media } from "@/lib/content/types";

export type HomeLinkTarget = "/grave-stones" | "/building-stone" | "/stoneworks";

/** One link per service, equal dimensions and no invented media. */
export function HomeLinkCard({
  label,
  description,
  to,
  index,
  media,
}: {
  label: string;
  description: string;
  to: HomeLinkTarget;
  index: string;
  media: Media | null;
}) {
  const t = useT();
  return (
    <LocaleLink
      to={to}
      className="group flex min-h-12 h-full flex-col border border-border-subtle bg-surface text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      {media ? (
        <div className="aspect-[4/5] overflow-hidden bg-surface-media">
          <PublicMedia
            media={media}
            sizes="(min-width: 1280px) 390px, (min-width: 768px) 30vw, calc(100vw - 48px)"
            className="block h-full w-full"
          />
        </div>
      ) : null}
      <div className="flex min-h-[17rem] flex-1 flex-col p-6 lg:p-8">
        <span aria-hidden="true" className="numeric mb-8 text-sm text-text-secondary">
          {index}
        </span>
        <h3 className="text-2xl font-medium">{label}</h3>
        <p className="mt-3 mb-6 text-sm text-text-secondary">{description}</p>
        <span className="mt-auto inline-flex min-h-12 items-center justify-between gap-4 border-t border-border-subtle pt-3 text-sm">
          {t("بررسی خدمات")}
          <span aria-hidden="true" className="link-arrow">
            →
          </span>
        </span>
      </div>
    </LocaleLink>
  );
}

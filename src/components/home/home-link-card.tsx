import { LocaleLink, useT } from "@/lib/i18n/react";
import { PublicMedia } from "@/components/media/public-media";
import type { Media } from "@/lib/content/types";

export type HomeLinkTarget = "/grave-stones" | "/building-stone" | "/stoneworks";

/** Equal geometry, hierarchy and interaction for the three services. */
export function HomeLinkCard({
  label,
  description,
  to,
  media,
}: {
  label: string;
  description: string;
  to: HomeLinkTarget;
  media?: Media | undefined;
}) {
  const t = useT();
  return (
    <LocaleLink
      to={to}
      className="group flex min-h-12 h-full flex-col border-t border-border-control bg-surface text-text-primary transition-colors duration-[180ms] hover:border-action-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none"
    >
      {media ? (
        <div className="aspect-[4/5] overflow-hidden bg-surface-media">
          <PublicMedia
            media={media}
            fit="contain"
            sizes="(min-width: 1280px) 395px, (min-width: 1024px) 32vw, (min-width: 768px) 46vw, calc(100vw - 40px)"
            className="block h-full w-full"
          />
        </div>
      ) : null}
      <div className="flex min-h-[17rem] flex-1 flex-col items-start px-6 py-8">
        <h3 className="text-2xl font-medium">{label}</h3>
        <p className="mt-4 max-w-[35ch] text-base text-text-secondary">{description}</p>
        <span className="mt-auto inline-flex min-h-12 items-center gap-3 pt-6 text-sm font-medium text-action-primary">
          {t("بررسی این خدمت")}
          <span
            aria-hidden="true"
            className="inline-block transition-transform duration-[180ms] group-hover:-translate-x-[3px] ltr:rotate-180 ltr:group-hover:translate-x-[3px] motion-reduce:transform-none motion-reduce:transition-none"
          >
            ←
          </span>
        </span>
      </div>
    </LocaleLink>
  );
}

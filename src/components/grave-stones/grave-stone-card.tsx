import { Link } from "@tanstack/react-router";

import { SIZE_FILTER_OPTIONS, TYPE_FILTER_OPTIONS } from "./grave-stone-filter";
import { PublicMedia } from "@/components/media/public-media";
import type { GraveStoneListItem } from "@/lib/grave-stone-list";

export const CARD_CTA_LABEL = "مشاهده و انتخاب";

const SIZE_LABELS = new Map(SIZE_FILTER_OPTIONS.map((option) => [option.value, option.label]));
const TYPE_LABELS = new Map(TYPE_FILTER_OPTIONS.map((option) => [option.value, option.label]));

export function GraveStoneCard({ item }: { item: GraveStoneListItem }) {
  return (
    <li className="col-span-4 md:col-span-4 lg:col-span-4">
      <article className="flex h-full flex-col gap-3 border border-border-subtle bg-surface p-4">
        {item.leadMedia ? (
          <div className="aspect-[4/5] overflow-hidden bg-surface-media">
            <PublicMedia
              media={item.leadMedia}
              fit="contain"
              sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
              className="block h-full w-full"
            />
          </div>
        ) : null}

        <h3 className="text-base font-bold text-text-primary">{item.title}</h3>

        {item.summary ? <p className="text-sm text-text-secondary">{item.summary}</p> : null}

        <p className="text-sm text-text-secondary">{TYPE_LABELS.get(item.type)}</p>

        {item.sizeCodes.length > 0 ? (
          <div>
            <h4 className="text-sm text-text-caption">اندازه‌ها</h4>
            <ul className="flex flex-wrap gap-2 pt-1">
              {item.sizeCodes.map((code) => (
                <li
                  key={code}
                  className="border border-border-subtle px-2 py-1 text-sm text-text-primary"
                >
                  {SIZE_LABELS.get(code)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {item.stoneCodes.length > 0 ? (
          <div>
            <h4 className="text-sm text-text-caption">سنگ</h4>
            <ul className="flex flex-wrap gap-2 pt-1">
              {item.stoneCodes.map((code) => (
                <li
                  key={code}
                  className="border border-border-subtle px-2 py-1 text-sm text-text-primary"
                >
                  <bdi dir="ltr">{code}</bdi>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <Link
          to="/grave-stones/$slug"
          params={{ slug: item.slug }}
          className="mt-auto inline-flex min-h-11 items-center justify-center border border-action-primary bg-action-primary px-5 py-2 text-sm font-bold text-text-inverse transition-colors duration-[180ms] hover:border-surface-inverse hover:bg-surface-inverse focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none"
        >
          {CARD_CTA_LABEL}
        </Link>
      </article>
    </li>
  );
}

import { useRouter } from "@tanstack/react-router";
import { LocaleLink } from "@/lib/i18n/react";

import { PRIMARY_CTA } from "@/lib/navigation";
import type { GuideBlock, GuideDetailModel, GuideInline, GuideListItem } from "@/lib/guides";
import { useT } from "@/lib/i18n/react";

export const GUIDES_TITLE = "راهنماها";
export const GUIDES_LOADING_LABEL = "در حال دریافت راهنماها";
export const GUIDES_EMPTY_TEXT = "در حال حاضر راهنمای منتشرشده‌ای موجود نیست.";
export const GUIDES_ERROR_TEXT = "دریافت راهنماها ممکن نشد.";
export const GUIDE_ERROR_TEXT = "دریافت راهنما ممکن نشد.";
export const GUIDES_RETRY_LABEL = "تلاش دوباره";
export const GUIDE_UPDATED_LABEL = "آخرین به‌روزرسانی";
export const GUIDES_BACK_LABEL = "بازگشت به راهنماها";

const SECTION =
  "mx-auto grid w-full max-w-[80rem] grid-cols-4 gap-x-4 gap-y-6 px-4 py-10 md:grid-cols-8 lg:grid-cols-12";
const FULL = "col-span-4 md:col-span-8 lg:col-span-12";
const ACTION =
  "inline-flex min-h-11 items-center justify-center border border-action-primary bg-action-primary px-5 py-2 text-sm font-bold text-text-inverse transition-colors duration-[180ms] hover:border-surface-inverse hover:bg-surface-inverse focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none";
const QUIET_LINK =
  "inline-flex min-h-11 items-center text-sm font-bold text-action-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/* ------------------------------------------------------------------ *
 * Safe markdown rendering — React elements only, never raw HTML.
 * ------------------------------------------------------------------ */

function InlineContent({ content }: { content: GuideInline[] }) {
  return (
    <>
      {content.map((node, index) =>
        node.kind === "link" ? (
          <a
            key={index}
            href={node.href}
            className="text-action-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            {...(node.href.startsWith("/") ? {} : { rel: "noopener noreferrer" })}
          >
            {node.text}
          </a>
        ) : (
          <span key={index}>{node.text}</span>
        ),
      )}
    </>
  );
}

export function GuideBody({ blocks }: { blocks: GuideBlock[] }) {
  if (blocks.length === 0) return null;
  return (
    <div className="flex flex-col gap-4">
      {blocks.map((block, index) => {
        if (block.kind === "heading") {
          const Heading = block.level === 2 ? "h2" : "h3";
          return (
            <Heading
              key={index}
              className={
                block.level === 2
                  ? "text-lg font-bold text-text-primary"
                  : "text-base font-bold text-text-primary"
              }
            >
              <InlineContent content={block.content} />
            </Heading>
          );
        }
        if (block.kind === "list") {
          const List = block.ordered ? "ol" : "ul";
          return (
            <List
              key={index}
              className={`me-4 flex list-inside flex-col gap-2 text-sm leading-[1.9] text-text-primary ${
                block.ordered ? "list-decimal" : "list-disc"
              }`}
            >
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  <InlineContent content={item} />
                </li>
              ))}
            </List>
          );
        }
        return (
          <p key={index} className="text-sm leading-[1.9] text-text-primary">
            <InlineContent content={block.content} />
          </p>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * States
 * ------------------------------------------------------------------ */

export function GuidesLoading() {
  const t = useT();
  return (
    <section className={SECTION} aria-busy="true" aria-label={t(GUIDES_LOADING_LABEL)}>
      <div
        aria-hidden="true"
        className={`${FULL} h-11 border border-border-subtle bg-surface-media`}
      />
      <div aria-hidden="true" className={`${FULL} flex flex-col gap-4`}>
        {[0, 1, 2].map((index) => (
          <div key={index} className="h-24 border border-border-subtle bg-surface-media" />
        ))}
      </div>
    </section>
  );
}

function ErrorState({ text }: { text: string }) {
  const t = useT();
  const router = useRouter();
  return (
    <section className={SECTION}>
      <div
        role="alert"
        className={`${FULL} flex flex-col items-start gap-4 border border-status-error bg-surface p-4`}
      >
        <h2 className="text-base font-bold text-text-primary">{text}</h2>
        <button type="button" onClick={() => void router.invalidate()} className={ACTION}>
          {t(GUIDES_RETRY_LABEL)}
        </button>
      </div>
    </section>
  );
}

export function GuidesError() {
  const t = useT();
  return <ErrorState text={t(GUIDES_ERROR_TEXT)} />;
}

export function GuideError() {
  const t = useT();
  return <ErrorState text={t(GUIDE_ERROR_TEXT)} />;
}

/* ------------------------------------------------------------------ *
 * Pages
 * ------------------------------------------------------------------ */

export function GuidesListPage({ items }: { items: GuideListItem[] }) {
  const t = useT();
  return (
    <section className={SECTION}>
      <div className={FULL}>
        <h1 className="text-2xl font-bold text-text-primary">{t(GUIDES_TITLE)}</h1>
      </div>

      {items.length === 0 ? (
        <div role="status" className={`${FULL} border border-border-subtle bg-surface p-4`}>
          <p className="text-sm text-text-primary">{t(GUIDES_EMPTY_TEXT)}</p>
        </div>
      ) : (
        <ul className={`${FULL} flex flex-col gap-4`}>
          {items.map((item) => (
            <li key={item.slug} className="border border-border-subtle bg-surface">
              <article className="flex flex-col gap-2 p-4">
                <h2 className="text-base font-bold text-text-primary">
                  <LocaleLink
                    to="/guides/$slug"
                    params={{ slug: item.slug }}
                    className="inline-flex min-h-11 items-center text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    {item.title}
                  </LocaleLink>
                </h2>
                {item.summary === null ? null : (
                  <p className="text-sm leading-[1.9] text-text-secondary">{item.summary}</p>
                )}
                {item.updatedAt === null || item.updatedLabel === null ? null : (
                  <p className="text-xs text-text-caption">
                    {t(GUIDE_UPDATED_LABEL)}:{" "}
                    <time dateTime={item.updatedAt}>{item.updatedLabel}</time>
                  </p>
                )}
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function GuideDetailPage({ guide }: { guide: GuideDetailModel }) {
  const t = useT();
  return (
    <section className={SECTION}>
      <article className={`${FULL} flex flex-col gap-6`}>
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold text-text-primary">{guide.title}</h1>
          {guide.updatedAt === null || guide.updatedLabel === null ? null : (
            <p className="text-xs text-text-caption">
              {t(GUIDE_UPDATED_LABEL)}: <time dateTime={guide.updatedAt}>{guide.updatedLabel}</time>
            </p>
          )}
          {guide.summary === null ? null : (
            <p className="text-sm leading-[1.9] text-text-secondary">{guide.summary}</p>
          )}
        </header>

        <GuideBody blocks={guide.blocks} />

        <div className="flex flex-col items-start gap-4 border-t border-border-subtle pt-6">
          <LocaleLink to={PRIMARY_CTA.to} className={ACTION}>
            {PRIMARY_CTA.label}
          </LocaleLink>
          <LocaleLink to="/guides" className={QUIET_LINK}>
            {t(GUIDES_BACK_LABEL)}
          </LocaleLink>
        </div>
      </article>
    </section>
  );
}

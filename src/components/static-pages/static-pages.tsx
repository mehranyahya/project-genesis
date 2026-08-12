import type { ReactNode } from "react";

import { GuideBody } from "@/components/guides/guides";
import type { ContactEntry, StaticPageModel } from "@/lib/static-pages";
import { NOT_FOUND_MARKER } from "@/lib/static-pages";
import { useT } from "@/lib/i18n/react";

const SECTION =
  "mx-auto grid w-full max-w-[80rem] grid-cols-4 gap-x-4 gap-y-6 px-4 py-10 md:grid-cols-8 lg:grid-cols-12";
const FULL = "col-span-4 md:col-span-8 lg:col-span-12";

/**
 * Neutral structural state for a page with no published content.
 * No copy, no CTA, no imagery, no fabricated business data.
 */
export function ContentBlockedState() {
  return (
    <section className={SECTION}>
      <div
        aria-hidden="true"
        className={`${FULL} grid grid-cols-4 gap-4 md:grid-cols-8 lg:grid-cols-12`}
      >
        <div className="col-span-4 h-11 border border-border-subtle bg-surface-media md:col-span-8 lg:col-span-12" />
        <div className="col-span-4 h-24 border border-border-subtle bg-surface-media md:col-span-8 lg:col-span-12" />
      </div>
    </section>
  );
}

/** Renders a real page: exactly one H1 from page.title, body from page.body. */
export function StaticPageView({
  page,
  children,
}: {
  page: StaticPageModel;
  children?: ReactNode;
}) {
  return (
    <section className={SECTION}>
      <article className={`${FULL} flex flex-col gap-6`}>
        <h1 className="text-2xl font-bold text-text-primary">{page.title}</h1>
        <GuideBody blocks={page.blocks} />
        {children}
      </article>
    </section>
  );
}

/** Contact details, strictly from the Site adapter. Empty input renders nothing. */
export function ContactDetailsList({ entries }: { entries: ContactEntry[] }) {
  const t = useT();
  if (entries.length === 0) return null;

  return (
    <dl className="flex flex-col gap-3 border-t border-border-subtle pt-6">
      {entries.map((entry) => (
        <div key={entry.key} className="flex flex-col gap-1">
          <dt className="text-xs font-bold text-text-caption">{t(entry.label)}</dt>
          <dd className="text-sm text-text-primary">
            {entry.href === null ? (
              <bdi>{entry.value}</bdi>
            ) : (
              <a
                href={entry.href}
                className="inline-flex min-h-11 items-center text-action-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                {...(entry.kind === "link" ? { rel: "noopener noreferrer" } : {})}
              >
                <bdi>{entry.value}</bdi>
              </a>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Not-found UI. Without a real page only the structural marker is shown. */
export function NotFoundView({ page }: { page: StaticPageModel | null }) {
  if (!page) {
  const t = useT();
    return (
      <section className={SECTION}>
        <div className={FULL}>
          <p className="text-4xl font-bold text-text-primary">{NOT_FOUND_MARKER}</p>
        </div>
      </section>
    );
  }
  return <StaticPageView page={page} />;
}

import { LocaleLink } from "@/lib/i18n/react";

export type HomeLinkTarget =
  "/grave-stones" | "/grave-stones/custom" | "/portfolio" | "/building-stone" | "/guides";

/** Whole-surface link card. One interactive element, no nested links. */
export function HomeLinkCard({ label, to }: { label: string; to: HomeLinkTarget }) {
  return (
    <LocaleLink
      to={to}
      className="col-span-4 flex min-h-11 items-center border border-border-subtle bg-surface px-4 py-5 text-base font-bold text-text-primary transition-colors duration-[180ms] hover:border-border-control hover:bg-surface-media focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none"
      activeProps={{ className: "border-action-primary" }}
    >
      {label}
    </LocaleLink>
  );
}

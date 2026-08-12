import { useT } from "@/lib/i18n/react";
import type { Site } from "@/lib/content/types";

/**
 * Contact links render strictly from the official Site adapter value.
 * When the adapter returns null — the baseline — nothing is rendered at all:
 * no labels, no placeholders, no fabricated destinations.
 */
export interface ContactLinksProps {
  site: Site | null;
  className?: string;
  linkClassName?: string;
}

export function ContactLinks({ site, className, linkClassName }: ContactLinksProps) {
  const t = useT();
  if (!site) return null;

  const entries: { key: string; label: string; href: string }[] = [];

  if (site.phone) entries.push({ key: "phone", label: t("تلفن"), href: `tel:${site.phone}` });
  if (site.whatsappUrl) {
    entries.push({ key: "whatsapp", label: t("واتساپ"), href: site.whatsappUrl });
  }
  if (site.telegram) entries.push({ key: "telegram", label: t("تلگرام"), href: site.telegram });

  if (entries.length === 0) return null;

  return (
    <ul className={className}>
      {entries.map((entry) => (
        <li key={entry.key}>
          <a
            href={entry.href}
            className={
              linkClassName ??
              "inline-flex min-h-11 items-center underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
            }
          >
            {entry.label}: <bdi>{entry.href.startsWith("tel:") ? site.phone : entry.label}</bdi>
          </a>
        </li>
      ))}
    </ul>
  );
}

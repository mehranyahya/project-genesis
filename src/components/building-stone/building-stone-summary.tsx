import type { ReactNode } from "react";

import type { BuildingStoneValues } from "@/lib/building-stone";
import { BUILDING_STONE_SUMMARY_HEADING, buildBuildingStoneSummary } from "@/lib/building-stone";
import { useT } from "@/lib/i18n/react";

/**
 * The non-personal selection summary. Only present, valid values are shown; an
 * absent value is omitted rather than defaulted, and the shared note, any
 * personal data and any price are never rendered here.
 */
export function BuildingStoneSummary({ values }: { values: BuildingStoneValues }): ReactNode {
  const t = useT();
  const rows = buildBuildingStoneSummary(values);
  if (rows.length === 0) return null;

  return (
    <section className="border border-border-subtle bg-surface p-4">
      <h2 className="text-base font-bold text-text-primary">{BUILDING_STONE_SUMMARY_HEADING}</h2>
      <dl className="flex flex-col gap-2 pt-3">
        {rows.map((row) => (
          <div key={row.key} className="flex flex-wrap items-baseline gap-2">
            <dt className="text-sm text-text-secondary">{t(row.label)}</dt>
            <dd className="text-sm font-bold text-text-primary">
              {row.latin ? <bdi dir="ltr">{t(row.value)}</bdi> : row.value}
              {row.unit === null ? null : <span className="pr-1 font-normal">{row.unit}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

  const t = useT();